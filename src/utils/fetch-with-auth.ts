import type { AxiosInstance } from "axios";

/**
 * Builds the client's `fetchWithAuth`: a `fetch` that attaches the signed-in
 * user's access token to a request for the app's own origin.
 *
 * @param axios - The user-scoped axios instance. Its `Authorization` default is
 * the live token: it follows `setToken()` and is deleted on `logout()`, so a
 * request never carries a token the user no longer has. In a server-side client
 * from `createClientFromRequest()` it holds the caller's own token.
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
    assertOwnOriginPath(path);

    const headers = new Headers(init.headers);
    const token = currentToken();

    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    // Passed through untouched: resolving it here would need a document, and a
    // root-relative path is already what a runtime that dispatches in-process
    // (Nitro's `fetch`) expects.
    return fetch(path, { ...init, headers });
  };
}

function assertOwnOriginPath(path: string): void {
  if (typeof path !== "string" || path === "") {
    throw new Error("fetchWithAuth() requires a path, such as '/api/orders'.");
  }

  // Check what a URL parser would see, not the raw string: it drops every ASCII
  // tab/newline anywhere in the input and trims leading C0/space, so
  // "/<tab>/evil.example" would pass a naive prefix check and then resolve to
  // another host.
  const asParsed = path.replace(/[\t\n\r]/g, "").replace(/^[\x00-\x20]+/, "");

  // One leading slash is the whole rule: it cannot carry a scheme, and it rules
  // out the two forms that reach another origin — "//host" and, since URL
  // parsing treats a backslash as a slash, "/\host".
  if (
    !asParsed.startsWith("/") ||
    asParsed.startsWith("//") ||
    asParsed.startsWith("/\\")
  ) {
    throw new Error(
      `fetchWithAuth() only sends requests to your app's own origin, so the access token never reaches a third party. "${path}" is not a path on it — pass a relative path such as '/api/orders'. Use base44.functions.fetch() to call a Base44 backend function, or plain fetch() for another origin.`
    );
  }
}
