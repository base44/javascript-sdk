import { AxiosInstance } from "axios";

/**
 * Creates the auth module for the Base44 SDK
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string|number} appId - Application ID
 * @param {string} serverUrl - Server URL
 * @returns {Object} Auth module with authentication methods
 */
export function createAuthModule(
  axios: AxiosInstance,
  appId: string,
  serverUrl: string
) {
  return {
    /**
     * Get current user information
     * @returns {Promise<Object>} Current user data
     */
    async me() {
      return axios.get(`/apps/${appId}/entities/User/me`);
    },

    /**
     * Update current user data
     * @param {Object} data - Updated user data
     * @returns {Promise<Object>} Updated user
     */
    async updateMe(data: Record<string, any>) {
      return axios.put(`/apps/${appId}/entities/User/me`, data);
    },

    /**
     * Redirects the user to the Base44 login page
     * @param {string} nextUrl - URL to redirect to after successful login
     * @throws {Error} When not in a browser environment
     */
    login(nextUrl: string) {
      // This function only works in a browser environment
      if (typeof window === "undefined") {
        throw new Error(
          "Login method can only be used in a browser environment"
        );
      }

      // If nextUrl is not provided, use the current URL
      const redirectUrl = nextUrl || window.location.href;

      // Build the login URL
      const loginUrl = `${serverUrl}/login?from_url=${encodeURIComponent(
        redirectUrl
      )}&app_id=${appId}`;

      // Redirect to the login page
      window.location.href = loginUrl;
    },

    /**
     * Logout the current user
     * Removes the token from localStorage and optionally redirects to a URL
     * @param redirectUrl - Optional URL to redirect to after logout
     * @returns {Promise<void>}
     */
    async logout(redirectUrl?: string) {
      // Remove token from axios headers
      delete axios.defaults.headers.common["Authorization"];

      // Remove token from localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.removeItem("base44_access_token");
        } catch (e) {
          console.error("Failed to remove token from localStorage:", e);
        }
      }

      // Redirect if a URL is provided
      if (redirectUrl && typeof window !== "undefined") {
        window.location.href = redirectUrl;
      }

      return Promise.resolve();
    },

    /**
     * Set authentication token
     * @param {string} token - Auth token
     * @param {boolean} [saveToStorage=true] - Whether to save the token to localStorage
     */
    setToken(token: string, saveToStorage = true) {
      if (!token) return;

      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      // Save token to localStorage if requested
      if (
        saveToStorage &&
        typeof window !== "undefined" &&
        window.localStorage
      ) {
        try {
          window.localStorage.setItem("base44_access_token", token);
        } catch (e) {
          console.error("Failed to save token to localStorage:", e);
        }
      }
    },

    /**
     * Login via username and password
     * @param email - User email
     * @param password - User password
     * @param turnstileToken - Optional Turnstile captcha token
     * @returns Login response with access_token and user
     */
    async loginViaUsernamePassword(
      email: string,
      password: string,
      turnstileToken?: string
    ) {
      try {
        const response: { access_token: string; user: any } = await axios.post(
          `/apps/${appId}/auth/login`,
          {
            email,
            password,
            ...(turnstileToken && { turnstile_token: turnstileToken }),
          }
        );

        const { access_token, user } = response;

        if (access_token) {
          this.setToken(access_token);
        }

        return {
          access_token,
          user,
        };
      } catch (error: any) {
        // Handle authentication errors and cleanup
        if (error.response?.status === 401) {
          await this.logout();
        }
        throw error;
      }
    },

    /**
     * Verify if the current token is valid
     * @returns {Promise<boolean>} True if token is valid
     */
    async isAuthenticated() {
      try {
        await this.me();
        return true;
      } catch (error) {
        return false;
      }
    },
  };
}
