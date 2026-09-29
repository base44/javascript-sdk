/** Activity a file, execution or entity tool declared public. */
export interface ToolDisplay {
  /** Changed file paths for a file operation. Source bodies and diffs are never included. */
  file_paths?: string[];
  /** Whether a file write intentionally used empty content. */
  content_empty?: boolean;
  /** Reviewed execution activity summary. Commands and execution output are never included. */
  summary?: string;
  /** Whether a reviewed execution action changed entity data. */
  writes_entities?: boolean;
  /** Entity type affected by an entity operation. Records and query values are never included. */
  entity_name?: string;
  /** Number of records affected when supplied by the producer. */
  record_count?: number;
}

/** A selectable answer to a builder question. */
export interface ToolQuestionOption {
  /** Visible option label. */
  label?: string;
}

/** A builder question. Image/HTML source and private design context are excluded. */
export interface ToolQuestion {
  /** Visible question text. */
  question?: string;
  /** Question category. */
  type?: string;
  /** Optional visible supporting text. */
  description?: string;
  /** Whether more than one answer may be selected. */
  multi_select?: boolean;
  /** Plan section the question covers. */
  covers?: string;
  /** Selectable options; a bare string option is its label. */
  options?: (ToolQuestionOption | string)[];
}

/** `ask_clarifying_questions` and `ask_plan_questions` arguments. */
export interface ToolQuestionArguments {
  /** Questions presented to the user. */
  questions?: ToolQuestion[];
}

/** A requested secret field. The secret value is never sent over the socket. */
export interface ToolSecretField {
  /** Requested secret name. */
  secretName?: string;
  /** Optional explanation of where to obtain it. */
  description?: string;
}

/** `set_secrets` arguments. */
export interface ToolSecretArguments {
  /** Requested secret fields. */
  secrets_schema?: ToolSecretField[];
}

/** A package operation. Versions and package-manager output are excluded. */
export interface ToolPackageOperation {
  /** Package name. */
  name?: string;
  /** Requested package operation. */
  action?: string;
}

/** `install_npm_package` arguments. */
export interface ToolPackageArguments {
  /** Requested package operations. */
  packages?: ToolPackageOperation[];
}

/** An add-only builder plan update. */
export interface ToolPlanUpdate {
  /** Update action. */
  action?: string;
  /** Plan section key. */
  section?: string;
  /** Optional user-facing section label. */
  section_label?: string;
  /** Plan point. */
  text?: string;
}

/** `update_plan` arguments. */
export interface ToolPlanArguments {
  /** Plan updates in their emitted order. */
  updates?: ToolPlanUpdate[];
  /** Base plan sections the builder considers sufficiently specified. */
  sections_with_enough?: string[];
}

/** `generate_prd` arguments: the user's own plan. In plan mode the message `content` beside it can be empty. */
export interface ToolPrdArguments {
  /** App or feature name. */
  app_name?: string;
  /** What is being built and why. */
  intent_and_goal?: string;
  /** Who uses it and their roles. */
  audience_and_roles?: string;
  /** End-to-end user flows. */
  core_flows?: string[];
  /** Specific technical requirements. */
  technical_requirements?: string;
  /** Design preferences. */
  design_preferences?: string;
  /** Build or plan declaration, when the builder asks for one. */
  prd_type?: string;
  /** Store platform settled in planning, for e-commerce plans. */
  store_platform?: string;
  /** Engine settled in planning, for game plans. */
  game_engine?: string;
}

/** Image, game-image and video generation arguments. */
export interface ToolMediaArguments {
  /** Visible media label. */
  label?: string;
  /** Requested image or video aspect ratio. */
  aspect_ratio?: string;
}

/** The public arguments of a tool that declares them; narrow by the tool call's `name`. */
export type ToolArguments =
  | ToolQuestionArguments | ToolSecretArguments | ToolPackageArguments
  | ToolPlanArguments | ToolPrdArguments | ToolMediaArguments;

/** Generated-media state. Raw generation prompts and IDs are never included. */
export interface ToolMediaResult {
  /** Placeholder URL, used to associate an `image.resolved` event with this tool. */
  placeholder_url?: string;
  /** Current media-generation status. */
  status?: "pending" | "completed" | "failed";
  /** Generated asset URL, once available. */
  image_url?: string | null;
}

/** An answer to a clarifying question. Secret-form input is never included. */
export interface ToolQuestionAnswer {
  /** Zero-based question index. */
  question_index?: number;
  /** Label selected for a single-select question. */
  selected_label?: string;
  /** Labels selected for a multi-select question. */
  selected_labels?: string[];
  /** User-provided free-text answer. Structural filtering does not redact prose. */
  custom_text?: string;
}

/** Clarifying-question answers. */
export interface ToolQuestionInput {
  /** Answers supplied to the question card. */
  answers?: ToolQuestionAnswer[];
}

/** Why a safety guard parked a call for approval. Only present while the call waits. */
export interface ToolGuardApproval {
  /** Guard identifier, e.g. `exec_tool_send_email` or `bash_approval`. */
  guard: string;
  /** Human-readable reason, for guards whose reason never quotes input (not shell commands). */
  reason?: string;
  /** The details the guard declares public; commands and record data are never included. */
  details?: {
    /** Entity method the code calls, e.g. `delete`. */
    method?: string;
    /** The agent's summary of what the code does. */
    summary?: string;
    /** Entity whose access rules change. */
    entity_name?: string;
    /** How the access rules change. */
    change_type?: string;
    /** Access operations whose rules change. */
    changed_ops?: string[];
    /** Backend function under test. */
    function_name?: string;
    /** The guard could not verify the function's source. */
    inspection_failed?: boolean;
  };
}

/** Public progress of a builder tool call. Only what the tool and its guard declare public is present. */
export interface ToolCall {
  /** Stable tool call identifier. */
  id?: string;
  /** Tool name. */
  name?: string;
  /** Current execution state. */
  status?: "running" | "success" | "error" | "stopped" | "waiting_for_user_input";
  /** Whether the tool needs a user response through the partner backend. */
  requires_user_input?: boolean;
  /** Whether the builder auto-approved the operation. */
  auto_approved?: boolean;
  /** Whether the mutation was applied. */
  mutation_applied?: boolean | null;
  /** Kind of response a parked call waits for. */
  waiting_on?: {
    /** Kind of response expected. */
    kind?: "approval" | "choice" | "input";
  };
  /** The tool's public arguments; absent for tools that declare none and for partial streaming arguments. */
  arguments?: ToolArguments;
  /** What a file, execution or entity tool touched. */
  display?: ToolDisplay;
  /** Clarifying-question answers. */
  user_input?: ToolQuestionInput;
  /** Generated media, once the call is not waiting on a guard: the image tool's state, or a URL alone
   * (a game asset's placeholder, which `image.resolved` replaces, or a finished video). */
  results?: ToolMediaResult | string;
  /** A parked call's guard, and its reason and details where the guard declares them. */
  approval?: ToolGuardApproval;
}

/** Scalar parameters a chat UI needs while a turn runs. */
export interface MessageParams {
  /** Identifier the sending client attached, to match its optimistic message. */
  client_creation_id?: string;
  /** The message was sent in plan mode. */
  plan_mode?: boolean;
  /** The message approves a plan. */
  plan_approved?: boolean;
  /** The message expects no AI reply. */
  skip_ai_response?: boolean;
  /** System message category. */
  system_message_type?: string;
}

/** A public chat message. Replace the message with the same `id` as a whole. */
export interface ChatMessage {
  /** Message identifier. */
  id?: string;
  /** Author category. System and hidden messages are never delivered. */
  role?: "user" | "assistant";
  /** Message text; structured content is withheld. Structural filtering is not prose redaction. */
  content?: string | null;
  /** Public tool progress. */
  tool_calls?: ToolCall[] | null;
  /** Message timestamp, without author identity. */
  metadata?: {
    /** ISO timestamp string. */
    created_date?: string;
  };
  /** Checkpoint reference; mutations remain on the partner backend. */
  checkpoint_id?: string | null;
  /** Scalar message parameters. */
  additional_message_params?: MessageParams;
}

/** Public builder state, without error diagnostics or billing context. */
export interface AppStatus {
  /** Current builder state. */
  state?: "ready" | "processing" | "error";
  /** State timestamp. */
  last_updated_date?: string | null;
}

/** Branch scope carried by app events. Null or absent is the main branch. */
export interface BranchScoped {
  /** Branch the change belongs to; null is main. */
  branch_id?: string | null;
}

/** `message.updated`: a chat message was added or replaced. */
export interface MessageUpdated extends BranchScoped {
  /** The whole message; replace the one with the same `id`. */
  message: ChatMessage;
  /** Conversation containing the message. */
  conversation_id?: string | null;
}

/** `message.removed`: a message was removed or hidden. An `id` the viewer never saw is a no-op. */
export interface MessageRemoved extends BranchScoped {
  /** Identifier of the message to remove. */
  message_id: string;
  /** Conversation that contained the message. */
  conversation_id?: string | null;
}

/** `app.status_changed`: a turn started, finished or failed. */
export interface AppStatusChanged extends BranchScoped {
  /** The new state; null clears it. */
  status: AppStatus | null;
}

/** `preview.navigation_requested`: show this page of the app in the preview. */
export interface PreviewNavigationRequested extends BranchScoped {
  /** App path to show. */
  path: string;
  /** Navigate even when the user has moved away from the page. */
  force: boolean;
}

/** A queued builder request. */
export interface QueueItem {
  /** Queue item identifier. */
  id?: string;
  /** User-authored request text. */
  content?: string;
  /** Creation timestamp. */
  created_at?: string;
  /** Branch the request belongs to. */
  branch_id?: string | null;
}

/** `queue.updated`: the whole prompt queue, replacing the previous one. */
export interface QueueUpdated extends BranchScoped {
  /** Pending items. */
  items?: QueueItem[];
  /** Whether queue processing is paused. */
  is_paused?: boolean;
  /** Identifier of the item just processed, when supplied. */
  processed_item_id?: string | null;
}

/** `task.progressed`: progress of a long-running tool. */
export interface TaskProgressed extends BranchScoped {
  /** Associated tool call. */
  tool_call_id?: string | null;
  /** Associated chat message. */
  message_id?: string | null;
  /** Task lifecycle event, e.g. `task_progress`. */
  event_type?: string | null;
  /** Numeric progress only; diagnostic text is withheld. */
  progress?: {
    /** Completed work units. */
    current?: number | null;
    /** Total work units, when known. */
    total?: number | null;
    /** Producer-supplied percentage. */
    percentage?: number | null;
  } | null;
}

/** `image.resolved`: a generated image finished or failed. Replace its `placeholder_url` wherever it appears. */
export type ImageResolved = ToolMediaResult;

/** Mapping of public event names to their payloads. */
export interface PlatformEventMap {
  /** A chat message was added or replaced. */
  "message.updated": MessageUpdated;
  /** A chat message was removed or hidden. */
  "message.removed": MessageRemoved;
  /** The builder started, finished or failed a turn. */
  "app.status_changed": AppStatusChanged;
  /** Reload the app preview. */
  "preview.reload_requested": BranchScoped;
  /** Show a page of the app in the preview. */
  "preview.navigation_requested": PreviewNavigationRequested;
  /** The whole prompt queue. */
  "queue.updated": QueueUpdated;
  /** Progress of a long-running tool. */
  "task.progressed": TaskProgressed;
  /** A generated image finished or failed. */
  "image.resolved": ImageResolved;
  /** The conversation was rewritten (undo, restore, sync). On main, the SDK rejoins for a fresh snapshot. */
  "conversation.changed": BranchScoped;
  /** The app's files changed outside a chat turn. Re-read them. */
  "files.changed": BranchScoped;
  /** A branch was deleted. */
  "branch.deleted": BranchScoped;
  /** The imported app's repository changed. */
  "repository.changed": BranchScoped;
  /** The imported app's pull request changed. */
  "pull_request.changed": BranchScoped;
}

/** Ordered delivery of one public event. */
export type PlatformEvent = {
  [K in keyof PlatformEventMap]: {
    /** Public event name; narrows the payload type. */
    type: K;
    /** Authorized app receiving this event. */
    appId: string;
    /** Event payload. Omitted keys mean unchanged; explicit null clears. */
    data: PlatformEventMap[K];
  }
}[keyof PlatformEventMap];

/** An app's current state: sent after every join and rejoin, and after a main-conversation rewrite. */
export interface Snapshot {
  /** Canonical app room. */
  room: string;
  /** Current builder state. */
  status: AppStatus | null;
  /** The last 50 public messages, oldest first. */
  messages: ChatMessage[];
}
