[**@base44/sdk**](../README.md)

***

# Interface: AuthModule

Authentication module for managing user authentication and authorization.

This module provides comprehensive authentication functionality including:
- Email/password login and registration
- Token management
- User profile access and updates
- Password reset flows
- OTP verification
- User invitations

**Browser-Only Features:**
Some methods like `redirectToLogin()` and `logout()` only work in browser
environments as they interact with localStorage and window.location.

**Token Storage:**
The module automatically stores tokens in localStorage (when available) and
manages Authorization headers for API requests.

## Example

```typescript
// Login with email and password
const { access_token, user } = await client.auth.loginViaEmailPassword(
  'user@example.com',
  'password123'
);

// Check if user is authenticated
const isAuth = await client.auth.isAuthenticated();

// Get current user profile
const currentUser = await client.auth.me();

// Logout
client.auth.logout();
```

## Methods

### me()

> **me**(): `Promise`\<`any`\>

Get the current authenticated user's information.

Retrieves the profile data for the currently authenticated user.

#### Returns

`Promise`\<`any`\>

Promise resolving to the user's profile data

#### Example

```typescript
const user = await client.auth.me();
console.log(`Logged in as: ${user.email}`);
console.log(`User ID: ${user.id}`);
```

***

### updateMe()

> **updateMe**(`data`): `Promise`\<`any`\>

Update the current authenticated user's information.

Updates profile fields for the currently authenticated user.

#### Parameters

##### data

`Record`\<`string`, `any`\>

Object containing the fields to update

#### Returns

`Promise`\<`any`\>

Promise resolving to the updated user data

#### Example

```typescript
const updatedUser = await client.auth.updateMe({
  name: 'John Doe',
  bio: 'Software developer'
});
```

***

### redirectToLogin()

> **redirectToLogin**(`nextUrl`): `void`

Redirect the user to the app's login page.

**Browser only:** This method only works in browser environments.

Redirects the user to your app's login page with a callback URL
to return to after successful authentication.

#### Parameters

##### nextUrl

`string`

URL to redirect to after successful login

#### Returns

`void`

#### Throws

When not in a browser environment

#### Example

```typescript
// Redirect to login and come back to current page
client.auth.redirectToLogin(window.location.href);

// Redirect to login and go to dashboard after
client.auth.redirectToLogin('/dashboard');
```

***

### logout()

> **logout**(`redirectUrl?`): `void`

Logout the current user.

**Browser only:** Full functionality requires browser environment.

Removes the authentication token from localStorage and axios headers,
then optionally redirects to a URL or reloads the page.

#### Parameters

##### redirectUrl?

`string`

Optional URL to redirect to after logout. Reloads the page if not provided

#### Returns

`void`

#### Example

```typescript
// Logout and reload page
client.auth.logout();

// Logout and redirect to login page
client.auth.logout('/login');

// Logout and redirect to home
client.auth.logout('/');
```

***

### setToken()

> **setToken**(`token`, `saveToStorage?`): `void`

Set the authentication token.

Updates the Authorization header for API requests and optionally
saves the token to localStorage for persistence.

#### Parameters

##### token

`string`

JWT authentication token

##### saveToStorage?

`boolean`

Whether to save the token to localStorage (default: true)

#### Returns

`void`

#### Example

```typescript
// Set token and save to localStorage
client.auth.setToken('eyJhbGciOiJIUzI1NiIs...');

// Set token without saving to localStorage
client.auth.setToken('eyJhbGciOiJIUzI1NiIs...', false);
```

***

### loginViaEmailPassword()

> **loginViaEmailPassword**(`email`, `password`, `turnstileToken?`): `Promise`\<[`LoginResponse`](LoginResponse.md)\>

Login using email and password.

Authenticates a user with email and password credentials. On success,
automatically sets the token for subsequent requests.

#### Parameters

##### email

`string`

User's email address

##### password

`string`

User's password

##### turnstileToken?

`string`

Optional Turnstile captcha token

#### Returns

`Promise`\<[`LoginResponse`](LoginResponse.md)\>

Promise resolving to login response with access token and user data

#### Example

```typescript
try {
  const { access_token, user } = await client.auth.loginViaEmailPassword(
    'user@example.com',
    'securePassword123'
  );
  console.log('Login successful!', user);
} catch (error) {
  console.error('Login failed:', error);
}

// With captcha token
const response = await client.auth.loginViaEmailPassword(
  'user@example.com',
  'securePassword123',
  'captcha-token-here'
);
```

***

### isAuthenticated()

> **isAuthenticated**(): `Promise`\<`boolean`\>

Check if the current user is authenticated.

Verifies whether the current token is valid by attempting to
fetch the user's profile.

#### Returns

`Promise`\<`boolean`\>

Promise resolving to true if authenticated, false otherwise

#### Example

```typescript
const isAuth = await client.auth.isAuthenticated();
if (isAuth) {
  console.log('User is logged in');
} else {
  // Redirect to login
  client.auth.redirectToLogin(window.location.href);
}
```

***

### inviteUser()

> **inviteUser**(`userEmail`, `role`): `Promise`\<`any`\>

Invite a user to the application.

Sends an invitation email to a user with a specific role.

#### Parameters

##### userEmail

`string`

Email address of the user to invite

##### role

`string`

Role to assign to the invited user

#### Returns

`Promise`\<`any`\>

Promise resolving to the invitation response

#### Example

```typescript
await client.auth.inviteUser('newuser@example.com', 'editor');
console.log('Invitation sent!');
```

***

### register()

> **register**(`payload`): `Promise`\<`any`\>

Register a new user account.

Creates a new user account with email and password.

#### Parameters

##### payload

[`RegisterPayload`](RegisterPayload.md)

Registration details including email, password, and optional fields

#### Returns

`Promise`\<`any`\>

Promise resolving to the registration response

#### Example

```typescript
await client.auth.register({
  email: 'newuser@example.com',
  password: 'securePassword123',
  referral_code: 'FRIEND2024'
});
console.log('Registration successful! Please check your email.');
```

***

### verifyOtp()

> **verifyOtp**(`params`): `Promise`\<`any`\>

Verify an OTP (One-Time Password) code.

Validates an OTP code sent to the user's email during registration
or authentication.

#### Parameters

##### params

Object containing email and OTP code

###### email

`string`

###### otpCode

`string`

#### Returns

`Promise`\<`any`\>

Promise resolving to the verification response

#### Example

```typescript
await client.auth.verifyOtp({
  email: 'user@example.com',
  otpCode: '123456'
});
console.log('Email verified!');
```

***

### resendOtp()

> **resendOtp**(`email`): `Promise`\<`any`\>

Resend an OTP code to the user's email.

Requests a new OTP code to be sent to the specified email address.

#### Parameters

##### email

`string`

Email address to send the OTP to

#### Returns

`Promise`\<`any`\>

Promise resolving to the response

#### Example

```typescript
await client.auth.resendOtp('user@example.com');
console.log('OTP resent! Please check your email.');
```

***

### resetPasswordRequest()

> **resetPasswordRequest**(`email`): `Promise`\<`any`\>

Request a password reset.

Sends a password reset email to the specified email address.

#### Parameters

##### email

`string`

Email address for the account to reset

#### Returns

`Promise`\<`any`\>

Promise resolving to the response

#### Example

```typescript
await client.auth.resetPasswordRequest('user@example.com');
console.log('Password reset email sent!');
```

***

### resetPassword()

> **resetPassword**(`params`): `Promise`\<`any`\>

Reset password using a reset token.

Completes the password reset flow by setting a new password
using the token received by email.

#### Parameters

##### params

Object containing the reset token and new password

###### resetToken

`string`

###### newPassword

`string`

#### Returns

`Promise`\<`any`\>

Promise resolving to the response

#### Example

```typescript
await client.auth.resetPassword({
  resetToken: 'token-from-email',
  newPassword: 'newSecurePassword456'
});
console.log('Password reset successful!');
```

***

### changePassword()

> **changePassword**(`params`): `Promise`\<`any`\>

Change the user's password.

Updates the password for an authenticated user by verifying
the current password and setting a new one.

#### Parameters

##### params

Object containing user ID, current password, and new password

###### userId

`string`

###### currentPassword

`string`

###### newPassword

`string`

#### Returns

`Promise`\<`any`\>

Promise resolving to the response

#### Example

```typescript
await client.auth.changePassword({
  userId: 'user-123',
  currentPassword: 'oldPassword123',
  newPassword: 'newSecurePassword456'
});
console.log('Password changed successfully!');
```
