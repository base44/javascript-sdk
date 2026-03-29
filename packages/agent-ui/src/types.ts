/**
 * A tool call from an agent message.
 *
 * Matches the shape of `AgentMessageToolCall` from `@base44/sdk`.
 */
export interface ToolCall {
  /** Tool call ID. */
  id: string;
  /** Name of the tool called. */
  name: string;
  /** Arguments passed to the tool as JSON string. */
  arguments_string?: string;
  /** Status of the tool call. */
  status: "running" | "success" | "error" | "stopped" | string;
  /** Results from the tool call (JSON string or object). */
  results?: string | Record<string, unknown>;
}

/**
 * Props passed to every tool-call renderer component.
 *
 * Headless components receive these props and expose state/callbacks
 * via render props or children. They render no DOM of their own.
 */
export interface ToolCallProps {
  /** The tool call data from the agent message. */
  toolCall: ToolCall;
  /** The current app ID (needed for API calls like OAuth initiation). */
  appId: string;
}
