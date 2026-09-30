import { AxiosInstance } from "axios";
import { McpModule } from "./mcp.types";

/**
 * Creates the MCP module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns MCP module for the app's MCP consent page
 * @internal
 */
export function createMcpModule(
  axios: AxiosInstance,
  appId: string
): McpModule {
  return {
    async getConsentInfo(ctx) {
      return axios.get(`/apps/${appId}/mcp/consent-info`, {
        params: { handle: ctx },
      });
    },

    async authorizeGrant(ctx, action) {
      return axios.post(`/apps/${appId}/mcp/authorize-grant`, { ctx, action });
    },
  };
}
