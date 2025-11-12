import { AxiosInstance } from "axios";

export interface LoginViaEmailPasswordResponse {
  access_token: string;
  user: any;
}

/**
 * Public auth methods available from the SDK.
 * Document only the methods you want to expose and support.
 */
export interface AuthMethods {
  /**
   * Get current user information
   * @example
   * ```ts
   * import { createClient, getAccessToken } from '@base44/sdk';
   *
   * const client = createClient({ appId: 'your-app-id', token: getAccessToken() });
   * const user = await client.auth.me();
   * console.log(user);
   * ```
   */
  me(): Promise<any>;

  /** Update current user data */
  /** @internal */
  updateMe(data: Record<string, any>): Promise<any>;

  /**
   * Redirects the user to the app's login page
   * @example
   * ```ts
   * // Redirect and return to current route after login
   * client.auth.redirectToLogin(window.location.pathname);
   * ```
   */
  redirectToLogin(nextUrl: string): void;

  /**
   * Logout the current user
   * Removes the token from localStorage and optionally redirects to a URL or reloads the page
   */
  /**
   * @example
   * ```ts
   * // Reload the page after logout
   * client.auth.logout();
   *
   * // Or redirect to a login page
   * client.auth.logout('/login');
   * ```
   */
  logout(redirectUrl?: string): void;

  /**
   * Set authentication token
   * @param token - Auth token
   * @param saveToStorage - Whether to save the token to localStorage (default true)
   */
  /**
   * @example
   * ```ts
   * // After obtaining a token from your auth flow
   * client.auth.setToken(accessToken);
   * ```
   */
  setToken(token: string, saveToStorage?: boolean): void;

  /**
   * Login via username and password
   * @returns Login response with access_token and user
   */
  /**
   * @example
   * ```ts
   * const { access_token, user } = await client.auth.loginViaEmailPassword(
   *   'user@example.com',
   *   's3cret'
   * );
   * client.auth.setToken(access_token);
   * ```
   */
  loginViaEmailPassword(
    email: string,
    password: string,
    turnstileToken?: string
  ): Promise<LoginViaEmailPasswordResponse>;

  /**
   * Verify if the current token is valid
   * @example
   * ```ts
   * const ok = await client.auth.isAuthenticated();
   * if (!ok) client.auth.redirectToLogin('/dashboard');
   * ```
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * @example
   * ```ts
   * await client.auth.inviteUser('new-user@example.com', 'member');
   * ```
   */
  inviteUser(userEmail: string, role: string): Promise<any>;

  /**
   * @example
   * ```ts
   * await client.auth.register({
   *   email: 'user@example.com',
   *   password: 's3cret',
   * });
   * ```
   */
  register(payload: {
    email: string;
    password: string;
    turnstile_token?: string | null;
    referral_code?: string | null;
  }): Promise<any>;

  /**
   * @example
   * ```ts
   * await client.auth.verifyOtp({ email: 'user@example.com', otpCode: '123456' });
   * ```
   */
  verifyOtp(args: { email: string; otpCode: string }): Promise<any>;

  /**
   * @example
   * ```ts
   * await client.auth.resendOtp('user@example.com');
   * ```
   */
  resendOtp(email: string): Promise<any>;

  /**
   * @example
   * ```ts
   * await client.auth.resetPasswordRequest('user@example.com');
   * ```
   */
  resetPasswordRequest(email: string): Promise<any>;

  /**
   * @example
   * ```ts
   * await client.auth.resetPassword({ resetToken: 'token', newPassword: 'newPass123' });
   * ```
   */
  resetPassword(args: { resetToken: string; newPassword: string }): Promise<any>;

  /**
   * @example
   * ```ts
   * await client.auth.changePassword({
   *   userId: 'abc123',
   *   currentPassword: 'oldPass',
   *   newPassword: 'newPass123',
   * });
   * ```
   */
  changePassword(args: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<any>;
}

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
): AuthMethods {
  return {
    async me() {
      return axios.get(`/apps/${appId}/entities/User/me`);
    },
    async updateMe(data: Record<string, any>) {
      return axios.put(`/apps/${appId}/entities/User/me`, data);
    },

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
