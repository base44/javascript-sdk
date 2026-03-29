import React, { useState, useCallback, useMemo } from "react";
import { ToolCallProps } from "./types.js";

/** Parsed and normalized state exposed by the headless DefaultToolCall. */
export interface DefaultToolCallState {
  /** Tool name. */
  name: string;
  /** Human-readable tool name (snake_case → Title Case). */
  displayName: string;
  /** Normalized status. */
  status: "pending" | "running" | "success" | "error";
  /** Whether the tool is still executing. */
  isLoading: boolean;
  /** Whether the result indicates an error. */
  isError: boolean;
  /** Whether the details section is expanded. */
  expanded: boolean;
  /** Toggle the expanded state. */
  toggleExpanded: () => void;
  /** Parsed arguments object, or null. */
  parsedArgs: Record<string, unknown> | null;
  /** Parsed result (object or string), or null. */
  parsedResults: unknown;
  /** Raw arguments string. */
  rawArgs: string | undefined;
  /** Raw results string or object. */
  rawResults: string | Record<string, unknown> | undefined;
}

export interface DefaultToolCallProps extends ToolCallProps {
  /** Render prop — receives the headless state, returns your UI. */
  children?: (state: DefaultToolCallState) => React.ReactNode;
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseJson(value: string | Record<string, unknown> | undefined): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeStatus(
  status: string,
  results: unknown
): "pending" | "running" | "success" | "error" {
  if (status === "running" || status === "in_progress") return "running";
  if (status === "error" || status === "failed") return "error";
  if (status === "success" || status === "completed") {
    // Check if the result itself indicates failure
    if (typeof results === "string" && /error|failed/i.test(results)) return "error";
    if (
      typeof results === "object" &&
      results !== null &&
      (results as Record<string, unknown>).success === false
    )
      return "error";
    return "success";
  }
  return "pending";
}

/**
 * Headless component for rendering a generic tool call with expand/collapse.
 *
 * Exposes parsed state via a render prop. If no `children` render prop is
 * provided, renders nothing (truly headless).
 *
 * @example
 * ```tsx
 * <DefaultToolCall toolCall={tc} appId={appId}>
 *   {({ displayName, status, expanded, toggleExpanded, parsedArgs, parsedResults }) => (
 *     <div>
 *       <button onClick={toggleExpanded}>
 *         {status === 'running' ? '⏳' : status === 'success' ? '✅' : '❌'}
 *         {displayName}
 *       </button>
 *       {expanded && (
 *         <pre>{JSON.stringify(parsedResults, null, 2)}</pre>
 *       )}
 *     </div>
 *   )}
 * </DefaultToolCall>
 * ```
 */
export function DefaultToolCall({ toolCall, children }: DefaultToolCallProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => setExpanded((e) => !e), []);

  const parsedArgs = useMemo(
    () => parseJson(toolCall.arguments_string) as Record<string, unknown> | null,
    [toolCall.arguments_string]
  );

  const parsedResults = useMemo(
    () => parseJson(toolCall.results),
    [toolCall.results]
  );

  const status = useMemo(
    () => normalizeStatus(toolCall.status, parsedResults),
    [toolCall.status, parsedResults]
  );

  const state: DefaultToolCallState = {
    name: toolCall.name,
    displayName: formatToolName(toolCall.name),
    status,
    isLoading: status === "running",
    isError: status === "error",
    expanded,
    toggleExpanded,
    parsedArgs,
    parsedResults,
    rawArgs: toolCall.arguments_string,
    rawResults: toolCall.results,
  };

  if (!children) return null;
  return <>{children(state)}</>;
}
