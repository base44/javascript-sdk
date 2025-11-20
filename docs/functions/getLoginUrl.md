[**@base44/sdk**](../README.md)

***

# Function: getLoginUrl()

> **getLoginUrl**(`nextUrl`, `options`): `string`

Constructs the absolute URL for the login page with a redirect parameter.

Low-level utility for building login URLs. For standard login redirects, use
`base44.auth.redirectToLogin()` instead, which handles this automatically. This function
is useful when you need to construct login URLs without a client instance or for custom
authentication flows.

## Parameters

### nextUrl

`string`

The URL to redirect to after successful login.

### options

[`GetLoginUrlOptions`](../interfaces/GetLoginUrlOptions.md)

Configuration options.

## Returns

`string`

The complete login URL with encoded redirect parameters.

## Example

```typescript
// Redirect to login page
const loginUrl = getLoginUrl('/dashboard', {
  serverUrl: 'https://base44.app',
  appId: 'my-app-123'
});
window.location.href = loginUrl;
// User will be redirected back to /dashboard after login
```
