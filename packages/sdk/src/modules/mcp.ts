import { AxiosInstance } from "axios";
import { McpModule } from "./mcp.types";

/**
 * Creates the MCP module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns MCP module for the app's MCP consent step
 * @internal
 */
export function createMcpModule(axios: AxiosInstance, appId: string): McpModule {
  // A session may live only in the auth cookie, which axios leaves off
  // cross-origin requests unless asked.
  const config = { withCredentials: true };
  return {
    async getConsentInfo(ctx) {
      return axios.get(`/apps/${appId}/mcp/consent-info`, {
        ...config,
        params: { handle: ctx },
      });
    },
    async respondToConsent(ctx, action) {
      return axios.post(
        `/apps/${appId}/mcp/authorize-grant`,
        { ctx, action },
        config
      );
    },
  };
}
