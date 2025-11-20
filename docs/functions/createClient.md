[**@base44/sdk**](../README.md)

***

# Function: createClient()

> **createClient**(`config`): [`Base44Client`](../interfaces/Base44Client.md)

Creates a Base44 SDK client instance.

This is the main entry point for the Base44 SDK. It creates a client that provides access to the SDK's modules, such as [entities](../interfaces/EntitiesModule.md), [auth](../interfaces/AuthModule.md), and [functions](../interfaces/FunctionsModule.md).

The client supports two authentication modes:
- **User authentication** (default): Access modules with user-level permissions using `base44.moduleName`.
- **Service role authentication**: Access modules with elevated permissions using `base44.asServiceRole.moduleName`.

Most modules are available in both modes, but with different permission levels. Some modules are only available with service role authentication.

For example, when using the [entities](../interfaces/EntitiesModule.md) module with user authentication you'll only get data accessible to the current user. With service role authentication, you'll get all data accessible to all users across the entire application.

To use the service role authentication mode, you need to provide a service role token when creating the client. This token should be kept secret and never exposed in your application's frontend.

<Info> The [auth](../interfaces/AuthModule.md) module is only available with user authentication for security reasons.</Info>

## Parameters

### config

[`CreateClientConfig`](../type-aliases/CreateClientConfig.md)

Configuration object for the client.

## Returns

[`Base44Client`](../interfaces/Base44Client.md)

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
