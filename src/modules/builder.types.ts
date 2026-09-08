/**
 * Where a build turn stands.
 *
 * `blocked` is not a failure and not a question: the turn stopped on a condition
 * no answer clears — being out of credits is the one that exists today — and it
 * resumes once that condition does. `reason` says which.
 */
export type BuilderStatus = "idle" | "running" | "waiting" | "blocked" | "error";

/**
 * Why a turn is suspended, and therefore what to render.
 *
 * All three are answerable with {@link BuilderSession.respond | respond()}, and each
 * wants a different affordance: a form, a picker, an approve/reject. Being out of
 * credits is deliberately *not* one of these — it is `blocked`, because no
 * response resolves it.
 */
export type BuilderWaitingKind = "input" | "choice" | "approval";

/**
 * The waitpoint holding a turn open.
 */
export interface BuilderWaitingOn {
  /** What kind of answer resolves it. */
  kind: BuilderWaitingKind;
  /** The id to answer with. It is the tool call's id, and it goes stale when the turn moves on. */
  waitpointId: string;
  /** The tool that asked, when the server names one. Display only. */
  toolName?: string;
}

/**
 * A builder session's current state.
 */
export interface BuilderState {
  /** Where the turn stands. */
  status: BuilderStatus;
  /** Present only while `status` is `"waiting"`. */
  waitingOn?: BuilderWaitingOn;
  /** Why a `blocked` turn is blocked. `"quota"` is out of credits. */
  reason?: string;
  /** The turn this state belongs to, so a state arriving after a reconnect can be told from a stale one. */
  turnId?: string;
  /** Where an `error` came from. Diagnostic, not a code to branch on. */
  errorSource?: string;
  /**
   * What went wrong, in prose.
   *
   * Carried by an `error` raised after the write already returned — a turn that
   * dies outside a request has no response to fail, so without this the stream
   * would simply stop, which is indistinguishable from a slow build.
   */
  detail?: string;
}

/**
 * One tool call inside a streamed message.
 */
export interface BuilderToolCall {
  /** The call's id. When this call is a waitpoint, this is the `waitpointId` to answer with. */
  id: string;
  /** The tool's name. */
  name: string;
  /** The call's lifecycle state, as the builder reports it. */
  status: string;
  /** Whether this call is waiting on a person. */
  requiresUserInput: boolean;
  /** What kind of answer it wants, when it is waiting. */
  waitingOnKind: BuilderWaitingKind | null;
  /**
   * The call's arguments, as the raw JSON string the model produced.
   *
   * A string rather than a parsed object because it arrives mid-generation and
   * is therefore often incomplete JSON — parsing it before the call settles
   * throws. Published at all because an interrupt is otherwise unanswerable:
   * the questions to pick between, the secrets to fill in and the packages to
   * approve all live here.
   *
   * Empty when the tool's display projection withholds its details.
   */
  arguments: string;
  /** How the builder itself renders this call, when it says. `null` when it does not. */
  display: Record<string, unknown> | null;
}

/**
 * One message in a build conversation.
 *
 * The same shape from the stream and from {@link BuilderSessionReader.listMessages | listMessages()},
 * so reconciling after an outage cannot produce a different transcript than the
 * one that was streamed.
 */
export interface BuilderMessage {
  /** The message's id, and the key it is replaced under. */
  messageId: string;
  /** Who wrote it. A partner's own user messages come back on the stream too. */
  role: "assistant" | "user";
  /** The message text. */
  content: string;
  /** The tool calls this message carries. */
  toolCalls: BuilderToolCall[];
}

/**
 * The event types a builder session emits.
 */
export type BuilderEventType =
  | "state.changed"
  | "turn.started"
  | "turn.finished"
  | "message.updated"
  | "error"
  | "conversation.reset"
  | "files.changed";

/** Fields every event carries. */
interface BuilderEventBase {
  /**
   * The journal sequence. Monotonic per session, and the resume cursor — the SDK
   * tracks it for you across reconnects.
   */
  seq: string;
  /** The turn this event belongs to. Absent on the two out-of-turn directives. */
  turnId?: string;
}

/**
 * One event from a builder session.
 *
 * A discriminated union: switch on `type` and `data` narrows with it.
 *
 * **`message.updated` is a snapshot, not a delta.** The builder flushes the whole
 * in-progress assistant message on every tick, so the contract is last-write-wins
 * per `messageId` — replace what you hold, never append. Text still arrives
 * progressively; there is simply no delta event.
 * {@link BuilderSessionReader.streamText | streamText()} is the append-shaped view,
 * for UIs that want one.
 */
export type BuilderEvent =
  | ({
      /** A turn started, finished, changed state, or failed. */
      type: "turn.started" | "turn.finished" | "state.changed" | "error";
      data: BuilderState;
    } & BuilderEventBase)
  | ({
      /** A message was written or rewritten. Replace what you hold for this `messageId`. */
      type: "message.updated";
      data: BuilderMessage;
    } & BuilderEventBase)
  | ({
      /**
       * The conversation was rewritten underneath you (a checkpoint restore, a
       * branch sync), or the app's files changed outside a turn. Both carry no
       * data: the only useful response is to re-read.
       */
      type: "conversation.reset" | "files.changed";
      data: Record<string, never>;
    } & BuilderEventBase);

/**
 * An answer to a waitpoint.
 *
 * Discriminated on `kind`, which is checked against the *live* waitpoint: sending
 * an approval to a question is a 409 rather than a silent coercion. `waitpointId`
 * comes from {@link BuilderWaitingOn.waitpointId}, and a stale one is also a 409 —
 * so read the current state rather than remembering an id across turns.
 */
export type BuilderResponse =
  | {
      /** Answering an approval: a decision, and nothing else. */
      kind: "approval";
      /** The waitpoint to answer. */
      waitpointId: string;
      /** Whether to proceed. */
      approved: boolean;
    }
  | {
      /** Answering a question or a picker: the answer itself. */
      kind: "input" | "choice";
      /** The waitpoint to answer. */
      waitpointId: string;
      /**
       * The answer.
       *
       * Omitting it *declines* the question, which is the only sensible reading
       * of "no answer" — not a way to send an empty one.
       */
      value?: Record<string, unknown>;
    };

/** Options for {@link BuilderSession.sendMessage | sendMessage()}. */
export interface SendBuilderMessageOptions {
  /** Attachments, as URLs the builder can fetch. */
  fileUrls?: string[];
  /**
   * A key that makes a retry safe.
   *
   * A turn costs real credits, and retrying a 202 that never arrived is the
   * normal reaction to a timeout — so name the turn and a retry rejoins it
   * instead of buying a second one. It becomes the `turnId`.
   *
   * Without one the server assigns an id and you keep followability but lose
   * retry safety. The SDK does not invent one, because a key it generated would
   * differ on the retry and protect nothing.
   */
  idempotencyKey?: string;
}

/** Options for {@link BuilderSession.respond | respond()}. */
export interface RespondToBuilderOptions {
  /** See {@link SendBuilderMessageOptions.idempotencyKey}. */
  idempotencyKey?: string;
}

/** The turn a write started. */
export interface BuilderTurnRef {
  /** The session the turn runs in. Always the app id. */
  sessionId: string;
  /**
   * The turn's id.
   *
   * Carried on every event the turn emits, and the id
   * {@link BuilderSessionReader.getTurn | getTurn()} and
   * {@link BuilderSessionReader.waitForTurn | waitForTurn()} take.
   */
  turnId: string;
}

/** One turn's outcome. */
export interface BuilderTurn {
  /** The turn asked about. */
  turnId: string;
  /** Whether this is the turn running right now, rather than a settled one read back from the journal. */
  live: boolean;
  /** The state the turn is in, or the last one it reached. */
  state: BuilderState;
}

/** Options for {@link BuilderSession.createGrant | createGrant()}. */
export interface CreateBuilderGrantOptions {
  /**
   * How long the grant lives.
   *
   * Short on purpose. Minting is the steady state, not a one-off, and a build
   * routinely outlives one grant.
   *
   * @defaultValue `900` (15 minutes), server-side. Maximum `3600`.
   */
  ttlSeconds?: number;
  /**
   * Your own identifier for whoever the grant is for.
   *
   * Opaque, never interpreted, and read on no authorization path — it rides the
   * grant only so your logs and ours line up.
   */
  subject?: string;
}

/**
 * A read-only credential for one builder session.
 *
 * The only Base44 credential that should ever reach a browser: it cannot send a
 * message, answer a waitpoint, cancel a turn, or touch any other app. That
 * asymmetry is the design — reads go browser to Base44 directly, writes go
 * through your server — and it is why a leaked grant cannot spend your credits.
 */
export interface BuilderGrant {
  /** The session it reads. Always the app id. */
  sessionId: string;
  /** The grant's id, for {@link BuilderSession.revokeGrant | revokeGrant()}. */
  grantId: string;
  /** The token itself. Hand this to the browser; hand it nothing else. */
  token: string;
  /** Seconds until it expires. Re-mint before then rather than after. */
  expiresIn: number;
  /** When it expires, as an ISO timestamp. */
  expiresAt: string;
  /** The stream endpoint, absolute. Useful for a client that is not this SDK. */
  eventsUrl: string;
}

/** Options for {@link BuilderSessionReader.listMessages | listMessages()}. */
export interface ListBuilderMessagesOptions {
  /**
   * The cursor from a previous page's `nextAfter`.
   *
   * A timestamp seek rather than an offset, so a message appended while you walk
   * cannot shift the pages beneath you.
   */
  after?: string;
  /**
   * How many rows to read.
   *
   * Internal messages are dropped from the rendered page, so a page can hold
   * fewer than this and still have a next cursor. Follow `nextAfter` rather than
   * counting.
   *
   * @defaultValue `50`, server-side. Maximum `200`.
   */
  limit?: number;
}

/** One page of conversation history. */
export interface BuilderMessagePage {
  /** The page, oldest first. */
  messages: BuilderMessage[];
  /** The cursor for the next page, or `null` at the end of the history. */
  nextAfter: string | null;
}

/** Options for the subscription forms. */
export interface SubscribeToBuilderOptions {
  /**
   * Where to resume from.
   *
   * Only needed to resume across *process* restarts: within one subscription the
   * SDK tracks the cursor itself, so a dropped connection already resumes where
   * it left off. Persist the `seq` of the last event you handled and pass it here
   * to pick a build back up after a deploy.
   *
   * Omitted, the stream replays the whole retained window — which converges,
   * since messages are last-write-wins, but re-delivers everything first.
   */
  lastEventId?: string;
  /**
   * Called when the stream cannot continue.
   *
   * Reconnects are handled for you and are not reported here. This fires only
   * when the SDK gives up: a credential the server rejects, a session it will not
   * serve, or an abort. The subscription is over by the time it runs.
   */
  onError?: (error: Error) => void;
  /** Stops the subscription when aborted, the same as calling the returned unsubscribe. */
  signal?: AbortSignal;
}

/** Options for {@link BuilderSessionReader.waitForTurn | waitForTurn()}. */
export interface WaitForTurnOptions {
  /** Gives up waiting when aborted. The turn itself is unaffected — use {@link BuilderSession.cancel | cancel()} to stop it. */
  signal?: AbortSignal;
}

/**
 * A builder session, read-only.
 *
 * What a grant can do. Obtained from
 * {@link createBuilderSession | createBuilderSession()}, which is the browser's entry
 * point; the server-side {@link BuilderSession} adds the writes on top.
 */
export interface BuilderSessionReader {
  /** The app this session builds. A builder session *is* an app — there is no separate session to open. */
  readonly appId: string;

  /**
   * The session's current state.
   *
   * The supported polling floor, for a client that cannot hold a connection open.
   * Anything that can should {@link BuilderSessionReader.subscribe | subscribe()}
   * instead — this answers from the app itself on every call.
   *
   * @returns Where the build stands right now.
   */
  getState(): Promise<BuilderState>;

  /**
   * Reads conversation history, newest page first and oldest-first within a page.
   *
   * For reconciling after an outage longer than the stream's replay window. A
   * client that stayed connected has already been told everything this returns.
   *
   * @param options - Cursor and page size.
   * @returns One page, plus the cursor to follow it with.
   *
   * @example
   * ```typescript
   * let after: string | null | undefined = undefined;
   * do {
   *   const page = await builder.listMessages({ after });
   *   render(page.messages);
   *   after = page.nextAfter;
   * } while (after);
   * ```
   */
  listMessages(options?: ListBuilderMessagesOptions): Promise<BuilderMessagePage>;

  /**
   * One turn's outcome, so a write's `turnId` is followable without the stream.
   *
   * A live turn is answered from the app; a finished one from the journal. A turn
   * older than the journal's retention window is a 404 rather than a guess.
   *
   * @param turnId - The turn to read.
   * @returns The turn's state, and whether it is still running.
   *
   * @throws {Base44Error} 404 if the turn is not in the retained window.
   */
  getTurn(turnId: string): Promise<BuilderTurn>;

  /**
   * Waits for a turn to stop, and resolves with the state it stopped in.
   *
   * The answer for a long-lived worker: a write returns as soon as the turn is
   * accepted, and this is how you await the result without holding an HTTP
   * request open through the whole build. A serverless function should not use
   * it — it cannot outlive the turn.
   *
   * Watches the stream rather than polling, and checks the turn once on the way
   * in, so a turn that finished between the write and this call still resolves.
   *
   * Resolves on `idle`, `error` *and* `blocked` — a build that ran out of credits
   * has stopped, and waiting for it to finish would wait forever.
   *
   * @param turnId - The turn to wait for, from {@link BuilderTurnRef.turnId}.
   * @param options - An abort signal.
   * @returns The state the turn came to rest in.
   *
   * @example
   * ```typescript
   * const { turnId } = await builder.sendMessage('add a footer');
   * const outcome = await builder.waitForTurn(turnId);
   * if (outcome.status === 'waiting') await answer(outcome.waitingOn);
   * ```
   */
  waitForTurn(turnId: string, options?: WaitForTurnOptions): Promise<BuilderState>;

  /**
   * Streams the build, calling back on every event.
   *
   * The primary form, and the same shape as every other realtime call in the
   * package: a callback in, an unsubscribe out. Reconnects and resumes on its
   * own — a dropped connection replays what it missed rather than losing it, so
   * a deploy on either side does not cost you state.
   *
   * Event types the SDK does not recognise are dropped rather than passed
   * through. That is the contract's own rule for clients, applied once here
   * instead of in every partner's switch; a new event type reaches you after an
   * SDK upgrade.
   *
   * @param onEvent - Called with each event, in order.
   * @param options - Resume point, error callback, abort signal.
   * @returns Call it to stop. Idempotent.
   *
   * @example
   * ```typescript
   * const unsubscribe = builder.subscribe((event) => {
   *   switch (event.type) {
   *     case 'message.updated': upsert(event.data); break;   // by messageId
   *     case 'state.changed':   setStatus(event.data); break;
   *     case 'turn.finished':   markDone(event.turnId); break;
   *     case 'conversation.reset': refetchHistory(); break;
   *   }
   * });
   *
   * // Later:
   * unsubscribe();
   * ```
   */
  subscribe(
    onEvent: (event: BuilderEvent) => void,
    options?: SubscribeToBuilderOptions
  ): () => void;

  /**
   * The same stream, as an async iterable.
   *
   * The second accessor over one subscription, for code shaped as a loop rather
   * than a callback. Leaving the loop — `break`, `return`, or a throw —
   * unsubscribes.
   *
   * Events queue while the body of your loop is awaiting, so a slow consumer
   * falls behind rather than dropping events. Keep the body fast, or take a copy
   * and hand it off.
   *
   * @param options - Resume point and abort signal.
   * @returns Every event, in order, until you stop iterating.
   *
   * @example
   * ```typescript
   * for await (const event of builder.stream()) {
   *   if (event.type === 'turn.finished') break;
   * }
   * ```
   */
  stream(options?: SubscribeToBuilderOptions): AsyncIterable<BuilderEvent>;

  /**
   * The assistant's prose, as text to append.
   *
   * `message.updated` is a snapshot, so rendering it into a chat UI that appends
   * would repeat the whole message on every tick. This yields only what each
   * snapshot *added*, which is what a streaming chat surface takes.
   *
   * A snapshot that is not an extension of what came before means the message was
   * rewritten — a retry, an edit — so a paragraph break is emitted and the new
   * text follows, rather than trying to patch history a chat platform has already
   * made immutable.
   *
   * Ends when the turn does. Tool calls and waitpoints are not text and are not
   * yielded: read them from {@link BuilderSessionReader.subscribe | subscribe()} or
   * {@link BuilderSessionReader.getState | getState()} and render them as whatever
   * your surface calls a card.
   *
   * @param options - Resume point and abort signal.
   * @returns Text to append, in order, until the turn ends.
   *
   * @example
   * ```typescript
   * for await (const chunk of builder.streamText()) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  streamText(options?: SubscribeToBuilderOptions): AsyncIterable<string>;
}

/**
 * A builder session, with the writes.
 *
 * What a principal's own credential can do, and therefore what belongs on your
 * server. Obtained from {@link PrincipalClient.builder | asPrincipal(id).builder(appId)}.
 *
 * Every write returns as soon as the turn is *accepted*, not when it is done: a
 * build takes minutes and no caller should hold a request open through one. The
 * turn's progress arrives on the stream, and
 * {@link BuilderSessionReader.waitForTurn | waitForTurn()} is how a long-lived
 * worker awaits the end of it.
 */
export interface BuilderSession extends BuilderSessionReader {
  /**
   * Starts a build turn.
   *
   * @param content - What to tell the builder.
   * @param options - Attachments and an idempotency key.
   * @returns The turn's id, immediately. The turn itself has not run yet.
   *
   * @throws {Base44Error} 409 if a turn is already running, or if a waitpoint is
   * unanswered — the two have different remedies, so they are told apart.
   *
   * @example
   * ```typescript
   * const { turnId } = await builder.sendMessage('add a footer', {
   *   idempotencyKey: requestId,
   * });
   * ```
   */
  sendMessage(
    content: string,
    options?: SendBuilderMessageOptions
  ): Promise<BuilderTurnRef>;

  /**
   * Answers the waitpoint holding the turn open, and resumes it.
   *
   * @param response - The answer, discriminated on the waitpoint's kind.
   * @param options - An idempotency key.
   * @returns The resumed turn's id.
   *
   * @throws {Base44Error} 409 if the session is not waiting, if the id names a
   * waitpoint that has moved on, or if the kind does not match the live one.
   *
   * @example
   * ```typescript
   * const { waitingOn } = await builder.getState();
   * if (waitingOn?.kind === 'approval') {
   *   await builder.respond({ ...waitingOn, approved: true });
   * }
   * ```
   */
  respond(
    response: BuilderResponse,
    options?: RespondToBuilderOptions
  ): Promise<BuilderTurnRef>;

  /**
   * Stops the running turn.
   *
   * Unlike the other writes this one is not deferred: stopping is fast and a
   * caller needs to know it landed, so resolving *is* the confirmation.
   *
   * Returns nothing rather than the state. The endpoint answers with the
   * builder's own internal status vocabulary, which the rest of this surface
   * deliberately renames, and the settled state arrives on the stream — or from
   * {@link BuilderSessionReader.getState | getState()} — in the public one.
   */
  cancel(): Promise<void>;

  /**
   * Mints a read-only grant for this session.
   *
   * This is what a browser gets. It reads one session and can write nothing, so
   * the stream can go browser-to-Base44 directly — off your serverless function
   * path, where holding an SSE connection open is a problem — while every write
   * still goes through your server.
   *
   * @param options - TTL and an opaque subject.
   * @returns The grant, including the token to hand over.
   *
   * @example
   * ```typescript
   * // POST /api/base44/grant, on your server
   * const userId = await requireSession(req);
   * const grant = await base44.asPrincipal(userId).builder(appId)
   *   .createGrant({ ttlSeconds: 900 });
   * return Response.json(grant);
   * ```
   */
  createGrant(options?: CreateBuilderGrantOptions): Promise<BuilderGrant>;

  /**
   * Withdraws a grant before it expires.
   *
   * Idempotent, and says nothing about whether the id was real — confirming which
   * ids exist would leak the grants of every session in the workspace.
   *
   * @param grantId - The grant to revoke.
   */
  revokeGrant(grantId: string): Promise<void>;
}
