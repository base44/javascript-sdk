import { createAxiosClient } from "./utils/axios-client.js";
import { createBuilderSessionReader } from "./modules/builder.js";
import type { BuilderSessionReader } from "./modules/builder.types.js";
import type { CreateClientOptions } from "./client.types.js";

/**
 * Configuration for reading a builder session with a grant.
 */
export interface CreateBuilderSessionConfig {
  /** The app being built. A builder session *is* an app — there is nothing separate to open. */
  appId: string;
  /**
   * The Base44 server URL.
   *
   * @defaultValue `"https://base44.app"`
   */
  serverUrl?: string;
  /**
   * A grant token.
   *
   * Use {@link CreateBuilderSessionConfig.getToken | getToken} instead for anything
   * that outlives one grant, which most builds do.
   */
  token?: string;
  /**
   * Called for a grant before every request and every stream (re)connect.
   *
   * The shape to prefer. A grant is short-lived on purpose, so a build routinely
   * outlasts the one it started with; re-reading the credential rather than
   * capturing it is what makes a refresh invisible to the caller, and it is the
   * habit the SDK's actors module already has internally.
   */
  getToken?: () => string | Promise<string> | undefined;
  /** Additional client options. */
  options?: CreateClientOptions;
}

/**
 * Reads one builder session with a grant.
 *
 * The browser's entry point. A grant is read-only, scoped to one session and
 * short-lived, so this returns the read half of a builder session and nothing else
 * — the writes live on the server, where the credential that can start a turn
 * belongs.
 *
 * That asymmetry is the design rather than a limitation, and it is the thing an
 * integrator gets wrong first: reads go browser to Base44 directly, keeping an
 * open stream off your serverless function path, while writes go browser to your
 * server to Base44. Because a grant cannot send, no configuration lets a leaked
 * browser credential spend your workspace's credits.
 *
 * Mint the grant on your server with
 * {@link BuilderSession.createGrant | createGrant()}.
 *
 * @param config - The app, and how to get a grant for it.
 * @returns The read-only session.
 *
 * @example
 * ```typescript
 * import { createBuilderSession } from '@base44/sdk';
 *
 * const builder = createBuilderSession({
 *   appId,
 *   // Re-read on every reconnect, so a build outliving its grant just works.
 *   getToken: () =>
 *     fetch('/api/base44/grant', { method: 'POST', body: JSON.stringify({ appId }) })
 *       .then((response) => response.json())
 *       .then((grant) => grant.token),
 * });
 *
 * const unsubscribe = builder.subscribe((event) => {
 *   switch (event.type) {
 *     case 'message.updated': upsertMessage(event.data); break;   // by messageId
 *     case 'state.changed':   setStatus(event.data);     break;
 *     case 'turn.finished':   markDone(event.turnId);    break;
 *   }
 * });
 *
 * // Sending goes to YOUR server, which holds the write credential.
 * await fetch('/api/base44/message', { method: 'POST', body: … });
 * ```
 */
export function createBuilderSession(
  config: CreateBuilderSessionConfig
): BuilderSessionReader {
  const {
    appId,
    serverUrl = "https://base44.app",
    token,
    getToken,
    options,
  } = config;

  return createBuilderSessionReader({
    axios: createAxiosClient({
      baseURL: `${serverUrl}/api`,
      onError: options?.onError,
    }),
    appId,
    serverUrl,
    getToken: getToken ?? (() => token),
  });
}
