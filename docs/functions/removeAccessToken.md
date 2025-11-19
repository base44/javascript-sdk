[**@base44/sdk**](../README.md)

***

# Function: removeAccessToken()

> **removeAccessToken**(`options`): `boolean`

Removes the access token from local storage.

Low-level utility for manually removing tokens from the browser's local storage. In most cases, the Base44 client handles token management automatically. For standard logout flows, use [`client.auth.logout()`](../interfaces/AuthModule.md#logout) instead, which handles token removal and redirects automatically. This function is useful for custom authentication flows or when you need to manually remove tokens. Requires a browser environment and cannot be used in the backend.

## Parameters

### options

[`RemoveAccessTokenOptions`](../interfaces/RemoveAccessTokenOptions.md)

Configuration options for token removal.

## Returns

`boolean`

`true` if the token was removed successfully, `false` otherwise.

## Examples

```typescript
// Remove custom token key
const success = removeAccessToken({
  storageKey: 'my_custom_token_key'
});
```

```typescript
// Standard logout flow with token removal and redirect
client.auth.logout('/login');
```
