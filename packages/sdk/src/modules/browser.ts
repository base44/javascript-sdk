import { AxiosInstance } from "axios";
import {
  BrowserModule,
  BrowserSession,
  BrowserSessionOptions,
} from "./browser.types.js";

interface BrowserSessionResponse {
  session_id: string;
  connection_url: string;
  connection_scope: BrowserSession["connectionScope"];
  connection_expires_at?: string;
  session_expires_at?: string;
}

/**
 * Creates the Browser module for the Base44 SDK.
 *
 * @param axios - Axios instance (should be service role client)
 * @returns Browser module with methods to create remote browser sessions
 * @internal
 */
export function createBrowserModule(axios: AxiosInstance): BrowserModule {
  return {
    async getSession(
      options: BrowserSessionOptions = {}
    ): Promise<BrowserSession> {
      // The app is derived from the service token, so the route isn't app-scoped.
      const response = await axios.post<BrowserSessionResponse>(
        "/v1/browser-sessions",
        { capture_debug_artifacts: options.captureDebugArtifacts ?? true }
      );

      const data = response as unknown as BrowserSessionResponse;
      return {
        sessionId: data.session_id,
        connectionUrl: data.connection_url,
        connectionScope: data.connection_scope,
        ...(data.connection_expires_at && {
          connectionExpiresAt: data.connection_expires_at,
        }),
        ...(data.session_expires_at && {
          sessionExpiresAt: data.session_expires_at,
        }),
      };
    },
  };
}
