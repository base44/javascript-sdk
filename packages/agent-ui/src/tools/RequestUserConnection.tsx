import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ToolCallProps } from "../types.js";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // 2 minutes

/** Parsed connector info from the tool result. */
export interface ConnectorInfo {
  action: string;
  integration_type: string;
  display_name: string;
  connect_url: string;
  connector_id: string;
  app_id: string;
}

/** State exposed by the headless RequestUserConnection component. */
export interface RequestUserConnectionState {
  /** Connector info parsed from the tool result, or null if parsing failed. */
  connectorInfo: ConnectorInfo | null;
  /** Integration type from args (fallback if result not available). */
  integrationType: string | undefined;
  /** Human-readable service name. */
  displayName: string;
  /** Current connection state. */
  status: "idle" | "connecting" | "success" | "error" | "unavailable";
  /** Error message when status is "error". */
  errorMessage: string;
  /** The tool call's execution status. */
  toolStatus: string;
  /** Whether the tool call itself failed (no connector info). */
  toolFailed: boolean;
  /** Raw error/message from tool failure. */
  toolErrorMessage: string;
  /** Initiate the OAuth connection flow (opens popup). */
  connect: () => void;
}

export interface RequestUserConnectionProps extends ToolCallProps {
  /** Render prop — receives the headless state, returns your UI. */
  children?: (state: RequestUserConnectionState) => React.ReactNode;
}

function parseConnectorInfo(results: string | Record<string, unknown> | undefined): ConnectorInfo | null {
  if (!results) return null;
  try {
    let parsed = results;
    // Unwrap string layers (may be double-encoded)
    while (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed === "object" && parsed !== null && (parsed as Record<string, unknown>).action === "connect_user_account") {
      return parsed as unknown as ConnectorInfo;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/**
 * Headless component for the `request_user_connection` tool call.
 *
 * Manages OAuth popup lifecycle: opens a popup with the `connect_url`,
 * polls for completion, and exposes state transitions via a render prop.
 *
 * @example
 * ```tsx
 * <RequestUserConnection toolCall={tc} appId={appId}>
 *   {({ displayName, status, connect, errorMessage }) => (
 *     <div>
 *       {status === 'idle' && (
 *         <button onClick={connect}>Connect {displayName}</button>
 *       )}
 *       {status === 'connecting' && <span>Waiting for authorization...</span>}
 *       {status === 'success' && <span>Connected!</span>}
 *       {status === 'error' && (
 *         <>
 *           <span>{errorMessage}</span>
 *           <button onClick={connect}>Retry</button>
 *         </>
 *       )}
 *     </div>
 *   )}
 * </RequestUserConnection>
 * ```
 */
export function RequestUserConnection({ toolCall, appId, children }: RequestUserConnectionProps) {
  const [status, setStatus] = useState<RequestUserConnectionState["status"]>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const cleanupRef = useRef<(() => void) | null>(null);

  const connectorInfo = useMemo(() => parseConnectorInfo(toolCall.results), [toolCall.results]);

  const parsedArgs = useMemo(() => {
    try {
      return toolCall.arguments_string ? JSON.parse(toolCall.arguments_string) : null;
    } catch {
      return null;
    }
  }, [toolCall.arguments_string]);

  const integrationType = connectorInfo?.integration_type ?? parsedArgs?.integration_type;
  const displayName = connectorInfo?.display_name ?? integrationType ?? "service";

  // Tool-level failure detection
  const toolFailed = !connectorInfo && (toolCall.status === "error" || toolCall.status === "success");
  const toolErrorMessage = toolFailed
    ? (typeof toolCall.results === "string" ? toolCall.results : "Connection setup failed.")
    : "";

  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  const connect = useCallback(() => {
    if (!connectorInfo?.connect_url) return;

    setStatus("connecting");
    setErrorMessage("");

    const { connect_url, app_id } = connectorInfo;

    // Open OAuth popup
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      connect_url,
      "oauth_popup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      setStatus("error");
      setErrorMessage("Popup was blocked. Please allow popups and try again.");
      return;
    }

    let attempts = 0;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/apps/${app_id}/external-auth/status?integration_type=${encodeURIComponent(integrationType!)}&connection_id=`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.status === "ACTIVE") return "success" as const;
          if (data?.status === "FAILED") return "failed" as const;
        }
      } catch {
        // Polling error — keep trying
      }
      return "pending" as const;
    };

    const pollTimer = setInterval(async () => {
      attempts++;

      if (popup.closed) {
        clearInterval(pollTimer);
        // Give the callback a moment to process
        setTimeout(async () => {
          const result = await checkStatus();
          if (result === "success") {
            setStatus("success");
          } else {
            setStatus("error");
            setErrorMessage("Connection was not completed. Please try again.");
          }
        }, 1500);
        return;
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(pollTimer);
        popup.close();
        setStatus("error");
        setErrorMessage("Connection timed out. Please try again.");
        return;
      }

      const result = await checkStatus();
      if (result === "success") {
        clearInterval(pollTimer);
        popup.close();
        setStatus("success");
      } else if (result === "failed") {
        clearInterval(pollTimer);
        popup.close();
        setStatus("error");
        setErrorMessage("Connection failed. Please try again.");
      }
    }, POLL_INTERVAL_MS);

    cleanupRef.current = () => {
      clearInterval(pollTimer);
      if (popup && !popup.closed) popup.close();
    };
  }, [connectorInfo, integrationType]);

  const state: RequestUserConnectionState = {
    connectorInfo,
    integrationType,
    displayName,
    status: toolFailed ? "unavailable" : status,
    errorMessage,
    toolStatus: toolCall.status,
    toolFailed,
    toolErrorMessage,
    connect,
  };

  if (!children) return null;
  return <>{children(state)}</>;
}
