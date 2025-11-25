import { AxiosInstance } from "axios";

/**
 * An authenticated user.
 */
export interface User {
  /** Unique user identifier. */
  id: string;
  /** User's email address. */
  email: string;
  /** User's full name. */
  name?: string;
  /** User's first name. */
  first_name?: string;
  /** User's last name. */
  last_name?: string;
  /** URL to user's profile picture. */
  avatar_url?: string;
  /**
   * User's role in the app. Roles are configured in the app settings and determine the user's permissions and access levels.
   */
  role?: string;
  /** Timestamp when the user was created. */
  created_at?: string;
  /** Timestamp when the user was last updated. */
  updated_at?: string;
  /**
   * Additional custom fields defined in the user schema. Any custom properties added to the user schema in the app will be available here with their configured types and values.
   */
  [key: string]: any;
}

/**
 * Response from login endpoints containing user information and access token.
 */
export interface LoginResponse {
  /** JWT access token for authentication. */
  access_token: string;
  /** User information. */
  user: User;
}

/**
 * Payload for user registration.
 */
export interface RegisterPayload {
  /** User's email address. */
  email: string;
  /** User's password. */
  password: string;
  /** Optional {@link https://developers.cloudflare.com/turnstile/ | Cloudflare Turnstile CAPTCHA token} for bot protection. */
  turnstile_token?: string | null;
  /** Optional {@link https://docs.base44.com/Getting-Started/Referral-program | referral code} from an existing user. */
  referral_code?: string | null;
}

/**
 * Parameters for OTP verification.
 */
export interface VerifyOtpParams {
  /** User's email address. */
  email: string;
  /** One-time password code received by email. */
  otpCode: string;
}

/**
 * Parameters for changing a user's password.
 */
export interface ChangePasswordParams {
  /** User ID. */
  userId: string;
  /** Current password for verification. */
  currentPassword: string;
  /** New password to set. */
  newPassword: string;
}

/**
 * Parameters for resetting a password with a token.
 */
export interface ResetPasswordParams {
  /** Reset token received by email. */
  resetToken: string;
  /** New password to set. */
  newPassword: string;
}

/**
 * Configuration options for the auth module.
 */
export interface AuthModuleOptions {
  /** Server URL for API requests. */
  serverUrl: string;
  /** Optional base URL for the app (used for login redirects). */
  appBaseUrl?: string;
}

/**
 * Authentication module for managing user authentication and authorization. The module automatically stores tokens in local storage when available and manages authorization headers for API requests.
 *
 * This module provides comprehensive authentication functionality including:
 * - Email/password login and registration
 * - Token management
 * - User profile access and updates
 * - Password reset flows
 * - OTP verification
 * - User invitations
 *
 * The auth module is only available in user authentication mode (`base44.auth`).
 *
 * @example
 * ```typescript
 * // Login with email and password
 * const { access_token, user } = await base44.auth.loginViaEmailPassword(
 *   'user@example.com',
 *   'password123'
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Check if user is authenticated
 * const isAuth = await base44.auth.isAuthenticated();
 * ```
 *
 * @example
 * ```typescript
 * // Get current user profile
 * const currentUser = await base44.auth.me();
 * ```
 *
 * @example
 * ```typescript
 * // Logout and reload page
 * base44.auth.logout();
 * ```
 *
 * @example
 * ```typescript
 * // Logout and redirect to login page
 * base44.auth.logout('/login');
 * ```
 */
export interface AuthModule {
  /**
   * Gets the current authenticated user's information.
   *
   * @returns Promise resolving to the user's profile data.
   *
   * @example
   * ```typescript
   * // Get current user information
   * const user = await base44.auth.me();
   * console.log(`Logged in as: ${user.email}`);
   * console.log(`User ID: ${user.id}`);
   * ```
   */
  me(): Promise<User>;

  /**
   * Updates the current authenticated user's information.
   *
   * Only the fields included in the data object will be updated.
   * Commonly updated fields include `name`, `avatar_url`, and custom profile fields.
   *
   * @param data - Object containing the fields to update.
   * @returns Promise resolving to the updated user data.
   *
   * @example
   * ```typescript
   * // Update specific fields
   * const updatedUser = await base44.auth.updateMe({
   *   name: 'John Doe',
   *   avatar_url: 'https://example.com/avatar.jpg'
   * });
   * console.log(`Updated user: ${updatedUser.name}`);
   * ```
   *
   * @example
   * ```typescript
   * // Update custom fields defined in your User entity
   * await base44.auth.updateMe({
   *   bio: 'Software developer',
   *   phone: '+1234567890',
   *   preferences: { theme: 'dark' }
   * });
   * ```
   */
  updateMe(
    data: Partial<Omit<User, "id" | "created_at" | "updated_at">>
  ): Promise<User>;

  /**
   * Redirects the user to the app's login page.
   *
   * Redirects with a callback URL to return to after successful authentication. Requires a browser environment and cannot be used in the backend.
   *
   * @param nextUrl - URL to redirect to after successful login.
   * @throws {Error} When not in a browser environment.
   *
   * @example
   * ```typescript
   * // Redirect to login and come back to current page
   * base44.auth.redirectToLogin(window.location.href);
   * ```
   *
   * @example
   * ```typescript
   * // Redirect to login and then go to the dashboard page
   * base44.auth.redirectToLogin('/dashboard');
   * ```
   */
  redirectToLogin(nextUrl: string): void;

  /**
   * Logs out the current user.
   *
   * Removes the authentication token from local storage and Axios headers, then optionally redirects to a URL or reloads the page. Requires a browser environment and cannot be used in the backend.
   *
   * @param redirectUrl - Optional URL to redirect to after logout. Reloads the page if not provided.
   *
   * @example
   * ```typescript
   * // Logout and reload page
   * base44.auth.logout();
   * ```
   *
   * @example
   * ```typescript
   * // Logout and redirect to login page
   * base44.auth.logout('/login');
   * ```
   *
   * @example
   * ```typescript
   * // Logout and redirect to home
   * base44.auth.logout('/');
   * ```
   */
  logout(redirectUrl?: string): void;

  /**
   * Sets the authentication token.
   *
   * Updates the authorization header for API requests and optionally saves the token to local storage for persistence. Saving to local storage requires a browser environment and is automatically skipped in backend environments.
   *
   * @param token - JWT authentication token.
   * @param saveToStorage - Whether to save the token to local storage. Defaults to true.
   *
   * @example
   * ```typescript
   * // Set token and save to local storage
   * base44.auth.setToken('eyJhbGciOiJIUzI1NiIs...');
   * ```
   *
   * @example
   * ```typescript
   * // Set token without saving to local storage
   * base44.auth.setToken('eyJhbGciOiJIUzI1NiIs...', false);
   * ```
   */
  setToken(token: string, saveToStorage?: boolean): void;

  /**
   * Logs in a registered user using email and password.
   *
   * Authenticates a user with email and password credentials. The user must already have a registered account. For new users, use {@linkcode register | register()} first to create an account. On successful login, automatically sets the token for subsequent requests.
   *
   * @param email - User's email address.
   * @param password - User's password.
   * @param turnstileToken - Optional {@link https://developers.cloudflare.com/turnstile/ | Cloudflare Turnstile CAPTCHA token} for bot protection.
   * @returns Promise resolving to login response with access token and user data.
   * @throws Error if the email and password combination is invalid or the user is not registered.
   *
   * @example
   * ```typescript
   * try {
   *   const { access_token, user } = await base44.auth.loginViaEmailPassword(
   *     'user@example.com',
   *     'securePassword123'
   *   );
   *   console.log('Login successful!', user);
   * } catch (error) {
   *   console.error('Login failed:', error);
   * }
   * ```
   *
   * @example
   * ```typescript
   * // With captcha token
   * const response = await base44.auth.loginViaEmailPassword(
   *   'user@example.com',
   *   'securePassword123',
   *   'captcha-token-here'
   * );
   * ```
   */
  loginViaEmailPassword(
    email: string,
    password: string,
    turnstileToken?: string
  ): Promise<LoginResponse>;

  /**
   * Checks if the current user is authenticated.
   *
   * @returns Promise resolving to true if authenticated, false otherwise.
   *
   * @example
   * ```typescript
   * // Check authentication status
   * const isAuthenticated = await base44.auth.isAuthenticated();
   * if (isAuthenticated) {
   *   console.log('User is logged in');
   * } else {
   *   // Redirect to login page
   *   base44.auth.redirectToLogin(window.location.href);
   * }
   * ```
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Invites a user to the app.
   *
   * Sends an invitation email to a potential user with a specific role.
   * Roles are configured in the app settings and determine
   * the user's permissions and access levels.
   *
   * @param userEmail - Email address of the user to invite.
   * @param role - Role to assign to the invited user. Must match a role defined in the app. For example, `'admin'`, `'editor'`, `'viewer'`, or `'member'`.
   * @returns Promise that resolves when the invitation is sent successfully. Throws an error if the invitation fails.
   *
   * @example
   * ```typescript
   * try {
   *   await base44.auth.inviteUser('newuser@example.com', 'editor');
   *   console.log('Invitation sent successfully!');
   * } catch (error) {
   *   console.error('Failed to send invitation:', error);
   * }
   * ```
   */
  inviteUser(userEmail: string, role: string): Promise<any>;

  /**
   * Registers a new user account.
   *
   * Creates a new user account with email and password. After successful registration,
   * use {@linkcode loginViaEmailPassword | loginViaEmailPassword()} to log in the user.
   *
   * @param payload - Registration details including email, password, and optional fields.
   * @returns Promise resolving to the registration response.
   *
   * @example
   * ```typescript
   * // Register a new user
   * await base44.auth.register({
   *   email: 'newuser@example.com',
   *   password: 'securePassword123',
   *   referral_code: 'FRIEND2024'
   * });
   *
   * // Login after registration
   * const { access_token, user } = await base44.auth.loginViaEmailPassword(
   *   'newuser@example.com',
   *   'securePassword123'
   * );
   * ```
   */
  register(payload: RegisterPayload): Promise<any>;

  /**
   * Verifies an OTP (One-time password) code.
   *
   * Validates an OTP code sent to the user's email during registration
   * or authentication.
   *
   * @param params - Object containing email and OTP code.
   * @returns Promise resolving to the verification response if valid.
   * @throws Error if the OTP code is invalid, expired, or verification fails.
   *
   * @example
   * ```typescript
   * try {
   *   await base44.auth.verifyOtp({
   *     email: 'user@example.com',
   *     otpCode: '123456'
   *   });
   *   console.log('Email verified successfully!');
   * } catch (error) {
   *   console.error('Invalid or expired OTP code');
   * }
   * ```
   */
  verifyOtp(params: VerifyOtpParams): Promise<any>;

  /**
   * Resends an OTP code to the user's email address.
   *
   * Requests a new OTP code to be sent to the specified email address.
   *
   * @param email - Email address to send the OTP to.
   * @returns Promise resolving when the OTP is sent successfully.
   * @throws Error if the email is invalid or the request fails.
   *
   * @example
   * ```typescript
   * try {
   *   await base44.auth.resendOtp('user@example.com');
   *   console.log('OTP resent! Please check your email.');
   * } catch (error) {
   *   console.error('Failed to resend OTP:', error);
   * }
   * ```
   */
  resendOtp(email: string): Promise<any>;

  /**
   * Requests a password reset.
   *
   * Sends a password reset email to the specified email address.
   *
   * @param email - Email address for the account to reset.
   * @returns Promise resolving when the password reset email is sent successfully.
   * @throws Error if the email is invalid or the request fails.
   *
   * @example
   * ```typescript
   * try {
   *   await base44.auth.resetPasswordRequest('user@example.com');
   *   console.log('Password reset email sent!');
   * } catch (error) {
   *   console.error('Failed to send password reset email:', error);
   * }
   * ```
   */
  resetPasswordRequest(email: string): Promise<any>;

  /**
   * Resets password using a reset token.
   *
   * Completes the password reset flow by setting a new password
   * using the token received by email.
   *
   * @param params - Object containing the reset token and new password.
   * @returns Promise resolving when the password is reset successfully.
   * @throws Error if the reset token is invalid, expired, or the request fails.
   *
   * @example
   * ```typescript
   * try {
   *   await base44.auth.resetPassword({
   *     resetToken: 'token-from-email',
   *     newPassword: 'newSecurePassword456'
   *   });
   *   console.log('Password reset successful!');
   * } catch (error) {
   *   console.error('Failed to reset password:', error);
   * }
   * ```
   */
  resetPassword(params: ResetPasswordParams): Promise<any>;

  /**
   * Changes the user's password.
   *
   * Updates the password for an authenticated user by verifying
   * the current password and setting a new one.
   *
   * @param params - Object containing user ID, current password, and new password.
   * @returns Promise resolving when the password is changed successfully.
   * @throws Error if the current password is incorrect or the request fails.
   *
   * @example
   * ```typescript
   * try {
   *   await base44.auth.changePassword({
   *     userId: 'user-123',
   *     currentPassword: 'oldPassword123',
   *     newPassword: 'newSecurePassword456'
   *   });
   *   console.log('Password changed successfully!');
   * } catch (error) {
   *   console.error('Failed to change password:', error);
   * }
   * ```
   */
  changePassword(params: ChangePasswordParams): Promise<any>;
}
