import { AxiosInstance } from "axios";

/**
 * Creates the SSO module for the Base44 SDK
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string} appId - Application ID
 * @param {string} [userToken] - User authentication token
 * @param {string} [serviceToken] - Service role authentication token
 * @returns {Object} SSO module with SSO authentication methods
 */
export function createSsoModule(
  axios: AxiosInstance,
  appId: string,
  userToken?: string
) {
  return {
    /**
     * Get current user sso access token
     * @param {string} userid - User ID to include as path parameter
     * @returns {Promise<Object>} Current user sso access_token
     */
    async getAccessToken(userid: string) {
      const url = `/apps/${appId}/auth/sso/accesstoken/${userid}`;
      
      // Prepare headers with both tokens if available
      const headers: Record<string, string> = {};
      
    
      if (userToken) {
        headers['on-behalf-of'] = `Bearer ${userToken}`;
      }
      
      return axios.get(url, { headers });
    },
  };
}
