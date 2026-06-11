/**
 * Cloudflare Turnstile helper (BUG-438).
 *
 * Obtains a one-shot Turnstile response token in the browser so the backend can
 * gate anonymous integration-session minting behind a human/browser challenge.
 * Best-effort: returns `null` outside a browser, if the script can't load, or on
 * any challenge failure/timeout — the caller then proceeds without a token (the
 * backend runs observe-only until per-app enforcement, so this never hard-breaks
 * legitimate traffic during rollout).
 */

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const DEFAULT_TIMEOUT_MS = 15000;

interface TurnstileApi {
  render(container: HTMLElement, opts: Record<string, unknown>): string;
  remove(widgetId: string): void;
  execute?(widgetId: string): void;
}

function getTurnstile(): TurnstileApi | undefined {
  return (globalThis as any).turnstile as TurnstileApi | undefined;
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (getTurnstile()) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // allow a later retry
      reject(new Error("Failed to load Cloudflare Turnstile script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Render an invisible Turnstile widget and resolve with its response token, or
 * `null` if a token can't be obtained.
 */
export async function getTurnstileToken(
  siteKey: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  try {
    await loadScript();
    const turnstile = getTurnstile();
    if (!turnstile) {
      return null;
    }

    const container = document.createElement("div");
    container.style.display = "none";
    document.body.appendChild(container);

    return await new Promise<string | null>((resolve) => {
      let settled = false;
      let widgetId: string | undefined;
      let removed = false;

      // Remove the widget once we know its id. The success callback can fire
      // synchronously *inside* render() (before widgetId is assigned), so this
      // is also called right after render() to clean up that case.
      const removeWidget = () => {
        if (removed || !widgetId) return;
        removed = true;
        try {
          turnstile.remove(widgetId);
        } catch {
          /* ignore cleanup errors */
        }
      };

      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        removeWidget();
        try {
          container.remove();
        } catch {
          /* ignore cleanup errors */
        }
        resolve(value);
      };

      const timer = setTimeout(() => finish(null), timeoutMs);

      try {
        widgetId = turnstile.render(container, {
          sitekey: siteKey,
          size: "invisible",
          callback: (token: string) => finish(token),
          "error-callback": () => finish(null),
          "timeout-callback": () => finish(null),
        });
        if (settled) {
          // Callback already fired synchronously; widgetId is set now.
          removeWidget();
        } else {
          // Invisible widgets auto-run on render; execute() is a no-op fallback
          // for builds that require an explicit trigger.
          try {
            turnstile.execute?.(widgetId);
          } catch {
            /* some versions auto-execute; ignore */
          }
        }
      } catch {
        finish(null);
      }
    });
  } catch {
    return null;
  }
}
