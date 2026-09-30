/**
 * One tool shown on the MCP consent page.
 */
export interface McpConsentTool {
  /** The tool's MCP name. */
  name: string;
  /** Human-readable title, when the tool has one. */
  title?: string | null;
  /** What the tool does. */
  description?: string | null;
  /** Whether the tool only reads data. */
  read_only_hint?: boolean | null;
}

/**
 * Display details for a pending MCP authorization request, as returned by
 * {@link McpModule.getConsentInfo}.
 */
export interface McpConsentInfo {
  /** The app's display name. */
  app_name: string;
  /** The name of the AI client asking for access. */
  client_name: string;
  /**
   * Whether the request came from a signed-in user of this app. When `false`,
   * send the user to `login_path` before showing approve and deny.
   */
  authenticated: boolean;
  /** The tools the client will be able to use. Empty unless `authenticated` is `true`. */
  tools: McpConsentTool[];
  /** The app's login route for a signed-out user, such as `/login`. */
  login_path: string;
}

/**
 * The user's decision on an MCP authorization request.
 */
export type McpConsentAction = "approve" | "deny";

/**
 * Result of {@link McpModule.authorizeGrant}.
 */
export interface McpAuthorizeGrantResponse {
  /**
   * Where to send the browser next: the AI client's redirect URI, carrying the
   * authorization code on approve or an `access_denied` error on deny. It may
   * use a custom scheme such as `cursor://`.
   */
  redirect_url: string;
}

/**
 * MCP module for the app's MCP consent page.
 *
 * When an AI client connects to the app's MCP server, Base44 sends the user to
 * the app's consent page with an opaque `ctx` query parameter. The page reads
 * the request's details with {@link McpModule.getConsentInfo | getConsentInfo()}
 * and records the user's decision with {@link McpModule.authorizeGrant | authorizeGrant()}.
 *
 * ## Authentication Modes
 *
 * This module is available to use with a client in user authentication mode. The
 * signed-in user's token is sent when the client has one; otherwise the app's
 * session cookie identifies the user.
 */
export interface McpModule {
  /**
   * Gets the display details for a pending MCP authorization request.
   *
   * Rejects with a {@linkcode Base44Error} with `status` `404` when the `ctx`
   * handle is unknown or expired.
   *
   * @param ctx - The `ctx` query parameter the consent page was opened with.
   * @returns Promise resolving to the request's display details.
   *
   * @example
   * ```typescript
   * const ctx = new URLSearchParams(window.location.search).get('ctx');
   * const info = await base44.mcp.getConsentInfo(ctx);
   * if (!info.authenticated) {
   *   window.location.href = info.login_path;
   * }
   * ```
   */
  getConsentInfo(ctx: string): Promise<McpConsentInfo>;

  /**
   * Records the signed-in user's decision on an MCP authorization request.
   *
   * The `ctx` handle is single-use. Rejects with a {@linkcode Base44Error}:
   * `status` `401` when the user must sign in again (the handle is still valid),
   * and `400`, `403`, `404` or `409` when the request can no longer be
   * completed and the user must reconnect from the AI client.
   *
   * @param ctx - The `ctx` query parameter the consent page was opened with.
   * @param action - `"approve"` to grant access, `"deny"` to refuse it.
   * @returns Promise resolving to the URL to send the browser to.
   *
   * @example
   * ```typescript
   * const { redirect_url } = await base44.mcp.authorizeGrant(ctx, 'approve');
   * window.location.href = redirect_url;
   * ```
   */
  authorizeGrant(
    ctx: string,
    action: McpConsentAction
  ): Promise<McpAuthorizeGrantResponse>;
}
