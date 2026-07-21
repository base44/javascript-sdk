import { AxiosInstance } from "axios";
import { SsoModule } from "./sso.types";

/**
 * Creates the SSO module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns SSO module with authentication methods
 * @internal
 */
export function createSsoModule(
  axios: AxiosInstance,
  appId: string
): SsoModule {
  return {
    // Get SSO access token for a specific user
    async getAccessToken(userid: string) {
      const url = `/apps/${appId}/auth/sso/accesstoken/${userid}`;
      return axios.get(url);
    },

    // Get the stored SSO OIDC ID token for a specific user
    async getIdToken(userid: string): Promise<string> {
      const url = `/apps/${appId}/auth/sso/idtoken/${userid}`;
      const response = await axios.get<string>(url);
      // The configured response interceptor unwraps response.data at runtime,
      // while AxiosInstance retains AxiosResponse typings.
      return response as unknown as string;
    },
  };
}
