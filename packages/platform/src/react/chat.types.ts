import type { SocketSession } from "../client/modules/chat.types.js";

/** An app the AI chat works on. */
export interface ChatApp {
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
 * chat follows the rest live. A rejected promise from any call sets `error` on the {@link useChat | chat}.
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
 * const backend: ChatBackend = {
 *   createApp: (prompt) => post("/api/chat/apps", { prompt }),
 *   openLiveSession: (appId) => post("/api/chat/session", { appId }),
 *   sendMessage: (appId, content) => post("/api/chat/message", { appId, content }),
 *   submitToolCallInput: (appId, answer) => post("/api/chat/answer", { appId, answer }),
 * };
 * ```
 */
export interface ChatBackend {
  /**
   * Creates an app from its first prompt. The AI starts building inside this call.
   *
   * @param prompt - The first prompt, which describes the app.
   * @returns Promise resolving to the new app.
   */
  createApp(prompt: string): Promise<ChatApp>;
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
  /** The message text, as raw markdown. Show it before the message's steps. It's empty when the message only holds tool calls. */
  text: string;
  /**
   * When the message was created, as an ISO 8601 timestamp in UTC. A timestamp from Base44 has no `Z`
   * or offset, so add a `Z` before parsing it with `new Date()`. A pending prompt has the browser's
   * time, which already ends in `Z`.
   */
  createdAt: string;
  /** One step per tool call, in order. */
  steps: ChatStep[];
  /**
   * Whether this is a stand-in for a prompt you just sent. When you call [`send()`](#send) or
   * [`create()`](#create), the prompt appears in `items` right away as a pending item, and Base44's
   * copy of the message replaces it once it arrives. A failed send removes it. A prompt sent while the
   * AI is working waits in Base44's queue, so it stays pending until it runs.
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
  /**
   * A line to show for the step. It's Base44's description of the step when there is one. Otherwise
   * it's the tool name followed by the entity the step touched and its record count, such as
   * `create_records Task (3)`, or by the step's files.
   */
  label: string;
  /**
   * The step's progress. A `waiting` step needs the user to answer its question. A `stopped` step was
   * declined, or its turn was stopped. A status this release doesn't know counts as `done`.
   */
  status: "running" | "waiting" | "done" | "stopped" | "error";
  /**
   * The {@link ChatQuestion | question} the step needs answered, with the actions that answer it. It's present only on a
   * `waiting` step in the latest assistant reply, and goes away once answered. A `waiting` step in an
   * older message has no question. It's also absent for a question kind this release doesn't know.
   */
  question?: ChatQuestion;
  /** The user's answers to a choice question, one for each question the step asked. It stays after the question closes, so you can show the answers in the chat's history. */
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
 * actions never throw. A failure sets `error` on the {@link useChat | chat}, and the question opens again.
 *
 * The chat declines a question kind this release doesn't know, once per tool call, when Base44
 * names that kind on the last assistant message. If the decline fails, the chat's `error` says
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
 * What the AI is doing.
 *
 * When several hold at once, the first in this list wins.
 *
 * - `error`: Base44 reports that the last build failed.
 * - `waiting`: A question waits for the user's answer.
 * - `building`: The AI is working.
 * - `submitted`: A prompt, a new app, or an answer is on its way. It lasts until Base44 reports work, a reply, or a queue change, or until the call fails.
 * - `ready`: None of the above.
 */
export type ChatStatus = "ready" | "submitted" | "building" | "waiting" | "error";

/**
 * Whether the chat follows the app live.
 *
 * - `connecting`: The chat waits for the app's first snapshot.
 * - `connected`: The first snapshot arrived, and updates follow live.
 * - `disconnected`: Live updates stopped for good. The session couldn't open, the retries ran out,
 *   or Base44 ended the session or the app's subscription. Check [`error`](#error) to see why.
 *
 * Watching another app, or mounting the chat again, starts over.
 */
export type ChatConnection = "connecting" | "connected" | "disconnected";

/** A failure of a call, of the live connection, or of the build. */
export interface ChatError {
  /** A readable description of what went wrong, such as `The build failed`. */
  message: string;
  /**
   * A value your code can check to handle the error, such as `build_failed` for a failed build. A
   * connection error has one of the session or app error codes listed under the chat module's
   * [Errors](/developers/references/platform-sdk/docs/interfaces/chat#errors). A failed call to
   * your backend has no code.
   */
  code?: string;
  /** The error the failure came from, such as the one your backend threw. Log it to debug the failure. It's absent when the hook found the failure itself, such as a failed build or a send with no app. */
  cause?: unknown;
}

/** Options for {@link useChat}. */
export interface ChatOptions {
  /**
   * ID of the app to follow, or `null` until an app exists. While it's `null`, the chat follows the
   * app that [`create()`](#create) made, so you don't have to pass the new ID back.
   * Changing `appId` stops following that app, so setting it back to `null` starts a new chat.
   * Switching to another app closes the old session and starts over.
   */
  appId: string | null;
  /**
   * The four calls your backend makes to Base44. The hook uses the `backend` from the latest render,
   * so you can pass an inline object without memoizing it.
   */
  backend: ChatBackend;
  /**
   * Called with the new app after [`create()`](#create) succeeds. The chat already follows the new
   * app. To keep its ID in your own state, pass it back as `appId`.
   *
   * @param app - The app that was created.
   */
  onAppCreated?: (app: ChatApp) => void;
}

/**
 * The chat state and actions that `useChat()` returns.
 *
 * @groupDescription Properties
 * The hook returns one object, of type `UseChatResult`. Its state is below, and its functions are
 * under [Returned actions](#returned-actions).
 *
 * @groupDescription Methods
 * Functions on the same object, which you call to act on the chat, as in `chat.send(prompt)`. They
 * never throw. A failure sets [`error`](#error).
 */
export interface UseChatResult {
  /** The conversation, oldest first. Each open question appears with the step that asked it. */
  items: ChatItem[];
  /** What the AI is doing. */
  status: ChatStatus;
  /** Whether the chat follows the app live. */
  connection: ChatConnection;
  /**
   * The failure to show, or `null`. It's set when a call fails, when the live connection fails, and
   * whenever `status` is `error`. When more than one of these conditions is true, `error` holds the
   * failed call first, then the connection error, then the failed build. A failed call's error
   * clears on the next action, and a connection error stays until [`clearError()`](#clearerror). A
   * failed build's error stays while Base44 reports it. Switching to another app clears it.
   */
  error: ChatError | null;
  /**
   * Sends a prompt to the app the chat follows. The prompt appears in [`items`](#items) right away
   * as a pending item, and the reply arrives there too. Base44 queues the prompt while the AI is
   * working. If the chat doesn't follow an app yet, it sets [`error`](#error) instead. Use
   * [`create()`](#create) for the first prompt.
   *
   * @param prompt - The prompt to send.
   * @returns Promise resolving once Base44 accepts the prompt, or once the send fails and sets [`error`](#error). It never rejects.
   */
  send(prompt: string): Promise<void>;
  /**
   * Creates an app from its first prompt. The prompt appears in [`items`](#items) right away as a
   * pending item. Once the app exists, the hook passes it to [`onAppCreated`](#onappcreated). If
   * `appId` is `null`, the chat then follows the new app. Otherwise it stays on the app it follows.
   *
   * @param prompt - The first prompt, which describes the app.
   * @returns Promise resolving once the app exists, or once creating it fails and sets [`error`](#error). It never rejects.
   */
  create(prompt: string): Promise<void>;
  /** Clears {@link UseChatResult.error}. A failed build's error stays while Base44 reports it. */
  clearError(): void;
}
