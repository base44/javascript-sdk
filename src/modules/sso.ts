import { AxiosInstance } from "axios";
import { SsoModule } from "./sso.types";

/**
 * Creates the SSO module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @param userToken - User authentication token
 * @returns SSO module with authentication methods
 * @internal
 */
export function createSsoModule(
  axios: AxiosInstance,
  appId: string,
  userToken?: string
): SsoModule {
  return {
    // Get SSO access token for a specific user
    async getAccessToken(userid: string) {
      const url = `/apps/${appId}/auth/sso/accesstoken/${userid}`;

      // Prepare headers with both tokens if available
      const headers: Record<string, string> = {};

      if (userToken) {
        headers["on-behalf-of"] = `Bearer ${userToken}`;
      }

      return axios.get(url, { headers });
    },
  };
}
