[**@base44/sdk**](../README)

***

# Function: createClient()

> **createClient**(`config`): [`Base44Client`](../interfaces/Base44Client)

Creates a Base44 SDK client instance.

This is the main entry point for the Base44 SDK. It creates a client that provides access to the SDK's modules, such as [`entities`](../interfaces/entities), [`auth`](../interfaces/auth), and [`functions`](../interfaces/functions).

The client supports two authentication modes:
- **User authentication** (default): Access modules with user-level permissions using `base44.moduleName`.
- **Service role authentication**: Access modules with elevated permissions using `base44.asServiceRole.moduleName`.

For example, when using the [`entities`](../interfaces/entities) module with user authentication you'll only have access to the current user's data. With service role authentication, you'll have access to all data across the entire app.

Most modules are available in both modes, but with different permission levels. However, some modules are only available in one authentication mode.

To use the service role authentication mode, you need to provide a service role token when creating the client. This token should be kept secret and never exposed in the app's frontend.

## Parameters

### config

[`CreateClientConfig`](../interfaces/CreateClientConfig)

Configuration object for the client.

## Returns

[`Base44Client`](../interfaces/Base44Client)

A configured Base44 client instance with access to all SDK modules.

## Examples

```typescript
// Basic client setup
import { createClient } from '@base44/client-sdk';

const base44 = createClient({
  appId: 'my-app-id'
});

// Use client modules
const products = await base44.entities.Products.list();
const user = await base44.auth.me();
```

```typescript
// Client with service role access
const base44 = createClient({
  appId: 'my-app-id',
  token: 'user-token',
  serviceToken: 'service-role-token'
});

// Access service-role-only modules
const ssoToken = await base44.asServiceRole.sso.getAccessToken('user-123');
const oauthToken = await base44.asServiceRole.connectors.getAccessToken('google');
```

```typescript
// Client with error handling
const base44 = createClient({
  appId: 'my-app-id',
  options: {
    onError: (error) => {
      console.error('API Error:', error);
      Sentry.captureException(error);
    }
  }
});
```
