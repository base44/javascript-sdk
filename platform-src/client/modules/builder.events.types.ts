/** A reviewed file, execution, or entity activity summary. */
export interface ToolDisplayProjection {
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

/** A reviewed selectable answer to a builder question. */
export interface ToolQuestionOption {
  /** Visible option label. */
  label: string;
}

/** A reviewed builder question. Image/HTML source and private design context are excluded. */
export interface ToolQuestion {
  /** Visible question text. */
  question?: string;
  /** Existing question category. */
  type?: string;
  /** Optional visible supporting text. */
  description?: string;
  /** Whether more than one answer may be selected. */
  multi_select?: boolean;
  /** Optional existing plan section identifier. */
  covers?: string;
  /** Reviewed selectable options. */
  options?: ToolQuestionOption[];
}

/** Reviewed question arguments, serialized in `ToolCall.arguments_string`. */
export interface ToolQuestionArguments {
  /** Questions presented by a clarifying-question tool. */
  questions: ToolQuestion[];
}

/** A requested secret field. The secret value is never sent over the socket. */
export interface ToolSecretField {
  /** Requested secret name. */
  secretName: string;
  /** Optional explanation of where to obtain it. */
  description?: string;
}

/** Reviewed secret-form arguments, serialized in `ToolCall.arguments_string`. */
export interface ToolSecretArguments {
  /** Requested secret fields. */
  secrets_schema: ToolSecretField[];
}

/** A reviewed package operation. Versions and package-manager output are excluded. */
export interface ToolPackageOperation {
  /** Package name. */
  name: string;
  /** Requested package operation. */
  action?: string;
}

/** Reviewed package arguments, serialized in `ToolCall.arguments_string`. */
export interface ToolPackageArguments {
  /** Requested package operations. */
  packages: ToolPackageOperation[];
}

/** A reviewed add-only builder plan update. */
export interface ToolPlanUpdate {
  /** Existing update action. */
  action?: string;
  /** Plan section key. */
  section?: string;
  /** Optional user-facing section label. */
  section_label?: string;
  /** Reviewed plan point. */
  text?: string;
}

/** Reviewed plan arguments, serialized in `ToolCall.arguments_string`. */
export interface ToolPlanArguments {
  /** Plan updates in their emitted order. */
  updates?: ToolPlanUpdate[];
  /** Base plan sections the builder considers sufficiently specified. */
  sections_with_enough?: string[];
}

/** Reviewed generated-media arguments, serialized in `ToolCall.arguments_string`. */
export interface ToolMediaArguments {
  /** Visible media label. */
  label?: string;
  /** Requested image or video aspect ratio. */
  aspect_ratio?: string;
}

/** A reviewed answer to a clarifying question. Secret-form input is never included. */
export interface ToolQuestionAnswer {
  /** Zero-based question index. */
  question_index?: number;
  /** Labels selected by the user. */
  selected_labels?: string[];
  /** User-provided free-text answer. Structural filtering does not redact prose. */
  custom_text?: string;
}

/** Reviewed clarifying-question input. */
export interface ToolQuestionInput {
  /** Answers supplied to the question card. */
  answers: ToolQuestionAnswer[];
}

/** Fixed reviewed completion text. Raw tool results and errors are never included. */
export type ToolOutcome =
  | "Secret configuration completed."
  | "Package installation completed."
  | "Plan updated.";

/** Public progress of an existing builder tool. */
export interface ToolCall {
  /** Stable tool call identifier, when included in the update. */
  id?: string;
  /** Tool name displayed by the builder. */
  name?: string;
  /** Current execution state. */
  status?: "running" | "success" | "error" | "stopped" | "waiting_for_user_input";
  /** Whether the tool needs a user response through the partner backend. */
  requires_user_input?: boolean;
  /** Whether the builder auto-approved the reviewed operation. */
  auto_approved?: boolean | null;
  /** Whether the reviewed mutation was applied. */
  mutation_applied?: boolean | null;
  /** Existing serialized interaction category; no raw interaction payload. */
  waiting_on?: {
    /** Kind of response expected. */
    kind?: "approval" | "choice" | "input" | null;
  } | null;
  /**
   * JSON containing one reviewed argument shape: ToolQuestionArguments,
   * ToolSecretArguments, ToolPackageArguments, ToolPlanArguments, or ToolMediaArguments.
   * It is omitted for all other tools and malformed/partial streaming arguments.
   */
  arguments_string?: string;
  /** Reviewed activity metadata for file, execution, or entity tools. */
  display_projection?: ToolDisplayProjection;
  /** Reviewed clarifying-question answers only. */
  user_input?: ToolQuestionInput;
  /** Fixed reviewed success outcome only. */
  results?: ToolOutcome;
}

/** Public message replacement. Omitted properties are not synthesized by the SDK. */
export interface ChatMessage {
  /** Existing message identifier; replace a message with the same identifier. */
  id?: string;
  /** Public message author category. System messages are never delivered. */
  role?: "user" | "assistant";
  /** Generated or user-authored text. Structural filtering is not prose redaction. */
  content?: string | null;
  /** Attached file URLs. */
  file_urls?: string[] | null;
  /** Public tool progress with optional reviewed interaction details. */
  tool_calls?: ToolCall[] | null;
  /** Message timestamp, without author identity. */
  metadata?: {
    /** Existing timestamp string. */
    created_date?: string | null;
  } | null;
  /** Existing checkpoint reference; mutations remain on the partner backend. */
  checkpoint_id?: string | null;
}

/** Partial app update. Omitted keys mean unchanged; explicit null means clear. */
export interface AppUpdate {
  /** Public builder state, without error diagnostics or billing context. */
  status?: {
    /** Current builder state. */
    state?: "ready" | "processing" | "error";
    /** Existing state timestamp. */
    last_updated_date?: string | null;
  } | null;
  /** Whole-message replacement by identifier, not a recursive message patch. */
  _last_msg?: ChatMessage | null;
  /** Conversation containing the replacement message. */
  _last_msg_conversation_id?: string | null;
  /** Existing branch scope, if supplied by the producer. */
  _scope_branch_id?: string | null;
  /** Whether to reload the app preview. */
  sandbox_should_reload?: boolean | null;
  /** Existing preview navigation target. */
  navigate_preview_to?: string | null;
  /** Existing forced preview navigation target. */
  navigate_preview_force_to?: string | null;
}

/** Public queued builder request. */
export interface QueueItem {
  /** Stable queue item identifier. */
  id: string;
  /** User-authored request text. */
  content: string;
  /** Attached file URLs. */
  file_urls?: string[] | null;
  /** Existing creation timestamp. */
  created_at: string;
  /** Existing branch scope. */
  branch_id?: string | null;
}

/** Full public queue snapshot, replacing the previous queue. */
export interface QueueUpdate {
  /** App owning this queue. */
  app_id: string;
  /** Existing branch scope. */
  branch_id?: string | null;
  /** Current pending items. */
  items: QueueItem[];
  /** Whether queue processing is paused. */
  is_paused: boolean;
  /** Identifier of the item just processed, when supplied. */
  processed_item_id?: string | null;
}

/** Public tool task progress. */
export interface TaskUpdate {
  /** Existing task lifecycle event. */
  event_type: "task_started" | "task_progress" | "task_completed" | "task_failed" | "task_cancelled";
  /** Associated tool call. */
  tool_call_id?: string | null;
  /** Associated chat message. */
  message_id?: string | null;
  /** Existing branch scope. */
  branch_id?: string | null;
  /** Numeric progress only; diagnostic/free-text messages are withheld. */
  progress?: {
    /** Completed work units. */
    current?: number | null;
    /** Total work units, when known. */
    total?: number | null;
    /** Producer-supplied percentage. */
    percentage?: number | null;
  } | null;
}

/** Placeholder resolution or image-generation completion. */
export interface ImageReady {
  /** Placeholder being resolved. */
  placeholder_url: string;
  /** Existing generation state. */
  status: "pending" | "completed" | "failed";
  /** Resolved image URL, or null when unavailable. */
  image_url?: string | null;
}

/** Invalidation notice; fetch current state through the partner backend. */
export interface Directive {
  /** Canonical app room. */
  room: string;
  /** Public invalidation category. */
  type: "conversation_changed" | "app_files_changed";
  /** Existing branch scope. */
  branch_id?: string | null;
}

/** Mapping of wire event names to decoded public payloads. */
export interface PlatformEventMap {
  /** Partial builder/app update. */
  update_model: AppUpdate;
  /** Conversation or file invalidation. */
  directive: Directive;
  /** Full queue snapshot. */
  queue_update: QueueUpdate;
  /** Numeric tool progress. */
  task_update: TaskUpdate;
  /** Image placeholder resolution. */
  image_ready: ImageReady;
}

/** Ordered delivery with decoded data and the original event name and cursor. */
export type PlatformEvent = {
  [K in keyof PlatformEventMap]: {
    /** Original socket event name; narrows the payload type. */
    type: K;
    /** Authorized app receiving this event. */
    appId: string;
    /** Opaque replay cursor. Never parse, compare or increment it. */
    seq: string;
    /** Decoded payload; existing field names and omission/null semantics are retained. */
    data: PlatformEventMap[K];
  }
}[keyof PlatformEventMap];

/** Server replay boundary, delivered after all retained events through that boundary. */
export interface Joined {
  /** Canonical app room. */
  room: string;
  /** Opaque boundary cursor; not an initial app snapshot. */
  seq: string;
  /** Server retention limit (currently 2,000 events per app). */
  max_entries: number;
  /** Server inactivity expiry (currently 3,600 seconds). */
  inactivity_expiry_seconds: number;
}
