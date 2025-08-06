import { AxiosInstance } from "axios";

/**
 * Creates the auth module for the Base44 SDK
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string|number} appId - Application ID
 * @param {string} serverUrl - Server URL
 * @param {boolean} isApiKeyAuth - Whether using API key authentication
 * @returns {Object} Auth module with authentication methods
 */
export function createAuthModule(
  axios: AxiosInstance,
  appId: string,
  serverUrl: string,
  isApiKeyAuth = false
) {
  return {
    /**
     * Get current user information
     * @returns {Promise<Object>} Current user data
     * @throws {Error} When called with API key authentication
     */
    async me() {
      if (isApiKeyAuth) {
        throw new Error("The .me() method cannot be used with API key authentication. This method requires a user token to access user-specific data.");
      }
      return axios.get(`/apps/${appId}/entities/User/me`);
    },

    /**
     * Update current user data
     * @param {Object} data - Updated user data
     * @returns {Promise<Object>} Updated user
     * @throws {Error} When called with API key authentication
     */
    async updateMe(data: Record<string, any>) {
      if (isApiKeyAuth) {
        throw new Error("The .updateMe() method cannot be used with API key authentication. This method requires a user token to access user-specific data.");
      }
      return axios.put(`/apps/${appId}/entities/User/me`, data);
    },

    /**
     * Redirects the user to the app's login page
     * @param {string} nextUrl - URL to redirect to after successful login
     * @throws {Error} When not in a browser environment or when using API key authentication
     */
    redirectToLogin(nextUrl: string) {
      if (isApiKeyAuth) {
        throw new Error("The .login() method cannot be used with API key authentication. API keys do not require user login flows.");
      }
      
      // This function only works in a browser environment
      if (typeof window === "undefined") {
        throw new Error(
          "Login method can only be used in a browser environment"
        );
      }

      // If nextUrl is not provided, use the current URL
      const redirectUrl = nextUrl || window.location.href;

      // Build the login URL
      const loginUrl = `/login?from_url=${encodeURIComponent(redirectUrl)}`;

      // Redirect to the login page
      window.location.href = loginUrl;
    },

    /**
     * Logout the current user
     * Removes the token from localStorage and optionally redirects to a URL or reloads the page
     * @param redirectUrl - Optional URL to redirect to after logout. Reloads the page if not provided
     * @returns {Promise<void>}
     * @throws {Error} When called with API key authentication
     */
    logout(redirectUrl?: string) {
      if (isApiKeyAuth) {
        throw new Error("The .logout() method cannot be used with API key authentication. API keys do not have user sessions to logout from.");
      }

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
      if (typeof window !== "undefined") {
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          window.location.reload();
        }
      }
    },

    /**
     * Set authentication token
     * @param {string} token - Auth token
     * @param {boolean} [saveToStorage=true] - Whether to save the token to localStorage
     * @throws {Error} When called with API key authentication
     */
    setToken(token: string, saveToStorage = true) {
      if (isApiKeyAuth) {
        throw new Error("The .setToken() method cannot be used with API key authentication. API keys are set during client initialization.");
      }
      
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
     * @throws {Error} When called with API key authentication
     */
    async loginViaUsernamePassword(
      email: string,
      password: string,
      turnstileToken?: string
    ) {
      if (isApiKeyAuth) {
        throw new Error("The .loginViaUsernamePassword() method cannot be used with API key authentication. API keys do not require user login flows.");
      }
      
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
     * @throws {Error} When called with API key authentication
     */
    async isAuthenticated() {
      if (isApiKeyAuth) {
        throw new Error("The .isAuthenticated() method cannot be used with API key authentication. API keys do not have user authentication states.");
      }
      
      try {
        await this.me();
        return true;
      } catch (error) {
        return false;
      }
    },
  };
}
