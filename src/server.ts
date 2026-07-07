import { createClient } from "./client.js";
import type { Base44Client } from "./client.types.js";

const ACCESS_TOKEN_COOKIE_NAME = "base44_access_token";

/**
 * Options for creating a server-side Base44 client with {@linkcode createServerClient | createServerClient()}.
 */
export interface CreateServerClientOptions {
  /**
   * The incoming Fetch API `Request`.
   *
   * Used to resolve configuration from `Base44-*` headers, the user token from
   * the `Authorization` header, and the `base44_access_token` cookie set by the
   * browser SDK.
   */
  request: Request;
  /**
   * Environment variables record, such as a Cloudflare Worker `env` binding or
   * Node's `process.env`.
   *
   * Recognized variables: `BASE44_APP_ID`, `BASE44_API_URL`,
   * `BASE44_SERVICE_TOKEN`, and `BASE44_FUNCTIONS_VERSION`.
   */
  env?: Record<string, string | undefined>;
  /**
   * The Base44 app ID. Takes precedence over `env.BASE44_APP_ID` and the
   * `Base44-App-Id` request header.
   */
  appId?: string;
  /**
   * The Base44 server URL. Must be an absolute URL. Takes precedence over
   * `env.BASE44_API_URL` and the `Base44-Api-Url` request header.
   *
   * @defaultValue `"https://base44.app"`
   */
  serverUrl?: string;
  /**
   * User authentication token. Takes precedence over the request's
   * `Authorization: Bearer` header and the `base44_access_token` cookie.
   */
  token?: string;
  /**
   * Service role authentication token. Takes precedence over
   * `env.BASE44_SERVICE_TOKEN` and the `Base44-Service-Authorization` request
   * header.
   */
  serviceToken?: string;
  /**
   * Version string for the functions API. Takes precedence over
   * `env.BASE44_FUNCTIONS_VERSION` and the `Base44-Functions-Version` request
   * header.
   * @internal
   */
  functionsVersion?: string;
}

/**
 * Returns the first truthy value, treating empty strings the same as unset.
 */
function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Extracts the token from a `Bearer <token>` authorization header value.
 * Returns undefined when the header is missing or malformed.
 */
function parseBearerToken(header: string | null): string | undefined {
  if (!header) {
    return undefined;
  }
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer" && parts[1]) {
    return parts[1];
  }
  return undefined;
}

/**
 * Minimal cookie parser (no dependency): reads a single cookie value from a
 * `Cookie` request header, handling quoted values and URL-encoding.
 */
function getCookieValue(
  cookieHeader: string | null,
  name: string
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    if (part.slice(0, separatorIndex).trim() !== name) {
      continue;
    }
    let value = part.slice(separatorIndex + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

function isAbsoluteUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a Base44 client for server-side rendering (SSR) and edge runtimes.
 *
 * Use this function in Cloudflare Workers, framework loaders, and other
 * server environments that handle Fetch API requests. Unlike
 * {@linkcode createClient | createClient()}, the returned client is safe to
 * create per request outside a browser: analytics is fully disabled (no
 * background timers), HTTP requests use the `fetch` adapter, and no browser
 * storage is touched.
 *
 * Each configuration value is resolved in order from: the explicit option,
 * the `env` record (`BASE44_APP_ID`, `BASE44_API_URL`, `BASE44_SERVICE_TOKEN`,
 * `BASE44_FUNCTIONS_VERSION`), and finally the request headers — the same
 * `Base44-*` headers read by
 * {@linkcode createClientFromRequest | createClientFromRequest()}. The user
 * token is resolved from the explicit option, then the request's
 * `Authorization: Bearer` header, then the `base44_access_token` cookie that
 * the browser SDK mirrors from localStorage.
 *
 * @param options - Server client options, including the incoming request and optional environment record.
 * @returns A configured Base44 client instance scoped to the incoming request.
 * @throws {Error} When no app ID can be resolved from the options, environment, or request headers.
 * @throws {Error} When the resolved server URL isn't an absolute URL.
 *
 * @example
 * ```typescript
 * // Cloudflare Worker fetch handler
 * import { createServerClient } from '@base44/sdk';
 *
 * export default {
 *   async fetch(request, env) {
 *     const base44 = createServerClient({ request, env });
 *
 *     // Reads data as the user identified by the request's cookie or
 *     // Authorization header (anonymous when neither is present)
 *     const products = await base44.entities.Products.list();
 *
 *     return Response.json({ products });
 *   }
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Framework loader (React Router, Remix, and similar)
 * import { createServerClient } from '@base44/sdk';
 *
 * export async function loader({ request }) {
 *   const base44 = createServerClient({
 *     request,
 *     appId: 'my-app-id'
 *   });
 *
 *   const user = await base44.auth.me().catch(() => null);
 *   return { user };
 * }
 * ```
 */
export function createServerClient(
  options: CreateServerClientOptions
): Base44Client {
  const { request, env = {} } = options;
  const headers = request.headers;

  const appId = firstNonEmpty(
    options.appId,
    env.BASE44_APP_ID,
    headers.get("Base44-App-Id")
  );
  if (!appId) {
    throw new Error(
      "createServerClient: unable to resolve an app ID. Pass appId explicitly, set the BASE44_APP_ID environment variable, or forward the Base44-App-Id request header."
    );
  }

  const serverUrl =
    firstNonEmpty(
      options.serverUrl,
      env.BASE44_API_URL,
      headers.get("Base44-Api-Url")
    ) ?? "https://base44.app";
  if (!isAbsoluteUrl(serverUrl)) {
    throw new Error(
      `createServerClient: serverUrl must be an absolute URL, got "${serverUrl}"`
    );
  }

  const token = firstNonEmpty(
    options.token,
    parseBearerToken(headers.get("Authorization")),
    getCookieValue(headers.get("Cookie"), ACCESS_TOKEN_COOKIE_NAME)
  );

  const serviceToken = firstNonEmpty(
    options.serviceToken,
    env.BASE44_SERVICE_TOKEN,
    parseBearerToken(headers.get("Base44-Service-Authorization"))
  );

  const functionsVersion = firstNonEmpty(
    options.functionsVersion,
    env.BASE44_FUNCTIONS_VERSION,
    headers.get("Base44-Functions-Version")
  );

  // Propagate Base44-State like createClientFromRequest, so the server client
  // degrades gracefully behind the existing Base44 proxy
  const stateHeader = headers.get("Base44-State");
  const additionalHeaders: Record<string, string> = {};
  if (stateHeader) {
    additionalHeaders["Base44-State"] = stateHeader;
  }

  return createClient({
    serverUrl,
    appId,
    token,
    serviceToken,
    functionsVersion,
    headers: additionalHeaders,
    requiresAuth: false,
    disableAnalytics: true,
    adapter: "fetch",
  });
}
