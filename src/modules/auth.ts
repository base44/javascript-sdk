import { AxiosInstance } from "axios";
import {
  AuthModule,
  AuthModuleOptions,
  User,
  VerifyOtpParams,
  ChangePasswordParams,
  ResetPasswordParams,
} from "./auth.types";

/**
 * Creates the auth module for the Base44 SDK.
 *
 * @param axios - Axios instance for API requests
 * @param functionsAxiosClient - Axios instance for functions API requests
 * @param appId - Application ID
 * @param options - Configuration options including server URLs
 * @returns Auth module with authentication and user management methods
 * @internal
 */
export function createAuthModule(
  axios: AxiosInstance,
  functionsAxiosClient: AxiosInstance,
  appId: string,
  options: AuthModuleOptions
): AuthModule {
  return {
    // Get current user information
    async me() {
      return axios.get(`/apps/${appId}/entities/User/me`);
    },

    // Update current user data
    async updateMe(
      data: Partial<Omit<User, "id" | "created_at" | "updated_at">>
    ) {
      return axios.put(`/apps/${appId}/entities/User/me`, data);
    },

    // Redirects the user to the app's login page
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

    // Logout the current user
    // Removes the token from localStorage and optionally redirects to a URL or reloads the page
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

    // Set authentication token
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

    // Login using username and password
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

    // Verify if the current token is valid
    async isAuthenticated() {
      try {
        await this.me();
        return true;
      } catch (error) {
        return false;
      }
    },

    // Invite a user to the app
    inviteUser(userEmail: string, role: string) {
      return axios.post(`/apps/${appId}/users/invite-user`, {
        user_email: userEmail,
        role,
      });
    },

    // Register a new user account
    register(payload: {
      email: string;
      password: string;
      turnstile_token?: string | null;
      referral_code?: string | null;
    }) {
      return axios.post(`/apps/${appId}/auth/register`, payload);
    },

    // Verify an OTP (One-time password) code
    verifyOtp({ email, otpCode }: VerifyOtpParams) {
      return axios.post(`/apps/${appId}/auth/verify-otp`, {
        email,
        otp_code: otpCode,
      });
    },

    // Resend an OTP code to the user's email
    resendOtp(email: string) {
      return axios.post(`/apps/${appId}/auth/resend-otp`, { email });
    },

    // Request a password reset
    resetPasswordRequest(email: string) {
      return axios.post(`/apps/${appId}/auth/reset-password-request`, {
        email,
      });
    },

    // Reset password using a reset token
    resetPassword({ resetToken, newPassword }: ResetPasswordParams) {
      return axios.post(`/apps/${appId}/auth/reset-password`, {
        reset_token: resetToken,
        new_password: newPassword,
      });
    },

    // Change the user's password
    changePassword({
      userId,
      currentPassword,
      newPassword,
    }: ChangePasswordParams) {
      return axios.post(`/apps/${appId}/auth/change-password`, {
        user_id: userId,
        current_password: currentPassword,
        new_password: newPassword,
      });
    },
  };
}
