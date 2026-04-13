import { AxiosInstance } from "axios";
import {
  AuthModule,
  AuthModuleOptions,
  VerifyOtpParams,
  ChangePasswordParams,
  ResetPasswordParams,
} from "./auth.types";

function isInsideIframe(): boolean {
  if (typeof window === "undefined") return false;
  return window !== window.parent;
}

/**
 * Opens a URL in a centered popup and waits for the backend to postMessage
 * the auth result back. On success, redirects the current window to
 * redirectUrl with the token params appended, preserving the same behaviour
 * as a normal full-page redirect flow.
 *
 * @param url - The login URL to open in the popup (should include popup_origin).
 * @param redirectUrl - Where to redirect after auth (the original fromUrl).
 * @param expectedOrigin - The origin we expect the postMessage to come from.
 */
function loginViaPopup(
  url: string,
  redirectUrl: string,
  expectedOrigin: string
): void {
  const width = 500;
  const height = 600;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

  const popup = window.open(
    url,
    "base44_auth",
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );

  if (!popup) {
    return;
  }

  const cleanup = () => {
    window.removeEventListener("message", onMessage);
    clearInterval(pollTimer);
    if (!popup.closed) popup.close();
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== expectedOrigin) return;
    if (event.source !== popup) return;
    if (!event.data?.access_token) return;

    cleanup();

    const callbackUrl = new URL(redirectUrl);
    const { access_token, is_new_user } = event.data;

    callbackUrl.searchParams.set("access_token", access_token);

    if (is_new_user != null) {
      callbackUrl.searchParams.set("is_new_user", String(is_new_user));
    }

    window.location.href = callbackUrl.toString();
  };

  // Only used to detect the user closing the popup before auth completes
  const pollTimer = setInterval(() => {
    if (popup.closed) cleanup();
  }, 500);

  window.addEventListener("message", onMessage);
}

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
    async updateMe(data: Record<string, any>) {
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
      const loginUrl = `${options.appBaseUrl}/login?from_url=${encodeURIComponent(redirectUrl)}`;

      // Redirect to the login page
      window.location.href = loginUrl;
    },

    // Redirects the user to a provider's login page
    loginWithProvider(provider: string, fromUrl: string = "/") {
      // Build the full redirect URL
      const redirectUrl = new URL(fromUrl, window.location.origin).toString();

      const queryParams = `app_id=${appId}&from_url=${encodeURIComponent(redirectUrl)}`;

      // SSO uses a different URL structure with appId in the path
      let authPath: string;
      if (provider === "sso") {
        authPath = `/apps/${appId}/auth/sso/login`;
      } else {
        // Google is the default provider, so no provider path segment needed
        const providerPath = provider === "google" ? "" : `/${provider}`;
        authPath = `/apps/auth${providerPath}/login`;
      }

      const loginUrl = `${options.appBaseUrl}/api${authPath}?${queryParams}`;

      // When running inside an iframe, use a popup to avoid OAuth providers
      // blocking iframe navigation.
      if (isInsideIframe()) {
        const popupLoginUrl = `${loginUrl}&popup_origin=${encodeURIComponent(window.location.origin)}`;
        return loginViaPopup(popupLoginUrl, redirectUrl, window.location.origin);
      }

      // Default: full-page redirect
      window.location.href = loginUrl;
    },

    // Logout the current user
    logout(redirectUrl?: string) {
      // Remove token from axios headers (always do this)
      delete axios.defaults.headers.common["Authorization"];

      // Only do the rest if in a browser environment
      if (typeof window !== "undefined") {
        // Remove token from localStorage
        if (window.localStorage) {
          try {
            window.localStorage.removeItem("base44_access_token");
            // Remove "token" that is set by the built-in SDK of platform version 2
            window.localStorage.removeItem("token");
          } catch (e) {
            console.error("Failed to remove token from localStorage:", e);
          }
        }

        // Determine the from_url parameter
        const fromUrl = redirectUrl || window.location.href;

        // Redirect to server-side logout endpoint to clear HTTP-only cookies
        const logoutUrl = `${options.appBaseUrl}/api/apps/auth/logout?from_url=${encodeURIComponent(fromUrl)}`;
        window.location.href = logoutUrl;
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
