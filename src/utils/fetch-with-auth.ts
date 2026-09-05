import type { AxiosInstance } from "axios";

/**
 * Builds the client's `fetchWithAuth`: a `fetch` that attaches the signed-in
 * user's access token, restricted to the app's own origin.
 *
 * @param axios - The user-scoped axios instance. Its `Authorization` default is
 * the live token: it follows `setToken()` and is deleted on `logout()`, so a
 * request never carries a token the user no longer has.
 * @internal
 */
export function createFetchWithAuth(axios: AxiosInstance) {
  const currentToken = (): string | null => {
    const header = axios.defaults.headers.common["Authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      return null;
    }
    return header.slice("Bearer ".length) || null;
  };

  return async function fetchWithAuth(
    path: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const url = resolveSameOriginUrl(path);
    const headers = new Headers(init.headers);
    const token = currentToken();

    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(url, { ...init, headers });
  };
}

function resolveSameOriginUrl(path: string): string {
  if (typeof path !== "string" || path === "") {
    throw new Error("fetchWithAuth() requires a path, such as '/api/orders'.");
  }

  const location = typeof window !== "undefined" ? window.location : undefined;
  if (!location?.href) {
    throw new Error(
      "fetchWithAuth() is only available in the browser. In server code, read the caller's token from the request instead — see createClientFromRequest()."
    );
  }

  let pageUrl: URL;
  let resolved: URL;
  try {
    pageUrl = new URL(location.href);
    resolved = new URL(path, pageUrl);
  } catch {
    throw new Error(`fetchWithAuth() received an invalid path: "${path}".`);
  }

  // Resolving before comparing is what makes this safe: a protocol-relative
  // path ("//evil.example"), a backslash ("/\\evil.example") and an absolute URL
  // all land on another origin here, and are rejected the same way.
  if (resolved.origin !== pageUrl.origin) {
    throw new Error(
      `fetchWithAuth() only sends requests to your app's own origin, so the access token never reaches a third party. "${path}" resolves to ${resolved.origin}. Use base44.functions.fetch() to call a Base44 backend function, or plain fetch() for another origin.`
    );
  }

  return resolved.toString();
}
