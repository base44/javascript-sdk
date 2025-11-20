[**@base44/sdk**](../README.md)

***

# Interface: AuthModule

Authentication module for managing user authentication and authorization. The module automatically stores tokens in local storage when available and manages authorization headers for API requests.

This module provides comprehensive authentication functionality including:
- Email/password login and registration
- Token management
- User profile access and updates
- Password reset flows
- OTP verification
- User invitations

## Examples

```typescript
// Login with email and password
const { access_token, user } = await base44.auth.loginViaEmailPassword(
  'user@example.com',
  'password123'
);
```

```typescript
// Check if user is authenticated
const isAuth = await base44.auth.isAuthenticated();
```

```typescript
// Get current user profile
const currentUser = await base44.auth.me();
```

```typescript
// Logout and reload page
base44.auth.logout();
```

```typescript
// Logout and redirect to login page
base44.auth.logout('/login');
```

## Methods

### me()

> **me**(): `Promise`\<[`User`](User.md)\>

Gets the current authenticated user's information.

#### Returns

`Promise`\<[`User`](User.md)\>

Promise resolving to the user's profile data.

#### Example

```typescript
const user = await base44.auth.me();
console.log(`Logged in as: ${user.email}`);
console.log(`User ID: ${user.id}`);
```

***

### updateMe()

> **updateMe**(`data`): `Promise`\<[`User`](User.md)\>

Updates the current authenticated user's information.

Performs a partial update - only include the fields you want to change.
Commonly updated fields include name, avatar_url, and custom profile fields.

#### Parameters

##### data

`Partial`\<`Omit`\<[`User`](User.md), ... \| ... \| ...\>\>

Object containing the fields to update. Only the provided fields will be changed.

#### Returns

`Promise`\<[`User`](User.md)\>

Promise resolving to the updated user data.

#### Examples

```typescript
// Update specific fields
const updatedUser = await base44.auth.updateMe({
  name: 'John Doe',
  avatar_url: 'https://example.com/avatar.jpg'
});
console.log(`Updated user: ${updatedUser.name}`);
```

```typescript
// Update custom fields defined in your User entity
await base44.auth.updateMe({
  bio: 'Software developer',
  phone: '+1234567890',
  preferences: { theme: 'dark' }
});
```

***

### redirectToLogin()

> **redirectToLogin**(`nextUrl`): `void`

Redirects the user to the app's login page.

Redirects with a callback URL to return to after successful authentication. Requires a browser environment and cannot be used in the backend.

#### Parameters

##### nextUrl

`string`

URL to redirect to after successful login.

#### Returns

`void`

#### Throws

When not in a browser environment.

#### Examples

```typescript
// Redirect to login and come back to current page
base44.auth.redirectToLogin(window.location.href);
```

```typescript
// Redirect to login and then go to the dashboard page
base44.auth.redirectToLogin('/dashboard');
```

***

### logout()

> **logout**(`redirectUrl?`): `void`

Logs out the current user.

Removes the authentication token from local storage and Axios headers, then optionally redirects to a URL or reloads the page. Requires a browser environment and cannot be used in the backend.

#### Parameters

##### redirectUrl?

`string`

Optional URL to redirect to after logout. Reloads the page if not provided.

#### Returns

`void`

#### Examples

```typescript
// Logout and reload page
base44.auth.logout();
```

```typescript
// Logout and redirect to login page
base44.auth.logout('/login');
```

```typescript
// Logout and redirect to home
base44.auth.logout('/');
```

***

### setToken()

> **setToken**(`token`, `saveToStorage?`): `void`

Sets the authentication token.

Updates the authorization header for API requests and optionally saves the token to local storage for persistence. Saving to local storage requires a browser environment and is automatically skipped in backend environments.

#### Parameters

##### token

`string`

JWT authentication token.

##### saveToStorage?

`boolean`

Whether to save the token to local storage. Defaults to true.

#### Returns

`void`

#### Examples

```typescript
// Set token and save to local storage
base44.auth.setToken('eyJhbGciOiJIUzI1NiIs...');
```

```typescript
// Set token without saving to local storage
base44.auth.setToken('eyJhbGciOiJIUzI1NiIs...', false);
```

***

### loginViaEmailPassword()

> **loginViaEmailPassword**(`email`, `password`, `turnstileToken?`): `Promise`\<[`LoginResponse`](LoginResponse.md)\>

Logs in a registered user using email and password.

Authenticates a user with email and password credentials. The user must already have a registered account. For new users, use [`register()`](#register) first to create an account. On successful login, automatically sets the token for subsequent requests.

#### Parameters

##### email

`string`

User's email address.

##### password

`string`

User's password.

##### turnstileToken?

`string`

Optional [Cloudflare Turnstile CAPTCHA token](https://developers.cloudflare.com/turnstile/) for bot protection.

#### Returns

`Promise`\<[`LoginResponse`](LoginResponse.md)\>

Promise resolving to login response with access token and user data.

#### Throws

Error if the email and password combination is invalid or the user is not registered.

#### Examples

```typescript
try {
  const { access_token, user } = await base44.auth.loginViaEmailPassword(
    'user@example.com',
    'securePassword123'
  );
  console.log('Login successful!', user);
} catch (error) {
  console.error('Login failed:', error);
}
```

```typescript
// With captcha token
const response = await base44.auth.loginViaEmailPassword(
  'user@example.com',
  'securePassword123',
  'captcha-token-here'
);
```

***

### isAuthenticated()

> **isAuthenticated**(): `Promise`\<`boolean`\>

Checks if the current user is authenticated.

#### Returns

`Promise`\<`boolean`\>

Promise resolving to true if authenticated, false otherwise.

#### Example

```typescript
const isAuthenticated = await base44.auth.isAuthenticated();
if (isAuthenticated) {
  console.log('User is logged in');
} else {
  // Redirect to login page
  base44.auth.redirectToLogin(window.location.href);
}
```

***

### inviteUser()

> **inviteUser**(`userEmail`, `role`): `Promise`\<`any`\>

Invites a user to the application.

Sends an invitation email to a potential user with a specific role.
Roles are configured in your Base44 application settings and determine
the user's permissions and access levels.

#### Parameters

##### userEmail

`string`

Email address of the user to invite.

##### role

`string`

Role to assign to the invited user. Must match a role defined in your Base44 application. For example, `'admin'`, `'editor'`, `'viewer'`, or `'member'`.

#### Returns

`Promise`\<`any`\>

Promise that resolves when the invitation is sent successfully. Throws an error if the invitation fails.

#### Example

```typescript
try {
  await base44.auth.inviteUser('newuser@example.com', 'editor');
  console.log('Invitation sent successfully!');
} catch (error) {
  console.error('Failed to send invitation:', error);
}
```

***

### register()

> **register**(`payload`): `Promise`\<`any`\>

Registers a new user account.

Creates a new user account with email and password.

#### Parameters

##### payload

[`RegisterPayload`](RegisterPayload.md)

Registration details including email, password, and optional fields.

#### Returns

`Promise`\<`any`\>

Promise resolving to the registration response.

#### Example

```typescript
await base44.auth.register({
  email: 'newuser@example.com',
  password: 'securePassword123',
  referral_code: 'FRIEND2024'
});
console.log('Registration successful! Please check your email.');
```

***

### verifyOtp()

> **verifyOtp**(`params`): `Promise`\<`any`\>

Verifies an OTP (One-time password) code.

Validates an OTP code sent to the user's email during registration
or authentication.

#### Parameters

##### params

[`VerifyOtpParams`](VerifyOtpParams.md)

Object containing email and OTP code.

#### Returns

`Promise`\<`any`\>

Promise resolving to the verification response if valid.

#### Throws

Error if the OTP code is invalid, expired, or verification fails.

#### Example

```typescript
try {
  await base44.auth.verifyOtp({
    email: 'user@example.com',
    otpCode: '123456'
  });
  console.log('Email verified successfully!');
} catch (error) {
  console.error('Invalid or expired OTP code');
}
```

***

### resendOtp()

> **resendOtp**(`email`): `Promise`\<`any`\>

Resends an OTP code to the user's email address.

Requests a new OTP code to be sent to the specified email address.

#### Parameters

##### email

`string`

Email address to send the OTP to.

#### Returns

`Promise`\<`any`\>

Promise resolving when the OTP is sent successfully.

#### Throws

Error if the email is invalid or the request fails.

#### Example

```typescript
try {
  await base44.auth.resendOtp('user@example.com');
  console.log('OTP resent! Please check your email.');
} catch (error) {
  console.error('Failed to resend OTP:', error);
}
```

***

### resetPasswordRequest()

> **resetPasswordRequest**(`email`): `Promise`\<`any`\>

Requests a password reset.

Sends a password reset email to the specified email address.

#### Parameters

##### email

`string`

Email address for the account to reset.

#### Returns

`Promise`\<`any`\>

Promise resolving when the password reset email is sent successfully.

#### Throws

Error if the email is invalid or the request fails.

#### Example

```typescript
try {
  await base44.auth.resetPasswordRequest('user@example.com');
  console.log('Password reset email sent!');
} catch (error) {
  console.error('Failed to send password reset email:', error);
}
```

***

### resetPassword()

> **resetPassword**(`params`): `Promise`\<`any`\>

Resets password using a reset token.

Completes the password reset flow by setting a new password
using the token received by email.

#### Parameters

##### params

[`ResetPasswordParams`](ResetPasswordParams.md)

Object containing the reset token and new password.

#### Returns

`Promise`\<`any`\>

Promise resolving when the password is reset successfully.

#### Throws

Error if the reset token is invalid, expired, or the request fails.

#### Example

```typescript
try {
  await base44.auth.resetPassword({
    resetToken: 'token-from-email',
    newPassword: 'newSecurePassword456'
  });
  console.log('Password reset successful!');
} catch (error) {
  console.error('Failed to reset password:', error);
}
```

***

### changePassword()

> **changePassword**(`params`): `Promise`\<`any`\>

Changes the user's password.

Updates the password for an authenticated user by verifying
the current password and setting a new one.

#### Parameters

##### params

[`ChangePasswordParams`](ChangePasswordParams.md)

Object containing user ID, current password, and new password.

#### Returns

`Promise`\<`any`\>

Promise resolving when the password is changed successfully.

#### Throws

Error if the current password is incorrect or the request fails.

#### Example

```typescript
try {
  await base44.auth.changePassword({
    userId: 'user-123',
    currentPassword: 'oldPassword123',
    newPassword: 'newSecurePassword456'
  });
  console.log('Password changed successfully!');
} catch (error) {
  console.error('Failed to change password:', error);
}
```
