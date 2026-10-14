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
}

/**
 * A remote browser session returned by {@linkcode BrowserModule.getSession | getSession()}.
 */
export interface BrowserSession {
  /** Opaque session identifier issued by the remote browser provider. */
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
}

/**
 * Browser module for running browser automation from your backend.
 *
 * This module creates remote browser sessions that you can control with a CDP client library such as Playwright or Puppeteer. Base44 doesn't store browser state, so each session is independent.
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
   *   const { connectionUrl } = await base44.asServiceRole.browser.getSession();
   *
   *   const browser = await chromium.connectOverCDP(connectionUrl);
   *   const page = browser.contexts()[0].pages()[0] ?? (await browser.newPage());
   *   await page.goto('https://example.com');
   *   const title = await page.title();
   *   await browser.close();
   *
   *   return Response.json({ title });
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
   */
  getSession(options?: BrowserSessionOptions): Promise<BrowserSession>;
}
