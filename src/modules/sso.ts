import { AxiosInstance } from "axios";

/**
 * Creates the SSO module for the Base44 SDK
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string} appId - Application ID
 * @returns {Object} SSO module with SSO authentication methods
 */
export function createSsoModule(
  axios: AxiosInstance,
  appId: string
) {
  return {
    /**
     * Get current user sso access token
     * @param {string} userid - User ID to include as path parameter
     * @returns {Promise<Object>} Current user sso access_token
     */
    async getAccessToken(userid: string) {
      const url = `/apps/${appId}/auth/sso/accesstoken/${userid}`;
      return axios.get(url);
    },
  };
}
