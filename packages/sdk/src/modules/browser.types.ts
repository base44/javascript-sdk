/**
 * Options for {@linkcode BrowserModule.getSession | getSession()}.
 */
export interface BrowserSessionOptions {
  /**
   * Whether to capture browser recordings and diagnostic logs for the session.
   *
   * Captured artifacts stay with the remote browser provider and can't be retrieved through the SDK. Defaults to `true`.
   */
  captureDebugArtifacts?: boolean;
  /**
   * Session timeout in seconds.
   *
   * Base44 sets minimum and maximum allowed values and clamps the timeout to that range. When omitted, Base44 applies a default timeout. Depending on the remote browser provider, the timeout applies either to the session's total lifetime or to how long an idle session stays alive.
   */
  sessionTimeoutSeconds?: number;
}

/**
 * A remote browser session returned by {@linkcode BrowserModule.getSession | getSession()}.
 */
export interface BrowserSession {
  /**
   * Opaque session identifier issued to your app.
   *
   * Pass it unchanged to {@linkcode BrowserModule.endSession | endSession()} to end the session from a different request.
   */
  sessionId: string;
  /**
   * Signed WebSocket URL for connecting to the browser over the Chrome DevTools Protocol (CDP).
   *
   * Treat the complete URL as a credential. Don't log it or send it to the frontend.
   */
  connectionUrl: string;
  /**
   * Scope of the CDP connection.
   *
   * - `'browser'`: The socket controls the whole browser.
   * - `'page'`: The socket controls a single page.
   */
  connectionScope: "browser" | "page";
  /** ISO 8601 timestamp when the connection URL expires. Omitted when the provider doesn't expose it. */
  connectionExpiresAt?: string;
  /** ISO 8601 timestamp when the browser session expires. Omitted when the provider doesn't expose it. */
  sessionExpiresAt?: string;
  /**
   * Ends the session. Equivalent to calling {@linkcode BrowserModule.endSession | endSession()} with this session's ID.
   */
  end: () => Promise<void>;
}

/**
 * Browser module for running browser automation from your backend.
 *
 * This module creates remote browser sessions that you can control with a CDP client library such as Playwright or Puppeteer. Base44 doesn't store browser state, so each session is independent. End each session when you're done with it. Otherwise it keeps running until the remote browser provider times it out.
 *
 * This module is only available to use with a client in service role authentication mode, which means it can only be used in backend environments.
 */
export interface BrowserModule {
  /**
   * Creates a new remote browser session and returns its connection details.
   *
   * Each call creates a fresh session. Calls aren't retried automatically, and repeating a failed call doesn't resume a previous session. Session creation is rate limited per app.
   *
   * @param options - Optional session settings.
   * @returns Promise resolving to the new browser session.
   *
   * @example
   * ```typescript
   * // Open a page in a remote browser with Playwright
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   * import { chromium } from 'npm:playwright-core';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const session = await base44.asServiceRole.browser.getSession();
   *
   *   try {
   *     const browser = await chromium.connectOverCDP(session.connectionUrl);
   *     const page = browser.contexts()[0].pages()[0] ?? (await browser.newPage());
   *     await page.goto('https://example.com');
   *     const title = await page.title();
   *     await browser.close();
   *
   *     return Response.json({ title });
   *   } finally {
   *     await session.end();
   *   }
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Turn off recordings and diagnostic logs
   * const session = await base44.asServiceRole.browser.getSession({
   *   captureDebugArtifacts: false,
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Request a custom session timeout
   * const session = await base44.asServiceRole.browser.getSession({
   *   sessionTimeoutSeconds: 600,
   * });
   * ```
   */
  getSession(options?: BrowserSessionOptions): Promise<BrowserSession>;

  /**
   * Ends a browser session created by your app.
   *
   * Use this when the session was created in a different request. Otherwise call `end()` on the session returned by {@linkcode getSession | getSession()}. Ending a session that has already ended succeeds, so it's safe to call more than once. The call fails with the `browser_session_not_found` error code if the ID wasn't issued to your app.
   *
   * @param sessionId - The `sessionId` returned by {@linkcode getSession | getSession()}, unchanged.
   * @returns Promise that resolves when the session has ended.
   *
   * @example
   * ```typescript
   * // End a session whose ID was saved by an earlier request
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const { sessionId } = await req.json();
   *   await base44.asServiceRole.browser.endSession(sessionId);
   *
   *   return new Response(null, { status: 204 });
   * });
   * ```
   */
  endSession(sessionId: string): Promise<void>;
}
