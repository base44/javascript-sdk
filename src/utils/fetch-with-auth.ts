import type { AxiosInstance } from "axios";

/** `fetch`-compatible transport that can resolve a root-relative path. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Options for {@link Base44Client.fetchWithAuth}. */
export interface FetchWithAuthInit extends RequestInit {
  /**
   * The `fetch` that resolves a root-relative path against your app's own
   * routes. Defaults to the global `fetch`, which does that in a browser but
   * not on a server, where a path with no origin has nothing to resolve
   * against. In Nitro pass its own, which routes a leading-slash path
   * in-process: `import { fetch } from "nitro"`.
   */
  fetch?: FetchLike;
}

/**
 * Builds the client's `fetchWithAuth`: a `fetch` to the app's own origin that
 * carries whatever credentials this client holds.
 *
 * That is the user's access token in a browser, and from
 * `createClientFromRequest()` the full set that function reads back — so a
 * route reached this way rebuilds the caller's client, service role included.
 * The service credential is minted per request for the app as a whole, not for
 * one route, so a handler in the same worker already runs with that authority;
 * reaching it through a route hop is the privilege it would have had by
 * importing a shared function. What must never happen is a credential leaving
 * the app, and the relative-path rule, not a shorter header list, is what
 * prevents that.
 *
 * @param axios - The user-scoped instance. Its `Authorization` default is the
 * live token: it follows `setToken()` and is deleted on `logout()`, so a
 * request never carries a token the user no longer has. From
 * `createClientFromRequest()` it holds the caller's own token.
 * @param serviceRoleAxios - The service-role instance, holding the app's
 * per-request credential as its own `Authorization` default. A browser client
 * has none, so nothing is sent.
 * @internal
 */
export function createFetchWithAuth({
  axios,
  serviceRoleAxios,
  appId,
  serverUrl,
  functionsVersion,
  platformHeaders,
}: {
  axios: AxiosInstance;
  serviceRoleAxios: AxiosInstance;
  appId: string;
  serverUrl: string;
  functionsVersion?: string;
  platformHeaders?: Record<string, string>;
}) {
  const inherited = new Headers(platformHeaders);

  const bearer = (client: AxiosInstance): string | null => {
    const header = client.defaults.headers.common["Authorization"];
    return typeof header === "string" && header.startsWith("Bearer ")
      ? header
      : null;
  };

  return async function fetchWithAuth(
    path: string,
    init: FetchWithAuthInit = {}
  ): Promise<Response> {
    assertOwnOriginPath(path);

    const { fetch: transport = fetch, ...requestInit } = init;
    const headers = new Headers(init.headers);

    // A caller-supplied value always wins, so a route can hand the callee a
    // different identity on purpose (say, dropping Authorization to render a
    // page as anonymous).
    const inherit = (name: string, value: string | null | undefined) => {
      if (value && !headers.has(name)) headers.set(name, value);
    };

    // Exactly what createClientFromRequest reads, so the callee can rebuild
    // this client. Keep the two in step.
    inherit("Authorization", bearer(axios));
    inherit("Base44-Service-Authorization", bearer(serviceRoleAxios));
    inherit("Base44-App-Id", appId);
    inherit("Base44-Api-Url", serverUrl);
    inherit("Base44-Functions-Version", functionsVersion);
    inherit("Base44-State", inherited.get("Base44-State"));
    inherit("X-Data-Env", inherited.get("X-Data-Env"));

    // The path is passed through untouched: resolving it here would need a
    // document, and a root-relative path is already what a runtime that
    // dispatches in-process (Nitro's `fetch`) expects. `host` is deliberately
    // never sent — such a runtime synthesizes the sub-request's origin from it,
    // so forwarding the inbound one would point the hop at another host.
    return transport(path, { ...requestInit, headers });
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
      `fetchWithAuth() only sends requests to your app's own origin, so your app's credentials never reach a third party. "${path}" is not a path on it — pass a relative path such as '/api/orders'. Use base44.functions.fetch() to call a Base44 backend function, or plain fetch() for another origin.`
    );
  }
}
