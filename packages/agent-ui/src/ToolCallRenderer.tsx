import React from "react";
import { ToolCall, ToolCallProps } from "./types.js";
import { DefaultToolCall } from "./DefaultToolCall.js";
import { RequestUserConnection } from "./tools/RequestUserConnection.js";

/**
 * Built-in registry of platform tool names to headless renderer components.
 *
 * When adding a new platform tool that needs custom UI, register it here.
 */
const BUILT_IN_RENDERERS: Record<
  string,
  React.ComponentType<ToolCallProps>
> = {
  request_user_connection: RequestUserConnection,
};

export interface ToolCallRendererProps {
  /** The tool call data from the agent message. */
  toolCall: ToolCall;
  /** The current app ID. */
  appId: string;
  /**
   * App-specific custom renderers that take priority over built-in ones.
   * Map of tool name → React component.
   */
  customRenderers?: Record<string, React.ComponentType<ToolCallProps>>;
  /**
   * Override the default fallback component for unrecognized tool calls.
   * Defaults to `DefaultToolCall`.
   */
  fallback?: React.ComponentType<ToolCallProps>;
  /**
   * Render prop for providing custom UI around the headless component's state.
   * If not provided, the matched component renders directly.
   */
  children?: (
    Component: React.ComponentType<ToolCallProps>,
    props: ToolCallProps
  ) => React.ReactNode;
}

/**
 * Routes a tool call to the appropriate renderer component.
 *
 * Resolution order:
 * 1. `customRenderers[toolCall.name]` (app-specific)
 * 2. Built-in platform renderers (e.g., `request_user_connection`)
 * 3. `fallback` prop or `DefaultToolCall`
 *
 * @example
 * ```tsx
 * import { ToolCallRenderer } from '@base44/agent-ui';
 *
 * {message.tool_calls?.map((tc) => (
 *   <ToolCallRenderer key={tc.id} toolCall={tc} appId={appId} />
 * ))}
 * ```
 */
export function ToolCallRenderer({
  toolCall,
  appId,
  customRenderers,
  fallback,
  children,
}: ToolCallRendererProps) {
  const Component =
    customRenderers?.[toolCall.name] ??
    BUILT_IN_RENDERERS[toolCall.name] ??
    fallback ??
    DefaultToolCall;

  const props: ToolCallProps = { toolCall, appId };

  if (children) {
    return <>{children(Component, props)}</>;
  }

  return <Component {...props} />;
}
