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
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: Snapshot;
}
/**
 * The `Snapshot` schema.
 */
export interface Snapshot {
  /**
   * The `status` field.
   */
  status: StatusObject | null;
  /**
   * Messages.
   */
  messages: Message[];
  /**
   * The main branch's prompt queue.
   */
  queue: QueueState;
}
/**
 * Public builder state, without error diagnostics or billing context.
 */
export interface StatusObject {
  /**
   * State.
   */
  state?: ("ready" | "processing" | "error") | null;
  /**
   * Turn ID.
   */
  turn_id?: string | null;
  /**
   * Last updated date.
   */
  last_updated_date?: string | null;
}
/**
 * A public chat message. Replace the message with the same `id` as a whole.
 */
export interface Message {
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Role.
   */
  role?: ("user" | "assistant" | "system") | null;
  /**
   * Content.
   */
  content?: string | null;
  /**
   * Tool calls.
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
   * Checkpoint ID.
   */
  checkpoint_id?: string | null;
  /**
   * The `metadata` field.
   */
  metadata?: MessageMetadata | null;
  /**
   * Additional message params.
   */
  additional_message_params?: MessageParams | null;
}
/**
 * A `ask_clarifying_questions` call.
 */
export interface AskClarifyingQuestionsCall {
  /**
   * Name.
   */
  name: "ask_clarifying_questions";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
   */
  arguments?: QuestionArguments | null;
  /**
   * The `user_input` field.
   */
  user_input?: QuestionInput | null;
}
/**
 * What a parked call waits for. Render the widget by kind, not by tool name.
 */
export interface WaitingOn {
  /**
   * `choice`: pick among options. `input`: supply values. `approval`: approve or reject.
   */
  kind?: "choice" | "input" | "approval";
}
/**
 * Parked by the `backend_function_entity_delete` guard.
 */
export interface BackendFunctionEntityDeleteApproval {
  /**
   * Guard.
   */
  guard: "backend_function_entity_delete";
  /**
   * Why the guard parked the call.
   */
  reason?: string | null;
  /**
   * The `details` field.
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
   * The guard could not verify the function's source.
   */
  inspection_failed?: boolean;
}
/**
 * Parked by the `bash_approval` guard.
 */
export interface BashApproval {
  /**
   * Guard.
   */
  guard: "bash_approval";
}
/**
 * Parked by the `entity_rls_guard` guard.
 */
export interface EntityRlsGuardApproval {
  /**
   * Guard.
   */
  guard: "entity_rls_guard";
  /**
   * Why the guard parked the call.
   */
  reason?: string | null;
  /**
   * The `details` field.
   */
  details?: AccessRuleChangeDetails | null;
}
/**
 * Parked by the `exec_tool_entity_mutation` guard.
 */
export interface ExecToolEntityMutationApproval {
  /**
   * Guard.
   */
  guard: "exec_tool_entity_mutation";
  /**
   * Why the guard parked the call.
   */
  reason?: string | null;
  /**
   * The `details` field.
   */
  details?: EntityMutationDetails | null;
}
/**
 * What a parked entity mutation would do. Record data is never included.
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
 * Parked by the `exec_tool_github_repo_write` guard.
 */
export interface ExecToolGithubRepoWriteApproval {
  /**
   * Guard.
   */
  guard: "exec_tool_github_repo_write";
  /**
   * Why the guard parked the call.
   */
  reason?: string | null;
  /**
   * The `details` field.
   */
  details?: SummaryDetails | null;
}
/**
 * What a parked code execution would do.
 */
export interface SummaryDetails {
  /**
   * The agent's summary of what the code does.
   */
  summary?: string;
}
/**
 * Parked by the `exec_tool_invite_user` guard.
 */
export interface ExecToolInviteUserApproval {
  /**
   * Guard.
   */
  guard: "exec_tool_invite_user";
  /**
   * Why the guard parked the call.
   */
  reason?: string | null;
  /**
   * The `details` field.
   */
  details?: SummaryDetails | null;
}
/**
 * Parked by the `exec_tool_send_email` guard.
 */
export interface ExecToolSendEmailApproval {
  /**
   * Guard.
   */
  guard: "exec_tool_send_email";
  /**
   * Why the guard parked the call.
   */
  reason?: string | null;
  /**
   * The `details` field.
   */
  details?: SummaryDetails | null;
}
/**
 * Parked by the `exec_tool_send_sms` guard.
 */
export interface ExecToolSendSmsApproval {
  /**
   * Guard.
   */
  guard: "exec_tool_send_sms";
  /**
   * Why the guard parked the call.
   */
  reason?: string | null;
  /**
   * The `details` field.
   */
  details?: SummaryDetails | null;
}
/**
 * Parked by a guard that publishes only its name.
 */
export interface OtherApproval {
  /**
   * Guard.
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
   * Selectable options; a bare string is its label.
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
 * A `ask_plan_questions` call.
 */
export interface AskPlanQuestionsCall {
  /**
   * Name.
   */
  name: "ask_plan_questions";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
   */
  arguments?: QuestionArguments | null;
  /**
   * The `user_input` field.
   */
  user_input?: QuestionInput | null;
}
/**
 * A `bash` call.
 */
export interface BashCall {
  /**
   * Name.
   */
  name: "bash";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
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
 * A `create_entity_records` call.
 */
export interface CreateEntityRecordsCall {
  /**
   * Name.
   */
  name: "create_entity_records";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: EntityRecordsDisplay | null;
}
/**
 * The `EntityRecordsDisplay` schema.
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
 * A `delete_entities` call.
 */
export interface DeleteEntitiesCall {
  /**
   * Name.
   */
  name: "delete_entities";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
   */
  arguments?: EntityChangeArguments | null;
  /**
   * The `display` field.
   */
  display?: EntityDisplay | null;
}
/**
 * An entity update or delete; the entity is in `display.entity_name`.
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
 * A `delete_file` call.
 */
export interface DeleteFileCall {
  /**
   * Name.
   */
  name: "delete_file";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
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
 * A `edit_repo_file` call.
 */
export interface EditRepoFileCall {
  /**
   * Name.
   */
  name: "edit_repo_file";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: FileDisplay | null;
}
/**
 * A `exec_tool` call.
 */
export interface ExecToolCall {
  /**
   * Name.
   */
  name: "exec_tool";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
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
   * The code changed entity data: refresh the preview.
   */
  writes_entities?: boolean;
}
/**
 * A `find_replace` call.
 */
export interface FindReplaceCall {
  /**
   * Name.
   */
  name: "find_replace";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: FileDisplay | null;
}
/**
 * A `generate_game_background` call.
 */
export interface GenerateGameBackgroundCall {
  /**
   * Name.
   */
  name: "generate_game_background";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * Results.
   */
  results?: string | null;
}
/**
 * A `generate_game_image` call.
 */
export interface GenerateGameImageCall {
  /**
   * Name.
   */
  name: "generate_game_image";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
   */
  arguments?: GameImageArguments | null;
  /**
   * Results.
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
 * A `generate_image` call.
 */
export interface GenerateImageCall {
  /**
   * Name.
   */
  name: "generate_image";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
   */
  arguments?: MediaArguments | null;
  /**
   * The `results` field.
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
 * A `generate_prd` call.
 */
export interface GeneratePrdCall {
  /**
   * Name.
   */
  name: "generate_prd";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
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
 * A `generate_video` call.
 */
export interface GenerateVideoCall {
  /**
   * Name.
   */
  name: "generate_video";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
   */
  arguments?: MediaArguments | null;
  /**
   * Results.
   */
  results?: string | null;
}
/**
 * A `install_npm_package` call.
 */
export interface InstallNpmPackageCall {
  /**
   * Name.
   */
  name: "install_npm_package";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
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
 * A `preview_execute_code` call.
 */
export interface PreviewExecuteCodeCall {
  /**
   * Name.
   */
  name: "preview_execute_code";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: ExecDisplay | null;
}
/**
 * A `preview_screenshot` call.
 */
export interface PreviewScreenshotCall {
  /**
   * Name.
   */
  name: "preview_screenshot";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: SummaryDisplay | null;
}
/**
 * A `read_only_exec_tool` call.
 */
export interface ReadOnlyExecToolCall {
  /**
   * Name.
   */
  name: "read_only_exec_tool";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: ExecDisplay | null;
}
/**
 * A `read_repo_file` call.
 */
export interface ReadRepoFileCall {
  /**
   * Name.
   */
  name: "read_repo_file";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: FileDisplay | null;
}
/**
 * A `run_shell_command` call.
 */
export interface RunShellCommandCall {
  /**
   * Name.
   */
  name: "run_shell_command";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: SummaryDisplay | null;
}
/**
 * A `set_secrets` call.
 */
export interface SetSecretsCall {
  /**
   * Name.
   */
  name: "set_secrets";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
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
 * A `update_entities` call.
 */
export interface UpdateEntitiesCall {
  /**
   * Name.
   */
  name: "update_entities";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
   */
  arguments?: EntityChangeArguments | null;
  /**
   * The `display` field.
   */
  display?: EntityDisplay | null;
}
/**
 * A `update_plan` call.
 */
export interface UpdatePlanCall {
  /**
   * Name.
   */
  name: "update_plan";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `arguments` field.
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
 * A `write_file` call.
 */
export interface WriteFileCall {
  /**
   * Name.
   */
  name: "write_file";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: FileDisplay | null;
}
/**
 * A `write_repo_file` call.
 */
export interface WriteRepoFileCall {
  /**
   * Name.
   */
  name: "write_repo_file";
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * The `display` field.
   */
  display?: FileDisplay | null;
}
/**
 * A call to a tool that publishes only its name and progress.
 */
export interface OtherToolCall {
  /**
   * Name.
   */
  name: string;
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Requires user input.
   */
  requires_user_input?: boolean | null;
  /**
   * Auto approved.
   */
  auto_approved?: boolean | null;
  /**
   * Status.
   */
  status?: ("running" | "success" | "error" | "stopped" | "waiting_for_user_input") | null;
  /**
   * Mutation applied.
   */
  mutation_applied?: boolean | null;
  /**
   * What kind of answer a parked call waits for.
   */
  waiting_on?: WaitingOn | null;
  /**
   * Why a safety guard parked the call: the guard, and its declared reason and details.
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
   * Created date.
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
 * The prompt queue: the prompts the builder runs next, in order.
 */
export interface QueueState {
  /**
   * Items.
   */
  items?: QueueItem[] | null;
  /**
   * Is paused.
   */
  is_paused?: boolean | null;
}
/**
 * A prompt waiting in the queue.
 */
export interface QueueItem {
  /**
   * Id.
   */
  id?: string | null;
  /**
   * Content.
   */
  content?: string | null;
  /**
   * Branch ID.
   */
  branch_id?: string | null;
  /**
   * Created at.
   */
  created_at?: string | null;
}
/**
 * The `AppStatusChanged` schema.
 */
export interface AppStatusChanged {
  /**
   * The `status` field.
   */
  status: StatusObject | null;
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * The builder started, finished or failed a turn. Null status clears it.
 */
export interface AppStatusChangedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: AppStatusChanged;
}
/**
 * Re-read what changed; the event carries no content.
 */
export interface BranchChange {
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * A branch was deleted.
 */
export interface BranchDeletedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: BranchChange;
}
/**
 * The conversation was rewritten (undo, restore, sync). Rejoin the room for a fresh snapshot.
 */
export interface ConversationChangedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: BranchChange;
}
/**
 * The app's files changed outside a chat turn.
 */
export interface FilesChangedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: BranchChange;
}
/**
 * The `ImageResolved` schema.
 */
export interface ImageResolved {
  /**
   * Status.
   */
  status?: ("pending" | "completed" | "failed") | null;
  /**
   * Placeholder URL.
   */
  placeholder_url?: string | null;
  /**
   * Image URL.
   */
  image_url?: string | null;
}
/**
 * A generated image finished or failed. Replace its `placeholder_url` wherever it appears.
 */
export interface ImageResolvedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: ImageResolved;
}
/**
 * The `MessageRemoved` schema.
 */
export interface MessageRemoved {
  /**
   * Message ID.
   */
  message_id: string;
  /**
   * Conversation ID.
   */
  conversation_id?: string | null;
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * A chat message was removed or hidden. An `id` the viewer never saw is a no-op.
 */
export interface MessageRemovedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: MessageRemoved;
}
/**
 * The `MessageUpdated` schema.
 */
export interface MessageUpdated {
  /**
   * The `message` field.
   */
  message: Message;
  /**
   * Conversation ID.
   */
  conversation_id?: string | null;
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * A chat message was added or replaced. Replace the message with the same `id`.
 */
export interface MessageUpdatedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: MessageUpdated;
}
/**
 * The `PreviewNavigationRequested` schema.
 */
export interface PreviewNavigationRequested {
  /**
   * Path.
   */
  path: string;
  /**
   * Navigate even when the user has moved away from the page.
   */
  force: boolean;
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * Show this page of the app in the preview.
 */
export interface PreviewNavigationRequestedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: PreviewNavigationRequested;
}
/**
 * The `PreviewReloadRequested` schema.
 */
export interface PreviewReloadRequested {
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * Reload the app preview.
 */
export interface PreviewReloadRequestedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: PreviewReloadRequested;
}
/**
 * The imported app's pull request changed.
 */
export interface PullRequestChangedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: BranchChange;
}
/**
 * The `QueueUpdated` schema.
 */
export interface QueueUpdated {
  /**
   * Items.
   */
  items?: QueueItem[] | null;
  /**
   * Is paused.
   */
  is_paused?: boolean | null;
  /**
   * Processed item ID.
   */
  processed_item_id?: string | null;
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * The whole prompt queue, after any change.
 */
export interface QueueUpdatedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: QueueUpdated;
}
/**
 * The imported app's repository changed.
 */
export interface RepositoryChangedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: BranchChange;
}
/**
 * A join was refused: the app is not on the session's allowlist, or the socket joins too often.
 */
export interface RoomAccessDeniedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: RoomNotice;
}
/**
 * The app is named by the event's room.
 */
export interface RoomNotice {}
/**
 * The app left the session's allowlist, or its workspace. Events for it stop; do not rejoin.
 */
export interface RoomAccessRevokedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: RoomNotice;
}
/**
 * The join held but its snapshot failed. Live events still arrive; rejoin later for a snapshot.
 */
export interface RoomSnapshotUnavailableEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: RoomNotice;
}
/**
 * The `SessionEnded` schema.
 */
export interface SessionEnded {
  /**
   * `expired`: ask the partner backend for a new session. `revoked`: the partner or an admin ended it; don't reconnect. `replaced`: another tab took it; stop.
   */
  reason: "expired" | "revoked" | "replaced";
}
/**
 * The session ended (expired, revoked, or taken by a newer socket). The socket disconnects next.
 */
export interface SessionEndedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
   */
  data: SessionEnded;
}
/**
 * The `TaskProgress` schema.
 */
export interface TaskProgress {
  /**
   * Current.
   */
  current?: number | null;
  /**
   * Total.
   */
  total?: number | null;
  /**
   * Percentage.
   */
  percentage?: number | null;
}
/**
 * The `TaskProgressed` schema.
 */
export interface TaskProgressed {
  /**
   * Tool call ID.
   */
  tool_call_id?: string | null;
  /**
   * Message ID.
   */
  message_id?: string | null;
  /**
   * Event type.
   */
  event_type?: string | null;
  /**
   * The `progress` field.
   */
  progress?: TaskProgress | null;
  /**
   * Branch ID.
   */
  branch_id?: string | null;
}
/**
 * Progress of a long-running tool, by `tool_call_id`.
 */
export interface TaskProgressedEvent {
  /**
   * Room.
   */
  room: string | null;
  /**
   * The `data` field.
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
  /** A join was refused: the app is not on the session's allowlist, or the socket joins too often. */
  "room.access_denied": RoomNotice;
  /** The app left the session's allowlist, or its workspace. Events for it stop; do not rejoin. */
  "room.access_revoked": RoomNotice;
  /** The join held but its snapshot failed. Live events still arrive; rejoin later for a snapshot. */
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
