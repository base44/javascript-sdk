[**@base44/sdk**](../README.md)

***

# Interface: GetLoginUrlOptions

Configuration options for constructing a login URL.

## Example

```typescript
const loginUrl = getLoginUrl('/dashboard', {
  serverUrl: 'https://base44.app',
  appId: 'my-app-123'
});
// Returns: 'https://base44.app/login?from_url=%2Fdashboard&app_id=my-app-123'

// Custom login path
const loginUrl = getLoginUrl('/dashboard', {
  serverUrl: 'https://base44.app',
  appId: 'my-app-123',
  loginPath: '/auth/login'
});
```

## Properties

### serverUrl

> **serverUrl**: `string`

The base server URL (e.g., 'https://base44.app').

***

### appId

> **appId**: `string`

The app ID.

***

### loginPath?

> `optional` **loginPath**: `string`

The path to the login endpoint.

#### Default

```ts
'/login'
```
