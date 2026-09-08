import type { AxiosInstance } from "axios";
import { Base44Error } from "../utils/axios-client.js";
import { readSseFrames } from "../utils/sse.js";
import type {
  BuilderEvent,
  BuilderEventType,
  BuilderGrant,
  BuilderMessage,
  BuilderMessagePage,
  BuilderResponse,
  BuilderSession,
  BuilderSessionReader,
  BuilderState,
  BuilderStatus,
  BuilderToolCall,
  BuilderTurn,
  BuilderTurnRef,
  BuilderWaitingKind,
  CreateBuilderGrantOptions,
  ListBuilderMessagesOptions,
  RespondToBuilderOptions,
  SendBuilderMessageOptions,
  SubscribeToBuilderOptions,
  WaitForTurnOptions,
} from "./builder.types.js";

/** What the build module needs to talk to one app's session. @internal */
export interface BuilderSessionDeps {
  /** An Axios client based at `${serverUrl}/api`. */
  axios: AxiosInstance;
  /** The app whose builder session this is. */
  appId: string;
  /** Used to build the absolute stream URL, which `fetch` needs. */
  serverUrl: string;
  /**
   * Re-read before every request and every stream (re)connect.
   *
   * A getter rather than a string because both credentials that reach here
   * rotate: a grant expires inside a single build, and a principal's access
   * token lives an hour. Capturing either would work right up until the first
   * build long enough to matter.
   *
   * Omitted when the Axios client already carries a static credential.
   */
  getToken?: () => string | Promise<string> | undefined;
}

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<BuilderEventType>([
  "state.changed",
  "turn.started",
  "turn.finished",
  "message.updated",
  "error",
  "conversation.reset",
  "files.changed",
]);

// A turn in one of these has stopped. `blocked` counts: it is out of credits,
// which resumes on a top-up rather than on anything a caller can await.
const SETTLED_STATUSES: ReadonlySet<string> = new Set(["idle", "error", "blocked"]);

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

// Retry only what a retry can fix. Everything else — a rejected credential, a
// session the server will not serve — would fail identically forever, and
// hammering it is worse than surfacing it.
const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

function toState(raw: unknown): BuilderState {
  const source = asRecord(raw);
  const state: BuilderState = { status: source.status as BuilderStatus };
  const waiting = asRecord(source.waiting_on);
  const waitpointId = asString(waiting.waitpoint_id);
  if (waitpointId) {
    const toolName = asString(waiting.tool_name);
    state.waitingOn = {
      kind: waiting.kind as BuilderWaitingKind,
      waitpointId,
      ...(toolName ? { toolName } : {}),
    };
  }
  const reason = asString(source.reason);
  if (reason) state.reason = reason;
  const turnId = asString(source.turn_id);
  if (turnId) state.turnId = turnId;
  const errorSource = asString(source.error_source);
  if (errorSource) state.errorSource = errorSource;
  const detail = asString(source.detail);
  if (detail) state.detail = detail;
  return state;
}

function toToolCall(raw: unknown): BuilderToolCall {
  const source = asRecord(raw);
  return {
    id: asString(source.id) ?? "",
    name: asString(source.name) ?? "",
    status: asString(source.status) ?? "",
    requiresUserInput: Boolean(source.requires_user_input),
    waitingOnKind: (source.waiting_on_kind as BuilderToolCall["waitingOnKind"]) ?? null,
    // Kept as the raw string the model produced. It arrives mid-generation, so
    // it is routinely incomplete JSON and parsing it here would throw on the
    // ticks that matter most.
    arguments: asString(source.arguments) ?? "",
    display: (source.display as BuilderToolCall["display"]) ?? null,
  };
}

function toMessage(raw: unknown): BuilderMessage {
  const source = asRecord(raw);
  const toolCalls = source.tool_calls;
  return {
    messageId: asString(source.message_id) ?? "",
    role: source.role as BuilderMessage["role"],
    content: asString(source.content) ?? "",
    toolCalls: Array.isArray(toolCalls) ? toolCalls.map(toToolCall) : [],
  };
}

/**
 * Projects one SSE frame onto a typed event, or drops it.
 *
 * Unrecognised types are dropped here rather than passed through. The contract
 * requires clients to ignore them, so doing it once at the boundary is what lets
 * {@link BuilderEvent} stay a closed union that narrows on `type` — the alternative
 * is an open union whose `data` is `unknown` in every branch.
 */
function toBuildEvent(data: string, frameId?: string): BuilderEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const source = asRecord(parsed);
  const type = asString(source.type);
  if (!type || !KNOWN_EVENT_TYPES.has(type)) return null;

  const base = { seq: asString(source.seq) ?? frameId ?? "" };
  const turnId = asString(source.turn_id);
  if (type === "message.updated") {
    return { ...base, turnId, type, data: toMessage(source.data) };
  }
  if (type === "conversation.reset" || type === "files.changed") {
    return { ...base, turnId, type, data: {} };
  }
  return {
    ...base,
    turnId,
    type: type as "state.changed" | "turn.started" | "turn.finished" | "error",
    data: toState(source.data),
  };
}

async function streamFailure(response: Response): Promise<Base44Error> {
  const body = await response.text().catch(() => "");
  let detail = body;
  try {
    detail = asString(asRecord(JSON.parse(body)).detail) ?? body;
  } catch {
    /* a non-JSON error body is still the best message available */
  }
  return new Base44Error(
    detail || `Build stream failed with ${response.status}`,
    response.status,
    "BUILDER_STREAM_FAILED",
    body,
    undefined
  );
}

/** Every route in the family hangs off this. */
const builderPath = (appId: string) => `/v1/apps/${encodeURIComponent(appId)}/build`;

/**
 * The credential, resolved per call.
 *
 * Empty when there is no getter, which leaves whatever the Axios client already
 * carries in place.
 */
async function bearer(
  getToken: BuilderSessionDeps["getToken"]
): Promise<Record<string, string>> {
  const token = getToken ? await getToken() : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

/**
 * The read half of a builder session — what a grant can do.
 *
 * @param deps - Transport, app id and credential.
 * @returns The read-only session.
 * @internal
 */
export function createBuilderSessionReader(
  deps: BuilderSessionDeps
): BuilderSessionReader {
  const { axios, appId, getToken } = deps;
  const path = builderPath(appId);
  const eventsUrl = `${deps.serverUrl.replace(/\/+$/, "")}/api${path}/events`;
  const authHeaders = () => bearer(getToken);

  const getState = async (): Promise<BuilderState> => {
    const response = await axios.get(`${path}/state`, {
      headers: await authHeaders(),
    });
    return toState(asRecord(response).state);
  };

  const getTurn = async (turnId: string): Promise<BuilderTurn> => {
    const response = asRecord(
      await axios.get(`${path}/turns/${encodeURIComponent(turnId)}`, {
        headers: await authHeaders(),
      })
    );
    return {
      turnId: asString(response.turn_id) ?? turnId,
      live: Boolean(response.live),
      state: toState(response.state),
    };
  };

  const listMessages = async (
    options: ListBuilderMessagesOptions = {}
  ): Promise<BuilderMessagePage> => {
    const params: Record<string, string | number> = {};
    if (options.after !== undefined) params.after = options.after;
    if (options.limit !== undefined) params.limit = options.limit;
    const response = asRecord(
      await axios.get(`${path}/messages`, {
        params,
        headers: await authHeaders(),
      })
    );
    const messages = response.messages;
    return {
      messages: Array.isArray(messages) ? messages.map(toMessage) : [],
      nextAfter: asString(response.next_after) ?? null,
    };
  };

  const subscribe = (
    onEvent: (event: BuilderEvent) => void,
    options: SubscribeToBuilderOptions = {}
  ): (() => void) => {
    const controller = new AbortController();
    let cursor = options.lastEventId;
    let stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      controller.abort();
    };
    options.signal?.addEventListener("abort", stop, { once: true });

    const fail = (error: Error) => {
      stop();
      options.onError?.(error);
    };

    void (async () => {
      let attempt = 0;
      while (!stopped) {
        try {
          const headers: Record<string, string> = {
            Accept: "text/event-stream",
            ...(await authHeaders()),
          };
          // Resuming from the cursor is what makes a dropped connection cost
          // nothing: the server replays what was missed before any live event.
          // Without it every reconnect would replay the whole retained window.
          if (cursor) headers["Last-Event-ID"] = cursor;

          const response = await globalThis.fetch(eventsUrl, {
            method: "GET",
            headers,
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok || !response.body) throw await streamFailure(response);

          attempt = 0;
          for await (const frame of readSseFrames(response.body)) {
            if (stopped) return;
            if (frame.id) cursor = frame.id;
            const event = toBuildEvent(frame.data, frame.id);
            if (event) onEvent(event);
          }
          // The body ended without an error. A drained deploy looks exactly like
          // this, so it is a reconnect rather than a completion — a build has no
          // end the transport knows about.
        } catch (error) {
          if (stopped) return;
          if (error instanceof Base44Error && !isRetryableStatus(error.status)) {
            fail(error);
            return;
          }
        }
        if (stopped) return;
        const backoff = Math.min(
          RECONNECT_MAX_MS,
          RECONNECT_BASE_MS * 2 ** attempt++
        );
        // Jittered, so a fleet of partner workers reconnecting after one outage
        // does not arrive together.
        await delay(backoff * (0.5 + Math.random() / 2), controller.signal);
      }
    })();

    return stop;
  };

  async function* iterate(
    options: SubscribeToBuilderOptions = {}
  ): AsyncGenerator<BuilderEvent, void, undefined> {
    const queue: BuilderEvent[] = [];
    // Held in an object because the generator reads what the callback writes,
    // and control-flow narrowing does not follow a closure assignment.
    const shared: { failure: Error | null; ended: boolean } = {
      failure: null,
      ended: false,
    };
    let wake: (() => void) | null = null;

    const unsubscribe = subscribe(
      (event) => {
        queue.push(event);
        wake?.();
      },
      {
        ...options,
        onError: (error) => {
          shared.failure = error;
          shared.ended = true;
          wake?.();
        },
      }
    );

    try {
      for (;;) {
        while (queue.length) yield queue.shift()!;
        if (shared.failure) throw shared.failure;
        if (shared.ended) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
    } finally {
      unsubscribe();
    }
  }

  const stream = (
    options?: SubscribeToBuilderOptions
  ): AsyncIterable<BuilderEvent> => ({
    [Symbol.asyncIterator]: () => iterate(options),
  });

  async function* iterateText(
    options?: SubscribeToBuilderOptions
  ): AsyncGenerator<string, void, undefined> {
    const sent = new Map<string, string>();
    for await (const event of stream(options)) {
      switch (event.type) {
        case "message.updated": {
          if (event.data.role !== "assistant") break;
          const previous = sent.get(event.data.messageId) ?? "";
          const current = event.data.content;
          if (current === previous) break;
          sent.set(event.data.messageId, current);
          // Streaming text only ever extends. A snapshot that is not an
          // extension means the message was rewritten — a retry, an edit — and a
          // chat surface has already made what it printed immutable, so the
          // honest rendering is a new paragraph rather than a patch.
          yield current.startsWith(previous)
            ? current.slice(previous.length)
            : `\n\n${current}`;
          break;
        }
        case "turn.finished":
        case "error":
          return;
        case "turn.started":
        case "state.changed":
          // `blocked` ends it too. No `turn.finished` follows a turn that ran
          // out of credits, so waiting for one would hang the loop.
          if (event.data.status === "blocked") return;
          break;
        default:
          break;
      }
    }
  }

  const streamText = (
    options?: SubscribeToBuilderOptions
  ): AsyncIterable<string> => ({
    [Symbol.asyncIterator]: () => iterateText(options),
  });

  const waitForTurn = (
    turnId: string,
    options: WaitForTurnOptions = {}
  ): Promise<BuilderState> =>
    new Promise<BuilderState>((resolve, reject) => {
      let settled = false;
      const finish = (act: () => void) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        act();
      };

      const unsubscribe = subscribe(
        (event) => {
          // Only the events whose payload is a state can settle a turn. Written
          // as the positive set so the union narrows to that arm.
          if (
            event.type !== "turn.started" &&
            event.type !== "turn.finished" &&
            event.type !== "state.changed" &&
            event.type !== "error"
          ) {
            return;
          }
          if (event.turnId !== turnId && event.data.turnId !== turnId) return;
          if (SETTLED_STATUSES.has(event.data.status)) {
            finish(() => resolve(event.data));
          }
        },
        { signal: options.signal, onError: (error) => finish(() => reject(error)) }
      );

      options.signal?.addEventListener(
        "abort",
        () =>
          finish(() =>
            reject(
              options.signal?.reason instanceof Error
                ? options.signal.reason
                : new Error("Waiting for the build turn was aborted")
            )
          ),
        { once: true }
      );

      // The turn may already have ended — between the write returning and this
      // call, or before a resumed process got here — and a finished turn emits
      // nothing more to wait for. Asked after subscribing, so the transition
      // cannot fall between the two.
      getTurn(turnId).then(
        (turn) => {
          if (!turn.live && SETTLED_STATUSES.has(turn.state.status)) {
            finish(() => resolve(turn.state));
          }
        },
        (error: unknown) => {
          // 404 means the turn is not in the retained window, which a running
          // turn also looks like right after it starts. Keep waiting.
          if (!(error instanceof Base44Error) || error.status !== 404) {
            finish(() => reject(error as Error));
          }
        }
      );
    });

  return {
    appId,
    getState,
    listMessages,
    getTurn,
    waitForTurn,
    subscribe,
    stream,
    streamText,
  };
}

/**
 * A builder session with the writes, for a credential that may start turns.
 *
 * @param deps - Transport, app id and credential.
 * @returns The full session.
 * @internal
 */
export function createBuilderSessionModule(deps: BuilderSessionDeps): BuilderSession {
  const { axios, appId, getToken, serverUrl } = deps;
  const path = builderPath(appId);
  const reader = createBuilderSessionReader(deps);
  const authHeaders = () => bearer(getToken);

  const writeHeaders = async (
    idempotencyKey?: string
  ): Promise<Record<string, string>> => ({
    ...(await authHeaders()),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  });

  // The server answers with the path, not a URL. Joining it here means a partner
  // can hand the result to a client that is not this SDK without knowing which
  // host minted it.
  const absolute = (url: string | undefined): string => {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (!/^https?:\/\//i.test(serverUrl)) return url;
    return new URL(url, serverUrl).toString();
  };

  return {
    ...reader,

    async sendMessage(
      content: string,
      options: SendBuilderMessageOptions = {}
    ): Promise<BuilderTurnRef> {
      const body: Record<string, unknown> = { content };
      if (options.fileUrls !== undefined) body.file_urls = options.fileUrls;
      const response = asRecord(
        await axios.post(`${path}/messages`, body, {
          headers: await writeHeaders(options.idempotencyKey),
        })
      );
      return {
        sessionId: asString(response.session_id) ?? appId,
        turnId: asString(response.turn_id) ?? "",
      };
    },

    async respond(
      response: BuilderResponse,
      options: RespondToBuilderOptions = {}
    ): Promise<BuilderTurnRef> {
      const body: Record<string, unknown> = {
        kind: response.kind,
        waitpoint_id: response.waitpointId,
      };
      if (response.kind === "approval") {
        body.approved = response.approved;
      } else if (response.value !== undefined) {
        // Omitted rather than sent as null: leaving it out is how you decline,
        // and an explicit null would be a second way to say the same thing.
        body.value = response.value;
      }
      const result = asRecord(
        await axios.post(`${path}/responses`, body, {
          headers: await writeHeaders(options.idempotencyKey),
        })
      );
      return {
        sessionId: asString(result.session_id) ?? appId,
        turnId: asString(result.turn_id) ?? "",
      };
    },

    async cancel(): Promise<void> {
      await axios.post(`${path}/cancel`, undefined, {
        headers: await authHeaders(),
      });
    },

    async createGrant(options: CreateBuilderGrantOptions = {}): Promise<BuilderGrant> {
      const body: Record<string, unknown> = {};
      if (options.ttlSeconds !== undefined) {
        body.token_ttl_seconds = options.ttlSeconds;
      }
      if (options.subject !== undefined) body.subject = options.subject;
      const response = asRecord(
        await axios.post(`${path}/grants`, body, {
          headers: await authHeaders(),
        })
      );
      return {
        sessionId: asString(response.session_id) ?? appId,
        grantId: asString(response.grant_id) ?? "",
        token: asString(response.token) ?? "",
        expiresIn: Number(response.expires_in),
        expiresAt: asString(response.expires_at) ?? "",
        eventsUrl: absolute(asString(response.events_url)),
      };
    },

    async revokeGrant(grantId: string): Promise<void> {
      await axios.delete(`${path}/grants/${encodeURIComponent(grantId)}`, {
        headers: await authHeaders(),
      });
    },
  };
}
