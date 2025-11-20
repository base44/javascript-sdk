[**@base44/sdk**](../README.md)

***

# Function: saveAccessToken()

> **saveAccessToken**(`token`, `options`): `boolean`

Saves an access token to local storage.

Low-level utility for manually saving tokens. In most cases, the Base44 client handles token management automatically. This function is useful for custom authentication flows or managing custom tokens. Requires a browser environment and cannot be used in the backend.

## Parameters

### token

`string`

The access token string to save.

### options

[`SaveAccessTokenOptions`](../interfaces/SaveAccessTokenOptions.md)

Configuration options for saving the token.

## Returns

`boolean`

`true` if the token was saved successfully, `false` otherwise.

## Examples

```typescript
// Save access token after login
const response = await base44.auth.loginViaEmailPassword(email, password);
const success = saveAccessToken(response.access_token, {});

if (success) {
  console.log('User is now authenticated');
  // Token is now available for future page loads
}
```

```typescript
// Save access token to local storage using custom key
const success = saveAccessToken(token, {
  storageKey: `my_custom_token_key`
});
```
