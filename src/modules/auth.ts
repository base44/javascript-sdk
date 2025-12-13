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
  functionsAxiosClient: AxiosInstance,
  appId: string,
  options: {
    serverUrl: string;
    appBaseUrl?: string;
  }
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
     * Redirects the user to the app's login page
     * @param {string} nextUrl - URL to redirect to after successful login
     * @throws {Error} When not in a browser environment
     */
    redirectToLogin(nextUrl: string) {
      // This function only works in a browser environment
      if (typeof window === "undefined") {
        throw new Error(
          "Login method can only be used in a browser environment"
        );
      }

      // If nextUrl is not provided, use the current URL
      const redirectUrl = nextUrl
        ? new URL(nextUrl, window.location.origin).toString()
        : window.location.href;

      // Build the login URL
      const loginUrl = `${
        options.appBaseUrl ?? ""
      }/login?from_url=${encodeURIComponent(redirectUrl)}`;

      // Redirect to the login page
      window.location.href = loginUrl;
    },

    /**
     * Redirects the user to a provider's login page
     * @param {string} provider - OAuth provider name (e.g., 'google', 'github')
     * @param {string} fromUrl - Optional URL to redirect to after successful login (defaults to '/')
     * @throws {Error} When not in a browser environment
     */
    loginWithProvider(provider: string, fromUrl: string = "/") {
      // Build the full redirect URL
      const redirectUrl = new URL(fromUrl, window.location.origin).toString();

      // Build the provider login URL (google is the default, so no provider path needed)
      const providerPath = provider === "google" ? "" : `/${provider}`;
      const loginUrl = `${
        options.serverUrl
      }/api/apps/auth${providerPath}/login?app_id=${appId}&from_url=${encodeURIComponent(
        redirectUrl
      )}`;

      // Redirect to the provider login page
      window.location.href = loginUrl;
    },

    /**
     * Logout the current user
     * Removes the token from localStorage and optionally redirects to a URL or reloads the page
     * @param redirectUrl - Optional URL to redirect to after logout. Reloads the page if not provided
     * @returns {Promise<void>}
     */
    logout(redirectUrl?: string) {
      // Remove token from axios headers
      delete axios.defaults.headers.common["Authorization"];

      // Remove token from localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.removeItem("base44_access_token");
          // Remove "token" that is set by the built-in SDK of platform version 2
          window.localStorage.removeItem("token");
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
     */
    setToken(token: string, saveToStorage = true) {
      if (!token) return;

      // handle token change for axios clients
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      functionsAxiosClient.defaults.headers.common[
        "Authorization"
      ] = `Bearer ${token}`;

      // Save token to localStorage if requested
      if (
        saveToStorage &&
        typeof window !== "undefined" &&
        window.localStorage
      ) {
        try {
          window.localStorage.setItem("base44_access_token", token);
          // Set "token" that is set by the built-in SDK of platform version 2
          window.localStorage.setItem("token", token);
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
    async loginViaEmailPassword(
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

    inviteUser(userEmail: string, role: string) {
      return axios.post(`/apps/${appId}/users/invite-user`, {
        user_email: userEmail,
        role,
      });
    },

    register(payload: {
      email: string;
      password: string;
      turnstile_token?: string | null;
      referral_code?: string | null;
    }) {
      return axios.post(`/apps/${appId}/auth/register`, payload);
    },

    verifyOtp({ email, otpCode }: { email: string; otpCode: string }) {
      return axios.post(`/apps/${appId}/auth/verify-otp`, {
        email,
        otp_code: otpCode,
      });
    },

    resendOtp(email: string) {
      return axios.post(`/apps/${appId}/auth/resend-otp`, { email });
    },

    resetPasswordRequest(email: string) {
      return axios.post(`/apps/${appId}/auth/reset-password-request`, {
        email,
      });
    },

    resetPassword({
      resetToken,
      newPassword,
    }: {
      resetToken: string;
      newPassword: string;
    }) {
      return axios.post(`/apps/${appId}/auth/reset-password`, {
        reset_token: resetToken,
        new_password: newPassword,
      });
    },

    changePassword({
      userId,
      currentPassword,
      newPassword,
    }: {
      userId: string;
      currentPassword: string;
      newPassword: string;
    }) {
      return axios.post(`/apps/${appId}/auth/change-password`, {
        user_id: userId,
        current_password: currentPassword,
        new_password: newPassword,
      });
    },
  };
}
