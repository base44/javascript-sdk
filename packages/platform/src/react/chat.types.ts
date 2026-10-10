import type { ChatMessage } from "../modules/builder.events.types.js";

/** An app the builder works on, as the chat needs it. */
export interface Base44App {
  /** App identifier: 24 lowercase hexadecimal characters. */
  id: string;
  /** Display name. */
  name: string;
}

/** What {@link Base44ChatServer.openLiveSession} returns: where the socket is and the token that joins it. */
export interface LiveSession {
  /** The socket server's origin, with no path. Your backend takes it from the session's `socket_url`. */
  serverUrl: string;
  /** The session token, and nothing else: the workspace key never reaches the browser. */
  sessionToken: string;
}

/** A reply to a question the builder waits on. Declining is `approve: false`. */
export interface ToolCallAnswer {
  /** The tool call being answered. */
  toolCallId: string;
  /** The assistant message that holds the tool call. */
  messageId: string;
  /** Whether to let the call run (`true`) or turn it down (`false`). */
  approve: boolean;
  /** Content the question asked for: `{ answers }` for a choice, `{ secrets }` for an input. */
  extraUserInput?: Record<string, unknown>;
}

/**
 * The four calls your backend provides. Each wraps one Base44 REST call with your
 * credentials, so the hook never holds a workspace key or an access token, and the
 * backend can be written in any language:
 *
 * - `createApp`: `POST /api/apps` with the first prompt as `initial_message`.
 * - `openLiveSession`: `POST /api/service/socket-sessions` with `{ app_ids: [appId] }`.
 * - `sendMessage`: `POST /api/apps/{id}/chat/message`.
 * - `submitToolCallInput`: `POST /api/apps/{id}/chat/submit-tool-call-input`, with an
 *   `X-Request-ID` derived from the tool call id so a retry resumes the turn only once.
 *
 * A rejected promise from any of them lands in {@link Base44Chat.error}.
 */
export interface Base44ChatServer {
  /** Creates an app from its first prompt. The build starts inside this call. */
  createApp(prompt: string): Promise<Base44App>;
  /** Opens a read-only live-updates session for one app. */
  openLiveSession(appId: string): Promise<LiveSession>;
  /** Sends a prompt to an existing app. */
  sendMessage(appId: string, content: string): Promise<void>;
  /** Answers, or declines, a question the builder waits on. */
  submitToolCallInput(appId: string, answer: ToolCallAnswer): Promise<void>;
}

/** One message of the chat, in a shape made for rendering. */
export interface ChatItem {
  /** Message identifier. */
  id: string;
  /** Who wrote it. */
  role: "user" | "assistant";
  /** The message text; empty when the message is only tool activity. */
  text: string;
  /** The builder's tool calls in this message, in order. */
  steps: ChatStep[];
  /** The question this message waits on, bound to the actions that answer it. Absent otherwise. */
  question?: Question;
}

/** One tool call, as a line of activity. */
export interface ChatStep {
  /** Tool call identifier. */
  id: string;
  /** The tool's name followed by the file paths it touched, if any. */
  label: string;
  /** Where the call is: `waiting` means it waits on the user. */
  status: "running" | "waiting" | "done" | "error";
}

/**
 * An open question, with the actions that answer this question and no other.
 * Each kind carries only the actions that make sense for it, and every kind can be declined.
 * The actions never throw: a failure lands in {@link Base44Chat.error} and the question opens again.
 */
export type Question = ChoiceQuestion | InputQuestion | ApprovalQuestion | UnknownQuestion;

/** One of the questions a `choice` asks. */
export interface ChoiceEntry {
  /** The question text. */
  text: string;
  /** Optional supporting text. */
  description?: string;
  /** The option labels to pick from. */
  options: string[];
  /** Whether more than one option may be picked. */
  multi: boolean;
}

/** The builder offers options and wants a pick. */
export interface ChoiceQuestion {
  /** Discriminator. */
  kind: "choice";
  /** The questions asked, in order. */
  questions: ChoiceEntry[];
  /** Answers with the picked labels: one list per question, in the same order as `questions`. An empty list skips that question. */
  answer(picked: string[][]): Promise<void>;
  /** Declines: the builder continues without the answer. */
  decline(): Promise<void>;
}

/** A value the builder needs, such as an API key. */
export interface InputField {
  /** The field name, used as the key in `submit`. */
  name: string;
  /** Optional explanation of where to obtain the value. */
  description?: string;
}

/** The builder needs values, such as API keys. They go to Base44 and are never kept here. */
export interface InputQuestion {
  /** Discriminator, as the wire names it. */
  kind: "input";
  /** The fields to fill. */
  fields: InputField[];
  /** Submits the values, keyed by field name. */
  submit(values: Record<string, string>): Promise<void>;
  /** Declines: the builder continues without the values. */
  decline(): Promise<void>;
}

/** The builder wants permission to run a proposed action. */
export interface ApprovalQuestion {
  /** Discriminator. */
  kind: "approval";
  /** The tool that wants to run. */
  action: string;
  /** Why it was parked, when the guard says; empty otherwise. */
  reason: string;
  /** Lets the action run. */
  approve(): Promise<void>;
  /** Declines: the action never runs and the builder continues. */
  decline(): Promise<void>;
}

/** A question kind Base44 added after this release. It can only be declined. */
export interface UnknownQuestion {
  /** Discriminator. */
  kind: "unknown";
  /** The tool that waits. */
  action: string;
  /** Declines: the builder continues without it. */
  decline(): Promise<void>;
}

/** What the chat is doing. One phase at a time; an error is separate and stays until cleared. */
export type ChatPhase = "idle" | "creating" | "loading" | "waiting" | "building";

/** A failure of a server call or of the live connection. */
export interface ChatError {
  /** What went wrong, for people. */
  message: string;
  /** A `PlatformSocketErrorCode` for connection errors; absent for server-call errors. */
  code?: string;
}

/** Options of {@link useBase44Chat}. */
export interface Base44ChatOptions {
  /** The app to watch, or `null` when no app is selected yet and there is nothing to connect to. */
  appId: string | null;
  /** Your backend's four calls. Read on every action, so an inline object is fine. */
  server: Base44ChatServer;
  /** Called with the new app after {@link Base44Chat.create} succeeds. */
  onAppCreated?: (app: Base44App) => void;
}

/** What {@link useBase44Chat} returns. */
export interface Base44Chat {
  /** The conversation, oldest first, with open questions bound to their actions. */
  items: ChatItem[];
  /** What the chat is doing now. */
  phase: ChatPhase;
  /** The last failure, until {@link Base44Chat.clearError} or the next action clears it. */
  error: ChatError | null;
  /** Whether the input should accept a prompt. False while an app is being created and while
   * a question is open: Base44 drops a message sent into a stopped turn. */
  canSend: boolean;
  /** Sends a prompt to the current app. Resolves after the request is accepted; the reply arrives through `items`. */
  send(prompt: string): Promise<void>;
  /** Creates a new app from its first prompt and reports it through `onAppCreated`. */
  create(prompt: string): Promise<void>;
  /** Clears {@link Base44Chat.error}. */
  clearError(): void;
  /** Base44's raw messages, sorted, for UIs that map them themselves. */
  messages: ChatMessage[];
}
