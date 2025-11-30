[**@base44/sdk**](../README)

***

# Function: getAccessToken()

> **getAccessToken**(`options`): `string` \| `null`

Retrieves an access token from URL parameters or local storage.

Low-level utility for manually retrieving tokens. In most cases, the Base44 client handles
token management automatically. This function is useful for custom authentication flows or when you need direct access to stored tokens. Requires a browser environment and cannot be used in the backend.

## Parameters

### options

[`GetAccessTokenOptions`](../interfaces/GetAccessTokenOptions) = `{}`

Configuration options for token retrieval.

## Returns

`string` \| `null`

The access token string if found, null otherwise.

## Examples

```typescript
// Get access token from URL or local storage
const token = getAccessToken();

if (token) {
  console.log('User is authenticated');
} else {
  console.log('No token found, redirect to login');
}
```

```typescript
// Get access token from custom local storage key
const token = getAccessToken({ storageKey: 'my_app_token' });
```

```typescript
// Get access token from URL but don't save or remove it
const token = getAccessToken({
  saveToStorage: false,
  removeFromUrl: false
});
```
