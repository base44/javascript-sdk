import { AxiosInstance } from "axios";

/**
 * Creates the app logs module for the Base44 SDK
 * @param {AxiosInstance} axios - Axios instance
 * @param {string} appId - Application ID
 * @returns {Object} App logs module
 */
export function createAppLogsModule(axios: AxiosInstance, appId: string) {
  const baseURL = `/app-logs/${appId}`;

  return {
    /**
     * Log user activity in the app
     * @param {string} pageName - Name of the page being visited
     * @returns {Promise<void>}
     */
    async logUserInApp(pageName: string): Promise<void> {
      await axios.post(`${baseURL}/log-user-in-app/${pageName}`);
    },

    /**
     * Fetch app logs with optional parameters
     * @param {Object} params - Query parameters for filtering logs
     * @returns {Promise<any>} App logs data
     */
    async fetchLogs(params: Record<string, any> = {}): Promise<any> {
      const response = await axios.get(baseURL, { params });
      return response;
    },

    /**
     * Get app statistics
     * @param {Object} params - Query parameters for filtering stats
     * @returns {Promise<any>} App statistics
     */
    async getStats(params: Record<string, any> = {}): Promise<any> {
      const response = await axios.get(`${baseURL}/stats`, { params });
      return response;
    },
  };
}

