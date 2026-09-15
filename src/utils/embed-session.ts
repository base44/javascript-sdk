/**
 * Sessions for apps embedded in a host platform.
 *
 * The platform's server mints a one-time token for one of its users and puts
 * it on the iframe URL as `?ott=`. The client takes it off the URL as it is
 * created, trades it for an app-user session through the OAuth token-exchange
 * grant (RFC 8693), and keeps the result in memory only — never in storage — so
 * the session lives and dies with the frame.
 *
 * Taking the token off the URL is unconditional — a one-time token must not be
 * left in the address bar, in history, or in a shared link — but it is only
 * reported back inside a frame, the only place one is redeemed. It is gone once
 * the first client has taken it, so the session belongs to that client — an app
 * creates one.
 *
 * The exchange endpoint is rate limited per app, and its limiter refuses before
 * the one-time token is redeemed — so a 429 leaves the token still valid and is
 * worth retrying once.
 *
 * @internal
 */

export const EMBED_TOKEN_PARAM = "ott";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
const SUBJECT_TOKEN_TYPE = "urn:base44:params:oauth:token-type:embed-ott";
const RATE_LIMITED = 429;
const RATE_LIMIT_RETRY_MS = 1000;
const EXCHANGE_TIMEOUT_MS = 15_000;
const SESSION_ENDED_ELEMENT_ID = "base44-embed-session-ended";

/** @internal */
export function takeEmbedTokenFromUrl(): string | null {
  if (typeof window === "undefined" || !window.location) {
    return null;
  }
  let ott: string | null = null;
  try {
    const url = new URL(window.location.href);
    ott = url.searchParams.get(EMBED_TOKEN_PARAM);
    if (!ott) {
      return null;
    }
    url.searchParams.delete(EMBED_TOKEN_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch (e) {
    console.error("Error retrieving embed token from URL:", e);
  }
  return isFramed() ? ott : null;
}

/** @internal */
export function isFramed(): boolean {
  return typeof window !== "undefined" && window.self !== window.top;
}

/** @internal */
export async function exchangeEmbedToken({
  serverUrl,
  appId,
  ott,
  fetchImpl = fetch,
}: {
  serverUrl: string;
  appId: string;
  ott: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const post = () =>
    fetchImpl(`${serverUrl}/api/apps/${appId}/auth/embed/token`, {
      method: "POST",
      headers: { "X-App-Id": String(appId) },
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      body: new URLSearchParams({
        grant_type: GRANT_TYPE,
        subject_token: ott,
        subject_token_type: SUBJECT_TOKEN_TYPE,
      }),
    });

  try {
    let response = await post();
    if (response.status === RATE_LIMITED) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
      response = await post();
    }
    if (!response.ok) {
      return null;
    }
    const { access_token: token } = (await response.json()) as {
      access_token?: string;
    };
    return token || null;
  } catch (e) {
    console.error("Embed token exchange failed:", e);
    return null;
  }
}

/** @internal */
export function showEmbedSessionEnded(): void {
  if (typeof document === "undefined" || !document.body) {
    return;
  }
  if (document.getElementById(SESSION_ENDED_ELEMENT_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.textContent =
    `#${SESSION_ENDED_ELEMENT_ID}{--b44-bg:#fff;--b44-fg:#0f172a;--b44-muted:#475569;}` +
    `@media (prefers-color-scheme:dark){#${SESSION_ENDED_ELEMENT_ID}` +
    `{--b44-bg:#0f172a;--b44-fg:#f8fafc;--b44-muted:#94a3b8;}}`;

  const overlay = document.createElement("div");
  overlay.id = SESSION_ENDED_ELEMENT_ID;
  overlay.setAttribute("role", "alert");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;" +
    "justify-content:center;background:var(--b44-bg);color:var(--b44-fg);" +
    "font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;padding:2rem;";

  const title = document.createElement("h1");
  title.textContent = "Session ended";
  title.style.cssText = "font-size:1.5rem;font-weight:700;margin:0 0 .75rem;";

  const body = document.createElement("p");
  body.textContent = "Reload this page in your browser to start a new session.";
  body.style.cssText = "margin:0;color:var(--b44-muted);";

  const card = document.createElement("div");
  card.append(title, body);
  overlay.append(style, card);
  document.body.append(overlay);
}
