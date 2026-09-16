/** Public progress of an existing builder tool; arguments and results are withheld. */
export interface ToolCall {
  /** Stable tool call identifier, when included in the update. */
  id?: string;
  /** Tool name displayed by the builder. */
  name?: string;
  /** Current execution state. */
  status?: "running" | "success" | "error" | "stopped" | "waiting_for_user_input";
  /** Whether the tool needs a user response through the partner backend. */
  requires_user_input?: boolean;
  /** Existing serialized interaction category; no raw interaction payload. */
  waiting_on?: {
    /** Kind of response expected. */
    kind?: "approval" | "choice" | "input" | null;
  };
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
  /** Public tool progress, without arguments or results. */
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
