import type { SocketSession } from "../client/modules/builder.types.js";

/** An app the AI chat works on. */
export interface Base44App {
  /** ID of the app, 24 lowercase hexadecimal characters. */
  id: string;
  /** Display name of the app. */
  name: string;
}

/** An answer to a question the AI waits on. Declining is `approve: false`. */
export interface ToolCallAnswer {
  /** ID of the tool call being answered. */
  toolCallId: string;
  /** ID of the assistant message that holds the tool call. */
  messageId: string;
  /** Whether to let the tool call run (`true`) or turn it down (`false`). */
  approve: boolean;
  /** What the question asked for. A choice sends `{ answers }`, and a secrets question sends `{ secrets }`. */
  extraUserInput?: Record<string, unknown>;
}

/**
 * The four calls your backend makes to Base44 for the chat.
 *
 * Each call wraps one Base44 API request with your credentials, so the browser never holds a
 * workspace API key or an access token. Your backend can be written in any language.
 *
 * - `createApp`: [Create app](/api-reference/create-app), with the first prompt as `initial_message`.
 * - `openLiveSession`: [Create socket session](/api-reference/create-socket-session) with `{ app_ids: [appId] }`.
 *   Return the response body unchanged. It holds a session token, never the workspace API key.
 * - `sendMessage`: [Send chat message](/api-reference/send-chat-message).
 * - `submitToolCallInput`: [Submit tool-call input](/api-reference/submit-tool-call-input). Send an
 *   `X-Request-ID` built from the tool call ID, so a retry resumes the turn only once.
 *
 * Base44 keeps the Send chat message and Submit tool-call input requests open until the AI
 * finishes the turn. Resolve your call once Base44 accepts the request, not when it returns. The
 * chat follows the rest live. A rejected promise from any call sets {@link Base44Chat.error}.
 *
 * @example
 * ```typescript
 * // Your four calls, behind your own API routes
 * async function post<T>(path: string, body: unknown): Promise<T> {
 *   const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
 *   if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
 *   return response.json();
 * }
 *
 * const backend: Base44ChatBackend = {
 *   createApp: (prompt) => post("/api/chat/apps", { prompt }),
 *   openLiveSession: (appId) => post("/api/chat/session", { appId }),
 *   sendMessage: (appId, content) => post("/api/chat/message", { appId, content }),
 *   submitToolCallInput: (appId, answer) => post("/api/chat/answer", { appId, answer }),
 * };
 * ```
 */
export interface Base44ChatBackend {
  /**
   * Creates an app from its first prompt. The AI starts building inside this call.
   *
   * @param prompt - The first prompt, which describes the app.
   * @returns Promise resolving to the new app.
   */
  createApp(prompt: string): Promise<Base44App>;
  /**
   * Opens a read-only socket session for one app. The chat calls it on the first connect and again
   * whenever the session expires. Sessions last one hour.
   *
   * @param appId - ID of the app to follow.
   * @returns Promise resolving to the Create socket session response body, unchanged.
   */
  openLiveSession(appId: string): Promise<SocketSession>;
  /**
   * Sends a prompt to an existing app. Base44 queues a prompt sent while the AI is working. When the
   * app has no queue, Base44 refuses it with a 409, so reject the promise.
   *
   * @param appId - ID of the app.
   * @param content - The prompt.
   * @returns Promise resolving once Base44 accepts the prompt.
   */
  sendMessage(appId: string, content: string): Promise<void>;
  /**
   * Answers or declines a question the AI waits on.
   *
   * @param appId - ID of the app.
   * @param answer - The tool call and the answer to it.
   * @returns Promise resolving once Base44 accepts the answer.
   */
  submitToolCallInput(appId: string, answer: ToolCallAnswer): Promise<void>;
}

/** One message of the chat, shaped for rendering. */
export interface ChatItem {
  /** ID of the message. */
  id: string;
  /** Who wrote the message. */
  role: "user" | "assistant";
  /** The message text, as raw markdown. It comes before the steps, and is empty when the message only holds tool calls. */
  text: string;
  /** When the message was created, as an ISO timestamp. Base44's timestamps are UTC with no time zone. A pending prompt carries the browser's time. */
  createdAt: string;
  /** One step per tool call, in order. */
  steps: ChatStep[];
  /**
   * Whether this is a prompt sent from this chat that Base44 hasn't confirmed yet. It shows at once,
   * and Base44's own message replaces it. A failed send removes it. A prompt sent while the AI is
   * working waits in Base44's queue and stays pending until it runs.
   */
  pending: boolean;
}

/** One tool call, as a line of activity. */
export interface ChatStep {
  /** ID of the tool call. */
  id: string;
  /** Name of the tool, such as `write_file`. */
  tool: string;
  /** The file paths the tool call touched. */
  files: string[];
  /** A line ready to show. It's Base44's description of the step when there is one, then the entity it touched, then the tool name and its files. */
  label: string;
  /** Base44's description of what the step did, such as what a command or code run did. */
  summary?: string;
  /**
   * Where the tool call is. A `waiting` step waits on the user. A `stopped` step was declined, or the
   * turn was stopped.
   */
  status: "running" | "waiting" | "done" | "stopped" | "error";
  /**
   * The question this step waits on, with the actions that answer it. Present only while the step is
   * `waiting` in the last assistant message, which is the one that makes the chat wait. It goes away
   * once answered, and is absent for a question kind this release doesn't know.
   */
  question?: ChatQuestion;
  /** What the user answered on a choice question, once answered. It stays after the question closes, so the chat's history shows it. */
  answered?: ChatAnswer[];
}

/** One answer to a choice question, next to the question it answers. */
export interface ChatAnswer {
  /** The question text. */
  question: string;
  /** The labels the user picked. */
  labels: string[];
  /** The free text the user wrote, if any. */
  text?: string;
}

/**
 * An open question, with the actions that answer this question and no other.
 *
 * Each kind carries only the actions that make sense for it, and every kind can be declined. The
 * actions never throw. A failure sets {@link Base44Chat.error}, and the question opens again.
 *
 * The chat declines a question kind this release doesn't know, once per tool call, when Base44
 * names that kind on the last assistant message. If the decline fails, {@link Base44Chat.error} says
 * so, and the chat tries again after it reconnects.
 */
export type ChatQuestion = ChoiceQuestion | SecretsQuestion | ApprovalQuestion;

/** One of the questions in a {@link ChoiceQuestion}. */
export interface ChoiceEntry {
  /** The question text. */
  text: string;
  /** Supporting text for the question. */
  description?: string;
  /** Base44's type of question, such as `text_input` for one that takes only a free-text answer. */
  type?: string;
  /** The option labels to pick from. */
  options: string[];
  /** Whether more than one option can be picked. */
  multi: boolean;
}

/** The AI offers options and waits for the user to pick. */
export interface ChoiceQuestion {
  /** Kind of question. */
  kind: "choice";
  /** The questions, in order. */
  questions: ChoiceEntry[];
  /**
   * Answers with the picked labels, and free text where the user wrote some.
   *
   * @param picked - One list of picked labels per question, in the order of `questions`.
   * @param texts - One free-text answer per question, in the same order. Use it for a `text_input` question, or as a note beside a pick. A question with no pick and no text is skipped.
   * @returns Promise resolving once the answer is sent.
   */
  answer(picked: string[][], texts?: string[]): Promise<void>;
  /**
   * Declines the question. The AI continues without the answer.
   *
   * @returns Promise resolving once the decline is sent.
   */
  decline(): Promise<void>;
}

/** A value the AI needs, such as an API key. */
export interface SecretField {
  /** Name of the field, used as its key in `submit`. */
  name: string;
  /** Where to get the value. */
  description?: string;
}

/** The AI needs secrets, such as API keys. The values go to Base44 and the chat keeps none of them. */
export interface SecretsQuestion {
  /** Kind of question. */
  kind: "secrets";
  /** The fields to fill. */
  fields: SecretField[];
  /**
   * Submits the values.
   *
   * @param values - The values, keyed by field name.
   * @returns Promise resolving once the values are sent.
   */
  submit(values: Record<string, string>): Promise<void>;
  /**
   * Declines the question. The AI continues without the values.
   *
   * @returns Promise resolving once the decline is sent.
   */
  decline(): Promise<void>;
}

/** The AI asks for permission to run an action. */
export interface ApprovalQuestion {
  /** Kind of question. */
  kind: "approval";
  /** Name of the tool that wants to run. */
  action: string;
  /** Why the action needs approval, when Base44 gives a reason. Empty otherwise. */
  reason: string;
  /** The check that paused the action, such as `exec_tool_send_email` or `entity_rls_guard`. */
  guard: string;
  /** What the action would do, as far as the check publishes it. Show it so the user knows what they approve. */
  details: ApprovalDetails;
  /**
   * Lets the action run.
   *
   * @returns Promise resolving once the approval is sent.
   */
  approve(): Promise<void>;
  /**
   * Declines the action. It never runs, and the AI continues.
   *
   * @returns Promise resolving once the decline is sent.
   */
  decline(): Promise<void>;
}

/** What an action that waits for approval would do. Each check publishes only some of these. */
export interface ApprovalDetails {
  /** The AI's summary of what the code does. */
  summary?: string;
  /** The entity whose records or access rules change. */
  entityName?: string;
  /** How the access rules change. */
  changeType?: string;
  /** The access operations whose rules change. */
  changedOps?: string[];
  /** The backend function under test. */
  functionName?: string;
  /** The entity method the code calls, such as `delete`. */
  method?: string;
  /** Whether the check couldn't verify the function's source. */
  inspectionFailed?: boolean;
}

/**
 * What the AI is doing. When several hold at once, the first in this list wins.
 *
 * - `error`: Base44 reports that the last build failed.
 * - `waiting`: a question waits on the user.
 * - `building`: the AI is working.
 * - `submitted`: a prompt, a new app or an answer is on its way. It lasts until Base44 reports work, a reply or a queue change, or the call fails.
 * - `ready`: none of the above.
 */
export type ChatStatus = "ready" | "submitted" | "building" | "waiting" | "error";

/**
 * Whether the chat follows the app live.
 *
 * - `connecting`: until the first snapshot arrives.
 * - `connected`: after the first snapshot.
 * - `disconnected`: live updates stopped for good. The session couldn't open, the retries ran out,
 *   or Base44 ended the session or the app's subscription. {@link Base44Chat.error} says why.
 *
 * Watching another app, or mounting the chat again, starts over.
 */
export type ChatConnection = "connecting" | "connected" | "disconnected";

/** A failure of a call, of the live connection, or of the build. */
export interface ChatError {
  /** What went wrong, for people. */
  message: string;
  /**
   * What went wrong, for code. A connection error carries a `PlatformSocketErrorCode`, and a failed
   * build carries `build_failed`. A failed call to your backend carries none.
   */
  code?: string;
  /** The original error, for logging. */
  cause?: unknown;
}

/** Options for {@link useBase44Chat}. */
export interface Base44ChatOptions {
  /**
   * ID of the app to follow, or `null` until an app exists. While it's `null`, the chat follows the
   * app {@link Base44Chat.create} made. Any change to `appId` forgets that app.
   */
  appId: string | null;
  /** The four calls your backend makes to Base44. The chat reads the latest on every action, so an inline object works. */
  backend: Base44ChatBackend;
  /**
   * Called with the new app after {@link Base44Chat.create} succeeds. The chat already follows it.
   * Pass its ID back as `appId` to keep it in your own state.
   */
  onAppCreated?: (app: Base44App) => void;
}

/** The chat that {@link useBase44Chat} returns. */
export interface Base44Chat {
  /** The conversation, oldest first, with open questions bound to their steps. */
  items: ChatItem[];
  /** What the AI is doing. */
  status: ChatStatus;
  /** Whether the chat follows the app live. */
  connection: ChatConnection;
  /**
   * The last failure. It's set whenever `status` is `error`, and on any failed call or connection
   * error. A failed call's error clears on the next action. A connection error stays until
   * {@link Base44Chat.clearError}. A failed build stays while Base44 reports it.
   */
  error: ChatError | null;
  /**
   * Sends a prompt to the current app. Base44 queues it while the AI is working. The prompt shows
   * at once as a pending item, and the reply arrives through `items`. Without an app, it sets
   * `error`. Use {@link Base44Chat.create} for the first prompt.
   *
   * @param prompt - The prompt to send.
   * @returns Promise resolving once Base44 accepts the prompt. It never rejects.
   */
  send(prompt: string): Promise<void>;
  /**
   * Creates an app from its first prompt and reports it through `onAppCreated`.
   *
   * @param prompt - The first prompt, which describes the app.
   * @returns Promise resolving once the app exists. It never rejects.
   */
  create(prompt: string): Promise<void>;
  /** Clears {@link Base44Chat.error}. A failed build's error stays while Base44 reports it. */
  clearError(): void;
}
