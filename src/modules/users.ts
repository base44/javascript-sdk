import { AxiosInstance } from "axios";

/**
 * Creates the users module for the Base44 SDK
 * @param {AxiosInstance} axios - Axios instance
 * @param {string} appId - Application ID
 * @returns {Object} Users module
 */
export function createUsersModule(axios: AxiosInstance, appId: string) {
  return {
    /**
     * Invite a user to the application
     * @param {string} user_email - User's email address
     * @param {'user'|'admin'} role - User's role (user or admin)
     * @returns {Promise<any>}
     */
    async inviteUser(user_email: string, role: "user" | "admin"): Promise<any> {
      if (role !== "user" && role !== "admin") {
        throw new Error(
          `Invalid role: "${role}". Role must be either "user" or "admin".`
        );
      }

      const response = await axios.post(`/apps/${appId}/users/invite-user`, { user_email, role });
      return response;
    },
  };
}
