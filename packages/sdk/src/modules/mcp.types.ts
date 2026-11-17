/**
 * A tool an AI client is asking to use, as shown on the consent page.
 */
export interface McpConsentTool {
  /** The tool's name. */
  name: string;
  /** The tool's display title. */
  title?: string | null;
  /** What the tool does. */
  description?: string | null;
  /** Whether the tool only reads data. */
  read_only_hint?: boolean;
  /** What the tool exposes: an entity operation, an agent, or a backend function. */
  kind?: "entity" | "agent" | "function" | string;
  /** The entity an `entity` tool operates on. */
  entity?: string | null;
  /** The operation an `entity` tool performs. */
  operation?: "read" | "create" | "update" | "delete" | string | null;
  /** The agent an `agent` tool talks to. */
  agent?: string | null;
}

/**
 * Display details of a pending authorization request for the app's MCP server.
 */
export interface McpConsentInfo {
  /** The app's name. */
  app_name: string;
  /** The name of the AI client requesting access. */
  client_name: string;
  /**
   * Whether the request came from a signed-in user of this app.
   *
   * Use this to decide whether to send the user to login, not `auth.isAuthenticated()`: a session held only in a cookie counts here.
   */
  authenticated: boolean;
  /** The tools the AI client would get access to. Empty when `authenticated` is `false`. */
  tools: McpConsentTool[];
  /** The app's login route, to send a signed-out user to. */
  login_path: string;
}

/**
 * The user's decision on an authorization request.
 */
export type McpConsentAction = "approve" | "deny";

/**
 * The result of responding to an authorization request.
 */
export interface McpConsentResponse {
  /** The URL to send the browser to, which returns the user to the AI client. */
  redirect_url: string;
}

/**
 * MCP module for the consent step of connecting an AI client to the app's MCP server.
 *
 * When an AI client connects to the app's MCP server, the platform sends the user to the app's consent page with an opaque `ctx` handle in the URL. Use this module on that page to:
 * - Read what the AI client is asking for.
 * - Send the user's decision to approve or deny it.
 *
 * Both methods send the user's session cookie along with the client's token, so they work for a user who is signed in with either. Call them from the app's own domain.
 *
 * ## Authentication modes
 *
 * This module is only available in user authentication mode (`base44.mcp`).
 */
export interface McpModule {
  /**
   * Retrieves the display details of a pending authorization request.
   *
   * Rejects with a {@linkcode Base44Error} that has a `status` of `404` when the handle is unknown or has expired.
   *
   * @param ctx - The `ctx` handle from the consent page URL.
   * @returns Promise resolving to the request's display details.
   *
   * @example
   * ```typescript
   * // Load the request, sending a signed-out user to login first
   * const ctx = new URLSearchParams(window.location.search).get('ctx');
   * const info = await base44.mcp.getConsentInfo(ctx);
   * if (!info.authenticated) {
   *   const returnTo = encodeURIComponent(`${window.location.pathname}?ctx=${encodeURIComponent(ctx)}`);
   *   window.location.href = `${info.login_path}?returnTo=${returnTo}&from_url=${returnTo}`;
   * }
   * ```
   */
  getConsentInfo(ctx: string): Promise<McpConsentInfo>;

  /**
   * Sends the user's decision on an authorization request.
   *
   * A handle can be used once. Rejects with a {@linkcode Base44Error} whose `status` tells you what to do next:
   * - `401`: The user isn't signed in to this app. The handle is still valid, so send them to login and back.
   * - `400`, `403`, `404`, `409`: The request can't be completed and the handle is spent. Ask the user to reconnect from their AI client.
   *
   * @param ctx - The `ctx` handle from the consent page URL.
   * @param action - Whether the user approves or denies the request.
   * @returns Promise resolving to the URL that returns the user to the AI client.
   *
   * @example
   * ```typescript
   * // Approve the request and return to the AI client
   * const { redirect_url } = await base44.mcp.respondToConsent(ctx, 'approve');
   * window.location.href = redirect_url;
   * ```
   */
  respondToConsent(
    ctx: string,
    action: McpConsentAction
  ): Promise<McpConsentResponse>;
}
