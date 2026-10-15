// Generated from asyncapi.json by scripts/gen-events.mjs. Do not edit; run `npm run gen:events`.

/**
 * Join an app's room, once per app after every connect. An `app.snapshot` follows, then its live events. Refused with `room.access_denied` when the app is not on the session's allowlist, or past 30 joins a minute.
 */
export type JoinMessage = string;
/**
 * Leave an app's room. Its events stop.
 */
export type LeaveMessage = string;

/**
 * An entity access-rule change waiting for approval.
 */
export interface AccessRuleChangeDetails {
  /**
   * Entity whose access rules change.
   */
  entity_name?: string;
  /**
   * How the access rules change.
   */
  change_type?: string;
  /**
   * Access operations whose rules change.
   */
  changed_ops?: string[];
}
/**
 * The app's current status and its last 50 public messages, after every join. Replace the app's state with it.
 */
export interface AppSnapshotEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: Snapshot;
}
/**
 * The app's current state, sent after every join. Replace what the viewer holds for the app with it.
 */
export interface Snapshot {
  /**
   * The app's build status, or `null` when none is recorded.
   */
  status: StatusObject | null;
  /**
   * The last 50 messages visible to partners, oldest first.
   */
  messages: Message[];
  /**
   * The main branch's prompt queue.
   */
  queue: QueueState;
}
/**
 * The app's current build status.
 */
export interface StatusObject {
  /**
   * Where the app is in its build lifecycle. Ready means idle with no build in progress, processing means the app is being generated or modified, and error means the last build failed. This tracks building, not publishing.
   */
  state?: ("ready" | "processing" | "error") | null;
  /**
   * ID of the user message whose turn the status belongs to.
   */
  turn_id?: string | null;
  /**
   * Time the status was last updated, as a UTC timestamp in ISO 8601 format.
   */
  last_updated_date?: string | null;
}
/**
 * A public chat message. Replace the message with the same `id` as a whole.
 */
export interface Message {
  /**
   * ID of the message. An update carries the whole message again under the same ID.
   */
  id?: string | null;
  /**
   * `user` for a message a person sent, `assistant` for the AI's reply. `system` messages are never sent.
   */
  role?: ("user" | "assistant" | "system") | null;
  /**
   * Text of the message. Attachments and structured content are left out.
   */
  content?: string | null;
  /**
   * The tool calls the AI made in this message, in order. Each is updated in place as it progresses.
   */
  tool_calls?:
    | (
        | AskClarifyingQuestionsCall
        | AskPlanQuestionsCall
        | BashCall
        | CreateEntityRecordsCall
        | DeleteEntitiesCall
        | DeleteFileCall
        | EditRepoFileCall
        | ExecToolCall
        | FindReplaceCall
        | GenerateGameBackgroundCall
        | GenerateGameImageCall
        | GenerateImageCall
        | GeneratePrdCall
        | GenerateVideoCall
        | InstallNpmPackageCall
        | PreviewExecuteCodeCall
        | PreviewScreenshotCall
        | ReadOnlyExecToolCall
        | ReadRepoFileCall
        | RunShellCommandCall
        | SetSecretsCall
        | UpdateEntitiesCall
        | UpdatePlanCall
        | WriteFileCall
        | WriteRepoFileCall
        | OtherToolCall
      )[]
    | null;
  /**
   * ID of the checkpoint tied to the message. On a message a person sent it holds the app before the turn, on the AI's final reply the app after it. Absent when the turn made no checkpoint.
   */
  checkpoint_id?: string | null;
  /**
   * When the message was created.
   */
  metadata?: MessageMetadata | null;
  /**
   * Flags on the message, such as plan mode. Only the flags listed here are published.
   */
  additional_message_params?: MessageParams | null;
}
/**
 * The AI asks the user questions before it goes on. The call waits until the user answers.
 */
export interface AskClarifyingQuestionsCall {
  /**
   * The tool that was called.
   */
  name: "ask_clarifying_questions";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: QuestionArguments | null;
  /**
   * The user's answer to the call, once given, for tools that take one.
   */
  user_input?: QuestionInput | null;
}
/**
 * What the call waits for. Render the widget by kind, not by tool name.
 */
export interface WaitingOn {
  /**
   * `choice`: pick among options. `input`: supply values. `approval`: approve or reject.
   */
  kind?: "choice" | "input" | "approval";
}
/**
 * Waiting for approval: testing a backend function would delete records from an entity.
 */
export interface BackendFunctionEntityDeleteApproval {
  /**
   * The check that paused the call.
   */
  guard: "backend_function_entity_delete";
  /**
   * Why the call needs approval, as the check explained it.
   */
  reason?: string | null;
  /**
   * What the check found.
   */
  details?: FunctionEntityDeleteDetails | null;
}
/**
 * A backend function test that would delete entity records.
 */
export interface FunctionEntityDeleteDetails {
  /**
   * Backend function under test.
   */
  function_name?: string;
  /**
   * Entity method the function calls.
   */
  method?: string;
  /**
   * The check could not verify the function's source.
   */
  inspection_failed?: boolean;
}
/**
 * Waiting for approval: the AI wants to run a shell command that needs a review first. The command itself is not published.
 */
export interface BashApproval {
  /**
   * The check that paused the call.
   */
  guard: "bash_approval";
}
/**
 * Waiting for approval: the AI wants to change who can read or write an entity's records.
 */
export interface EntityRlsGuardApproval {
  /**
   * The check that paused the call.
   */
  guard: "entity_rls_guard";
  /**
   * Why the call needs approval, as the check explained it.
   */
  reason?: string | null;
  /**
   * What the check found.
   */
  details?: AccessRuleChangeDetails | null;
}
/**
 * Waiting for approval: the AI's code would update or delete records in an entity.
 */
export interface ExecToolEntityMutationApproval {
  /**
   * The check that paused the call.
   */
  guard: "exec_tool_entity_mutation";
  /**
   * Why the call needs approval, as the check explained it.
   */
  reason?: string | null;
  /**
   * What the check found.
   */
  details?: EntityMutationDetails | null;
}
/**
 * What the entity change waiting for approval would do. Record data is never included.
 */
export interface EntityMutationDetails {
  /**
   * Entity method the code calls, such as `delete`.
   */
  method?: string;
  /**
   * The agent's summary of what the code does.
   */
  summary?: string;
}
/**
 * Waiting for approval: the AI's code would write to a GitHub repository.
 */
export interface ExecToolGithubRepoWriteApproval {
  /**
   * The check that paused the call.
   */
  guard: "exec_tool_github_repo_write";
  /**
   * Why the call needs approval, as the check explained it.
   */
  reason?: string | null;
  /**
   * What the check found.
   */
  details?: SummaryDetails | null;
}
/**
 * What the code waiting for approval would do.
 */
export interface SummaryDetails {
  /**
   * The agent's summary of what the code does.
   */
  summary?: string;
}
/**
 * Waiting for approval: the AI's code would invite someone to the app by email.
 */
export interface ExecToolInviteUserApproval {
  /**
   * The check that paused the call.
   */
  guard: "exec_tool_invite_user";
  /**
   * Why the call needs approval, as the check explained it.
   */
  reason?: string | null;
  /**
   * What the check found.
   */
  details?: SummaryDetails | null;
}
/**
 * Waiting for approval: the AI's code would send an email.
 */
export interface ExecToolSendEmailApproval {
  /**
   * The check that paused the call.
   */
  guard: "exec_tool_send_email";
  /**
   * Why the call needs approval, as the check explained it.
   */
  reason?: string | null;
  /**
   * What the check found.
   */
  details?: SummaryDetails | null;
}
/**
 * Waiting for approval: the AI's code would send a text message.
 */
export interface ExecToolSendSmsApproval {
  /**
   * The check that paused the call.
   */
  guard: "exec_tool_send_sms";
  /**
   * Why the call needs approval, as the check explained it.
   */
  reason?: string | null;
  /**
   * What the check found.
   */
  details?: SummaryDetails | null;
}
/**
 * Waiting for approval from a check that publishes only its name.
 */
export interface OtherApproval {
  /**
   * The check that paused the call.
   */
  guard: string;
}
/**
 * The questions the builder asks.
 */
export interface QuestionArguments {
  /**
   * Questions presented to the user.
   */
  questions?: Question[];
}
/**
 * A question for the user. Image and HTML sources and private design context are never included.
 */
export interface Question {
  /**
   * Visible question text.
   */
  question?: string;
  /**
   * Question category, such as `text`.
   */
  type?: string;
  /**
   * Supporting text.
   */
  description?: string;
  /**
   * More than one answer may be selected.
   */
  multi_select?: boolean;
  /**
   * Plan section the question covers.
   */
  covers?: string;
  /**
   * Selectable options. A bare string is its label.
   */
  options?: (string | QuestionOption)[];
}
/**
 * A selectable answer.
 */
export interface QuestionOption {
  /**
   * Visible option label.
   */
  label?: string;
}
/**
 * The user's answers.
 */
export interface QuestionInput {
  /**
   * Answers supplied to the question card.
   */
  answers?: QuestionAnswer[];
}
/**
 * An answer to a question. Secret-form input is never included.
 */
export interface QuestionAnswer {
  /**
   * Zero-based question index.
   */
  question_index?: number;
  /**
   * Label selected for a single-select question.
   */
  selected_label?: string;
  /**
   * Labels selected for a multi-select question.
   */
  selected_labels?: string[];
  /**
   * Free-text answer. Structural filtering does not redact prose.
   */
  custom_text?: string;
}
/**
 * The AI asks the user questions that shape the plan, in plan mode. The call waits until the user answers.
 */
export interface AskPlanQuestionsCall {
  /**
   * The tool that was called.
   */
  name: "ask_plan_questions";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: QuestionArguments | null;
  /**
   * The user's answer to the call, once given, for tools that take one.
   */
  user_input?: QuestionInput | null;
}
/**
 * The AI runs a shell command in the app's sandbox.
 */
export interface BashCall {
  /**
   * The tool that was called.
   */
  name: "bash";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: SummaryDisplay | null;
}
/**
 * What a command or screenshot did.
 */
export interface SummaryDisplay {
  /**
   * Reviewed activity summary. Commands and output are never included.
   */
  summary?: string;
}
/**
 * The AI adds records to one of the app's entities.
 */
export interface CreateEntityRecordsCall {
  /**
   * The tool that was called.
   */
  name: "create_entity_records";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: EntityRecordsDisplay | null;
}
/**
 * The entity an operation added records to.
 */
export interface EntityRecordsDisplay {
  /**
   * Entity type. Records and query values are never included.
   */
  entity_name?: string;
  /**
   * Number of records created.
   */
  record_count?: number;
}
/**
 * The AI deletes records from one of the app's entities.
 */
export interface DeleteEntitiesCall {
  /**
   * The tool that was called.
   */
  name: "delete_entities";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: EntityChangeArguments | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: EntityDisplay | null;
}
/**
 * An entity update or delete. The entity is in `display.entity_name`.
 */
export interface EntityChangeArguments {
  /**
   * The agent's summary of the change. Queries and record values are never included.
   */
  summary?: string;
}
/**
 * The entity an entity operation touched.
 */
export interface EntityDisplay {
  /**
   * Entity type. Records and query values are never included.
   */
  entity_name?: string;
}
/**
 * The AI deletes a file from the app.
 */
export interface DeleteFileCall {
  /**
   * The tool that was called.
   */
  name: "delete_file";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: FileDisplay | null;
}
/**
 * The files a file operation touched.
 */
export interface FileDisplay {
  /**
   * Changed file paths. Source bodies and diffs are never included.
   */
  file_paths?: string[];
  /**
   * A write intentionally used empty content.
   */
  content_empty?: boolean;
}
/**
 * The AI edits a file in the imported repository.
 */
export interface EditRepoFileCall {
  /**
   * The tool that was called.
   */
  name: "edit_repo_file";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: FileDisplay | null;
}
/**
 * The AI runs code against the app's data and integrations.
 */
export interface ExecToolCall {
  /**
   * The tool that was called.
   */
  name: "exec_tool";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: ExecDisplay | null;
}
/**
 * What a code execution did.
 */
export interface ExecDisplay {
  /**
   * Reviewed activity summary. Code and output are never included.
   */
  summary?: string;
  /**
   * The code changed entity data, so refresh the preview.
   */
  writes_entities?: boolean;
}
/**
 * The AI edits files by replacing text in them.
 */
export interface FindReplaceCall {
  /**
   * The tool that was called.
   */
  name: "find_replace";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: FileDisplay | null;
}
/**
 * The AI generates a background image for a game. An `image.resolved` event follows when it is ready.
 */
export interface GenerateGameBackgroundCall {
  /**
   * The tool that was called.
   */
  name: "generate_game_background";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * The tool's result, narrowed to what this tool publishes. Absent while the call waits for approval.
   */
  results?: string | null;
}
/**
 * The AI generates an image asset for a game. An `image.resolved` event follows when it is ready.
 */
export interface GenerateGameImageCall {
  /**
   * The tool that was called.
   */
  name: "generate_game_image";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: GameImageArguments | null;
  /**
   * The tool's result, narrowed to what this tool publishes. Absent while the call waits for approval.
   */
  results?: string | null;
}
/**
 * What to generate.
 */
export interface GameImageArguments {
  /**
   * Requested aspect ratio, such as `1:1`.
   */
  aspect_ratio?: string;
}
/**
 * The AI generates an image for the app. An `image.resolved` event follows when it is ready.
 */
export interface GenerateImageCall {
  /**
   * The tool that was called.
   */
  name: "generate_image";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: MediaArguments | null;
  /**
   * The tool's result, narrowed to what this tool publishes. Absent while the call waits for approval.
   */
  results?: ImageResult | null;
}
/**
 * What to generate.
 */
export interface MediaArguments {
  /**
   * Visible media label.
   */
  label?: string;
  /**
   * Requested aspect ratio, such as `16:9`.
   */
  aspect_ratio?: string;
}
/**
 * The generated image's state.
 */
export interface ImageResult {
  /**
   * Placeholder URL, used to associate an `image.resolved` event with this tool.
   */
  placeholder_url?: string;
  /**
   * Current generation status.
   */
  status?: "pending" | "completed" | "failed";
  /**
   * Generated image URL, once available.
   */
  image_url?: string | null;
}
/**
 * The AI writes down the plan it settled with the user. In plan mode this call carries the plan itself.
 */
export interface GeneratePrdCall {
  /**
   * The tool that was called.
   */
  name: "generate_prd";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: PrdArguments | null;
}
/**
 * The user's own plan. In plan mode the message `content` beside it can be empty.
 */
export interface PrdArguments {
  /**
   * App or feature name.
   */
  app_name?: string;
  /**
   * What is being built and why.
   */
  intent_and_goal?: string;
  /**
   * Who uses it and their roles.
   */
  audience_and_roles?: string;
  /**
   * End-to-end user flows.
   */
  core_flows?: string[];
  /**
   * Specific technical requirements.
   */
  technical_requirements?: string;
  /**
   * Design preferences.
   */
  design_preferences?: string;
  /**
   * Build or plan declaration, when the builder asks for one.
   */
  prd_type?: string;
  /**
   * Store platform settled in planning, for e-commerce plans.
   */
  store_platform?: string;
  /**
   * Engine settled in planning, for game plans.
   */
  game_engine?: string;
}
/**
 * The AI generates a video for the app.
 */
export interface GenerateVideoCall {
  /**
   * The tool that was called.
   */
  name: "generate_video";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: MediaArguments | null;
  /**
   * The tool's result, narrowed to what this tool publishes. Absent while the call waits for approval.
   */
  results?: string | null;
}
/**
 * The AI installs or removes npm packages in the app.
 */
export interface InstallNpmPackageCall {
  /**
   * The tool that was called.
   */
  name: "install_npm_package";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: InstallPackageArguments | null;
}
/**
 * The package operations the builder runs.
 */
export interface InstallPackageArguments {
  /**
   * Requested package operations.
   */
  packages?: PackageOperation[];
}
/**
 * A package operation. Versions and package-manager output are never included.
 */
export interface PackageOperation {
  /**
   * Package name.
   */
  name?: string;
  /**
   * Requested operation, such as `install`.
   */
  action?: string;
}
/**
 * The AI runs code inside the app preview to inspect it.
 */
export interface PreviewExecuteCodeCall {
  /**
   * The tool that was called.
   */
  name: "preview_execute_code";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: ExecDisplay | null;
}
/**
 * The AI takes a screenshot of the app preview to check its work.
 */
export interface PreviewScreenshotCall {
  /**
   * The tool that was called.
   */
  name: "preview_screenshot";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: SummaryDisplay | null;
}
/**
 * The AI runs code that only reads the app's data.
 */
export interface ReadOnlyExecToolCall {
  /**
   * The tool that was called.
   */
  name: "read_only_exec_tool";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: ExecDisplay | null;
}
/**
 * The AI reads a file in the imported repository.
 */
export interface ReadRepoFileCall {
  /**
   * The tool that was called.
   */
  name: "read_repo_file";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: FileDisplay | null;
}
/**
 * The AI runs a shell command in the imported repository's sandbox.
 */
export interface RunShellCommandCall {
  /**
   * The tool that was called.
   */
  name: "run_shell_command";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: SummaryDisplay | null;
}
/**
 * The AI asks the user for secret values, such as API keys. The call waits until the user supplies them.
 */
export interface SetSecretsCall {
  /**
   * The tool that was called.
   */
  name: "set_secrets";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: SetSecretsArguments | null;
}
/**
 * The secrets the builder asks for.
 */
export interface SetSecretsArguments {
  /**
   * Requested secrets.
   */
  secrets_schema?: SecretField[];
}
/**
 * A requested secret. Its value is never sent over the socket.
 */
export interface SecretField {
  /**
   * Requested secret name.
   */
  secretName?: string;
  /**
   * Where to obtain it.
   */
  description?: string;
}
/**
 * The AI updates records in one of the app's entities.
 */
export interface UpdateEntitiesCall {
  /**
   * The tool that was called.
   */
  name: "update_entities";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: EntityChangeArguments | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: EntityDisplay | null;
}
/**
 * The AI adds settled points to the plan.
 */
export interface UpdatePlanCall {
  /**
   * The tool that was called.
   */
  name: "update_plan";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the AI asked the tool to do, narrowed to what this tool publishes.
   */
  arguments?: UpdatePlanArguments | null;
}
/**
 * Settled plan points.
 */
export interface UpdatePlanArguments {
  /**
   * Plan updates in their emitted order.
   */
  updates?: PlanUpdate[];
  /**
   * Base plan sections the builder considers sufficiently specified.
   */
  sections_with_enough?: string[];
}
/**
 * An add-only plan update.
 */
export interface PlanUpdate {
  /**
   * Update action.
   */
  action?: string;
  /**
   * Plan section key.
   */
  section?: string;
  /**
   * User-facing section label.
   */
  section_label?: string;
  /**
   * Plan point.
   */
  text?: string;
}
/**
 * The AI writes a file in the app.
 */
export interface WriteFileCall {
  /**
   * The tool that was called.
   */
  name: "write_file";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: FileDisplay | null;
}
/**
 * The AI writes a file in the imported repository.
 */
export interface WriteRepoFileCall {
  /**
   * The tool that was called.
   */
  name: "write_repo_file";
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
  /**
   * What the tool touched, for showing its progress. Never file contents or commands.
   */
  display?: FileDisplay | null;
}
/**
 * A call to any other tool. Only its name and progress are published.
 */
export interface OtherToolCall {
  /**
   * The tool that was called.
   */
  name: string;
  /**
   * ID of the call. Every update to the call carries the same ID.
   */
  id?: string | null;
  /**
   * `true` once the call has paused for the user's answer or approval. It stays `true` after the user answers, so read `status` to know whether the call is still waiting.
   */
  requires_user_input?: boolean | null;
  /**
   * `true` when the call needed approval but ran at once because the app has Auto approve on. It never paused, and its result is real.
   */
  auto_approved?: boolean | null;
  /**
   * `running` while the tool works, `success` or `error` once it finished, `stopped` when the user stopped the turn, and `waiting_for_user_input` while it waits for the user's answer or approval.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Whether the call changed the app or its data. `false` means it finished without changing anything. `null` means the tool did not report it, so whether it changed anything is unknown.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer the call waits for, while `status` is `waiting_for_user_input`.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why the call waits for approval, from the check that paused it. Present only while `status` is `waiting_for_user_input`.
   */
  approval?:
    | (
        | BackendFunctionEntityDeleteApproval
        | BashApproval
        | EntityRlsGuardApproval
        | ExecToolEntityMutationApproval
        | ExecToolGithubRepoWriteApproval
        | ExecToolInviteUserApproval
        | ExecToolSendEmailApproval
        | ExecToolSendSmsApproval
        | OtherApproval
      )
    | null;
}
/**
 * Message timestamp, without author identity.
 */
export interface MessageMetadata {
  /**
   * Time the message was created, as a UTC timestamp in ISO 8601 format.
   */
  created_date?: string | null;
}
/**
 * Scalar parameters a chat UI needs while a turn runs.
 */
export interface MessageParams {
  /**
   * Identifier the sending client attached, to match its optimistic message.
   */
  client_creation_id?: string;
  /**
   * The message was sent in plan mode.
   */
  plan_mode?: boolean;
  /**
   * The message approves a plan.
   */
  plan_approved?: boolean;
  /**
   * The message expects no AI reply.
   */
  skip_ai_response?: boolean;
  /**
   * System message category.
   */
  system_message_type?: string;
}
/**
 * The prompts the builder runs next, in order.
 */
export interface QueueState {
  /**
   * Queued prompts, in the order they will run.
   */
  items?: QueueItem[] | null;
  /**
   * Whether the queue is paused, so queued prompts wait. A person can pause it, and the builder pauses it while the AI waits for an answer.
   */
  is_paused?: boolean | null;
}
/**
 * A prompt waiting in the queue.
 */
export interface QueueItem {
  /**
   * ID of the queued prompt.
   */
  id?: string | null;
  /**
   * Text of the prompt.
   */
  content?: string | null;
  /**
   * ID of the branch the prompt runs on, or `null` for the main branch.
   */
  branch_id?: string | null;
  /**
   * Time the prompt was queued, as a UTC timestamp in ISO 8601 format.
   */
  created_at?: string | null;
}
/**
 * The app's build status changed, because a turn started, finished or failed.
 */
export interface AppStatusChanged {
  /**
   * The new status, or `null` when the status was cleared.
   */
  status: StatusObject | null;
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * The builder started, finished or failed a turn. Null status clears it.
 */
export interface AppStatusChangedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: AppStatusChanged;
}
/**
 * Something changed outside the chat. Re-read it, because the event carries no content.
 */
export interface BranchChange {
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * A branch was deleted.
 */
export interface BranchDeletedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: BranchChange;
}
/**
 * The conversation was rewritten (undo, restore, sync). Rejoin the room for a fresh snapshot.
 */
export interface ConversationChangedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: BranchChange;
}
/**
 * The app's files changed outside a chat turn.
 */
export interface FilesChangedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: BranchChange;
}
/**
 * A generated image finished or failed. Replace `placeholder_url` with `image_url` wherever the app shows it.
 */
export interface ImageResolved {
  /**
   * `pending` while the image generates, `completed` once `image_url` is ready, `failed` when generation failed.
   */
  status?: ("pending" | "completed" | "failed") | null;
  /**
   * Placeholder URL the app shows while the image generates. Match it to find where the image appears.
   */
  placeholder_url?: string | null;
  /**
   * URL of the finished image, or `null` while it is pending or after it failed.
   */
  image_url?: string | null;
}
/**
 * A generated image finished or failed. Replace its `placeholder_url` wherever it appears.
 */
export interface ImageResolvedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: ImageResolved;
}
/**
 * A chat message was removed or hidden. Drop the message with `message_id`.
 */
export interface MessageRemoved {
  /**
   * ID of the removed message.
   */
  message_id: string;
  /**
   * ID of the conversation the message belongs to. Each branch has its own conversation, so a viewer showing one branch can drop another branch's messages.
   */
  conversation_id?: string | null;
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * A chat message was removed or hidden. An `id` the viewer never saw is a no-op.
 */
export interface MessageRemovedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: MessageRemoved;
}
/**
 * A chat message was added or changed. Replace the message with the same `id`.
 */
export interface MessageUpdated {
  /**
   * The message in full, as it now reads.
   */
  message: Message;
  /**
   * ID of the conversation the message belongs to. Each branch has its own conversation, so a viewer showing one branch can drop another branch's messages.
   */
  conversation_id?: string | null;
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * A chat message was added or replaced. Replace the message with the same `id`.
 */
export interface MessageUpdatedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: MessageUpdated;
}
/**
 * The app preview should show a page of the app, usually one the AI just built.
 */
export interface PreviewNavigationRequested {
  /**
   * Path of the page to show, relative to the app's root, such as `/settings`.
   */
  path: string;
  /**
   * Navigate even when the user has moved away from the page.
   */
  force: boolean;
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * Show this page of the app in the preview.
 */
export interface PreviewNavigationRequestedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: PreviewNavigationRequested;
}
/**
 * The app preview should reload, because its files changed under it.
 */
export interface PreviewReloadRequested {
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * Reload the app preview.
 */
export interface PreviewReloadRequestedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: PreviewReloadRequested;
}
/**
 * The imported app's pull request changed.
 */
export interface PullRequestChangedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: BranchChange;
}
/**
 * The whole prompt queue after a change. Replace the queue with it.
 */
export interface QueueUpdated {
  /**
   * Queued prompts, in the order they will run.
   */
  items?: QueueItem[] | null;
  /**
   * Whether the queue is paused, so queued prompts wait. A person can pause it, and the builder pauses it while the AI waits for an answer.
   */
  is_paused?: boolean | null;
  /**
   * ID of the queued prompt the builder just picked up to run. Absent when a prompt was added, removed or cleared.
   */
  processed_item_id?: string | null;
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * The whole prompt queue, after any change.
 */
export interface QueueUpdatedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: QueueUpdated;
}
/**
 * The imported app's repository changed.
 */
export interface RepositoryChangedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: BranchChange;
}
/**
 * A join was refused because the app is not on the session's allowlist, or the socket joins too often.
 */
export interface RoomAccessDeniedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: RoomNotice;
}
/**
 * An empty payload. The app concerned is the event's `room`.
 */
export interface RoomNotice {}
/**
 * The app left the session's allowlist, or its workspace. Events for it stop. Do not rejoin.
 */
export interface RoomAccessRevokedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: RoomNotice;
}
/**
 * The join held but its snapshot failed. Live events still arrive. Rejoin later for a snapshot.
 */
export interface RoomSnapshotUnavailableEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: RoomNotice;
}
/**
 * The session is over. The socket disconnects right after this event.
 */
export interface SessionEnded {
  /**
   * `expired`: ask the partner backend for a new session. `revoked`: the partner or an admin ended it, so do not reconnect. `replaced`: a newer socket took the session, so stop.
   */
  reason: "expired" | "revoked" | "replaced";
}
/**
 * The session ended (expired, revoked, or taken by a newer socket). The socket disconnects next.
 */
export interface SessionEndedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: SessionEnded;
}
/**
 * How far a long-running task has got.
 */
export interface TaskProgress {
  /**
   * Items processed so far.
   */
  current?: number | null;
  /**
   * Items to process in all.
   */
  total?: number | null;
  /**
   * Share of the work done, from 0 to 100.
   */
  percentage?: number | null;
}
/**
 * A long-running task, such as a data import, started, made progress, finished, failed or was cancelled.
 */
export interface TaskProgressed {
  /**
   * ID of the tool call that started the task.
   */
  tool_call_id?: string | null;
  /**
   * ID of the message that holds that tool call.
   */
  message_id?: string | null;
  /**
   * `task_started`, `task_progress`, `task_completed`, `task_failed` or `task_cancelled`.
   */
  event_type?: ("task_started" | "task_progress" | "task_completed" | "task_failed" | "task_cancelled") | null;
  /**
   * Progress so far.
   */
  progress?: TaskProgress | null;
  /**
   * ID of the branch the change belongs to. Omitted or `null` means the main branch.
   */
  branch_id?: string | null;
}
/**
 * Progress of a long-running tool, by `tool_call_id`.
 */
export interface TaskProgressedEvent {
  /**
   * The app the event belongs to, as `/apps/{app_id}`. It is `null` for `session.ended`, which concerns the whole session.
   */
  room: string | null;
  /**
   * The event's payload. Its fields depend on the event.
   */
  data: TaskProgressed;
}

/** Every event the service sends, by name, mapped to its `data` payload. */
export interface ServerEventMap {
  /** A chat message was added or replaced. Replace the message with the same `id`. */
  "message.updated": MessageUpdated;
  /** A chat message was removed or hidden. An `id` the viewer never saw is a no-op. */
  "message.removed": MessageRemoved;
  /** The builder started, finished or failed a turn. Null status clears it. */
  "app.status_changed": AppStatusChanged;
  /** Reload the app preview. */
  "preview.reload_requested": PreviewReloadRequested;
  /** Show this page of the app in the preview. */
  "preview.navigation_requested": PreviewNavigationRequested;
  /** The whole prompt queue, after any change. */
  "queue.updated": QueueUpdated;
  /** Progress of a long-running tool, by `tool_call_id`. */
  "task.progressed": TaskProgressed;
  /** A generated image finished or failed. Replace its `placeholder_url` wherever it appears. */
  "image.resolved": ImageResolved;
  /** The conversation was rewritten (undo, restore, sync). Rejoin the room for a fresh snapshot. */
  "conversation.changed": BranchChange;
  /** The app's files changed outside a chat turn. */
  "files.changed": BranchChange;
  /** A branch was deleted. */
  "branch.deleted": BranchChange;
  /** The imported app's repository changed. */
  "repository.changed": BranchChange;
  /** The imported app's pull request changed. */
  "pull_request.changed": BranchChange;
  /** The session ended (expired, revoked, or taken by a newer socket). The socket disconnects next. */
  "session.ended": SessionEnded;
  /** A join was refused because the app is not on the session's allowlist, or the socket joins too often. */
  "room.access_denied": RoomNotice;
  /** The app left the session's allowlist, or its workspace. Events for it stop. Do not rejoin. */
  "room.access_revoked": RoomNotice;
  /** The join held but its snapshot failed. Live events still arrive. Rejoin later for a snapshot. */
  "room.snapshot_unavailable": RoomNotice;
  /** The app's current status and its last 50 public messages, after every join. Replace the app's state with it. */
  "app.snapshot": Snapshot;
}

/** Every message a client sends, by name, mapped to its payload. */
export interface ClientMessageMap {
  /** Join an app's room, once per app after every connect. An `app.snapshot` follows, then its live events. Refused with `room.access_denied` when the app is not on the session's allowlist, or past 30 joins a minute. */
  "join": JoinMessage;
  /** Leave an app's room. Its events stop. */
  "leave": LeaveMessage;
}

/** @internal */
export const serverEventNames = ["message.updated","message.removed","app.status_changed","preview.reload_requested","preview.navigation_requested","queue.updated","task.progressed","image.resolved","conversation.changed","files.changed","branch.deleted","repository.changed","pull_request.changed","session.ended","room.access_denied","room.access_revoked","room.snapshot_unavailable","app.snapshot"] as const;
