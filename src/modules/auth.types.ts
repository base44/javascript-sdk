import { AxiosInstance } from "axios";

/**
 * Response from login endpoints containing user information and access token.
 */
export interface LoginResponse {
  /** JWT access token for authentication */
  access_token: string;
  /** User information */
  user: any;
}

/**
 * Payload for user registration.
 */
export interface RegisterPayload {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
  /** Optional Turnstile captcha token */
  turnstile_token?: string | null;
  /** Optional referral code */
  referral_code?: string | null;
}

/**
 * Configuration options for the auth module.
 */
export interface AuthModuleOptions {
  /** Server URL for API requests */
  serverUrl: string;
  /** Optional base URL for the app (used for login redirects) */
  appBaseUrl?: string;
}

/**
 * Authentication module for managing user authentication and authorization.
 *
 * This module provides comprehensive authentication functionality including:
 * - Email/password login and registration
 * - Token management
 * - User profile access and updates
 * - Password reset flows
 * - OTP verification
 * - User invitations
 *
 * **Browser-Only Features:**
 * Some methods like `redirectToLogin()` and `logout()` only work in browser
 * environments as they interact with localStorage and window.location.
 *
 * **Token Storage:**
 * The module automatically stores tokens in localStorage (when available) and
 * manages Authorization headers for API requests.
 *
 * @example
 * ```typescript
 * // Login with email and password
 * const { access_token, user } = await client.auth.loginViaEmailPassword(
 *   'user@example.com',
 *   'password123'
 * );
 *
 * // Check if user is authenticated
 * const isAuth = await client.auth.isAuthenticated();
 *
 * // Get current user profile
 * const currentUser = await client.auth.me();
 *
 * // Logout
 * client.auth.logout();
 * ```
 */
export interface AuthModule {
  /**
   * Get the current authenticated user's information.
   *
   * Retrieves the profile data for the currently authenticated user.
   *
   * @returns Promise resolving to the user's profile data
   *
   * @example
   * ```typescript
   * const user = await client.auth.me();
   * console.log(`Logged in as: ${user.email}`);
   * console.log(`User ID: ${user.id}`);
   * ```
   */
  me(): Promise<any>;

  /**
   * Update the current authenticated user's information.
   *
   * Updates profile fields for the currently authenticated user.
   *
   * @param data - Object containing the fields to update
   * @returns Promise resolving to the updated user data
   *
   * @example
   * ```typescript
   * const updatedUser = await client.auth.updateMe({
   *   name: 'John Doe',
   *   bio: 'Software developer'
   * });
   * ```
   */
  updateMe(data: Record<string, any>): Promise<any>;

  /**
   * Redirect the user to the app's login page.
   *
   * **Browser only:** This method only works in browser environments.
   *
   * Redirects the user to your app's login page with a callback URL
   * to return to after successful authentication.
   *
   * @param nextUrl - URL to redirect to after successful login
   * @throws {Error} When not in a browser environment
   *
   * @example
   * ```typescript
   * // Redirect to login and come back to current page
   * client.auth.redirectToLogin(window.location.href);
   *
   * // Redirect to login and go to dashboard after
   * client.auth.redirectToLogin('/dashboard');
   * ```
   */
  redirectToLogin(nextUrl: string): void;

  /**
   * Logout the current user.
   *
   * **Browser only:** Full functionality requires browser environment.
   *
   * Removes the authentication token from localStorage and axios headers,
   * then optionally redirects to a URL or reloads the page.
   *
   * @param redirectUrl - Optional URL to redirect to after logout. Reloads the page if not provided
   *
   * @example
   * ```typescript
   * // Logout and reload page
   * client.auth.logout();
   *
   * // Logout and redirect to login page
   * client.auth.logout('/login');
   *
   * // Logout and redirect to home
   * client.auth.logout('/');
   * ```
   */
  logout(redirectUrl?: string): void;

  /**
   * Set the authentication token.
   *
   * Updates the Authorization header for API requests and optionally
   * saves the token to localStorage for persistence.
   *
   * @param token - JWT authentication token
   * @param saveToStorage - Whether to save the token to localStorage (default: true)
   *
   * @example
   * ```typescript
   * // Set token and save to localStorage
   * client.auth.setToken('eyJhbGciOiJIUzI1NiIs...');
   *
   * // Set token without saving to localStorage
   * client.auth.setToken('eyJhbGciOiJIUzI1NiIs...', false);
   * ```
   */
  setToken(token: string, saveToStorage?: boolean): void;

  /**
   * Login using email and password.
   *
   * Authenticates a user with email and password credentials. On success,
   * automatically sets the token for subsequent requests.
   *
   * @param email - User's email address
   * @param password - User's password
   * @param turnstileToken - Optional Turnstile captcha token
   * @returns Promise resolving to login response with access token and user data
   *
   * @example
   * ```typescript
   * try {
   *   const { access_token, user } = await client.auth.loginViaEmailPassword(
   *     'user@example.com',
   *     'securePassword123'
   *   );
   *   console.log('Login successful!', user);
   * } catch (error) {
   *   console.error('Login failed:', error);
   * }
   *
   * // With captcha token
   * const response = await client.auth.loginViaEmailPassword(
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
   * Check if the current user is authenticated.
   *
   * Verifies whether the current token is valid by attempting to
   * fetch the user's profile.
   *
   * @returns Promise resolving to true if authenticated, false otherwise
   *
   * @example
   * ```typescript
   * const isAuth = await client.auth.isAuthenticated();
   * if (isAuth) {
   *   console.log('User is logged in');
   * } else {
   *   // Redirect to login
   *   client.auth.redirectToLogin(window.location.href);
   * }
   * ```
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Invite a user to the application.
   *
   * Sends an invitation email to a user with a specific role.
   *
   * @param userEmail - Email address of the user to invite
   * @param role - Role to assign to the invited user
   * @returns Promise resolving to the invitation response
   *
   * @example
   * ```typescript
   * await client.auth.inviteUser('newuser@example.com', 'editor');
   * console.log('Invitation sent!');
   * ```
   */
  inviteUser(userEmail: string, role: string): Promise<any>;

  /**
   * Register a new user account.
   *
   * Creates a new user account with email and password.
   *
   * @param payload - Registration details including email, password, and optional fields
   * @returns Promise resolving to the registration response
   *
   * @example
   * ```typescript
   * await client.auth.register({
   *   email: 'newuser@example.com',
   *   password: 'securePassword123',
   *   referral_code: 'FRIEND2024'
   * });
   * console.log('Registration successful! Please check your email.');
   * ```
   */
  register(payload: RegisterPayload): Promise<any>;

  /**
   * Verify an OTP (One-Time Password) code.
   *
   * Validates an OTP code sent to the user's email during registration
   * or authentication.
   *
   * @param params - Object containing email and OTP code
   * @returns Promise resolving to the verification response
   *
   * @example
   * ```typescript
   * await client.auth.verifyOtp({
   *   email: 'user@example.com',
   *   otpCode: '123456'
   * });
   * console.log('Email verified!');
   * ```
   */
  verifyOtp(params: { email: string; otpCode: string }): Promise<any>;

  /**
   * Resend an OTP code to the user's email.
   *
   * Requests a new OTP code to be sent to the specified email address.
   *
   * @param email - Email address to send the OTP to
   * @returns Promise resolving to the response
   *
   * @example
   * ```typescript
   * await client.auth.resendOtp('user@example.com');
   * console.log('OTP resent! Please check your email.');
   * ```
   */
  resendOtp(email: string): Promise<any>;

  /**
   * Request a password reset.
   *
   * Sends a password reset email to the specified email address.
   *
   * @param email - Email address for the account to reset
   * @returns Promise resolving to the response
   *
   * @example
   * ```typescript
   * await client.auth.resetPasswordRequest('user@example.com');
   * console.log('Password reset email sent!');
   * ```
   */
  resetPasswordRequest(email: string): Promise<any>;

  /**
   * Reset password using a reset token.
   *
   * Completes the password reset flow by setting a new password
   * using the token received by email.
   *
   * @param params - Object containing the reset token and new password
   * @returns Promise resolving to the response
   *
   * @example
   * ```typescript
   * await client.auth.resetPassword({
   *   resetToken: 'token-from-email',
   *   newPassword: 'newSecurePassword456'
   * });
   * console.log('Password reset successful!');
   * ```
   */
  resetPassword(params: {
    resetToken: string;
    newPassword: string;
  }): Promise<any>;

  /**
   * Change the user's password.
   *
   * Updates the password for an authenticated user by verifying
   * the current password and setting a new one.
   *
   * @param params - Object containing user ID, current password, and new password
   * @returns Promise resolving to the response
   *
   * @example
   * ```typescript
   * await client.auth.changePassword({
   *   userId: 'user-123',
   *   currentPassword: 'oldPassword123',
   *   newPassword: 'newSecurePassword456'
   * });
   * console.log('Password changed successfully!');
   * ```
   */
  changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<any>;
}
