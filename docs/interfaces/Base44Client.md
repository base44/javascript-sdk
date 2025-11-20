[**@base44/sdk**](../README.md)

***

# Interface: Base44Client

The Base44 client instance.

Provides access to all SDK modules and methods for interacting with your Base44 app.

This is the main client object returned by [createClient](../functions/createClient.md) and [createClientFromRequest](../functions/createClientFromRequest.md).
It includes all SDK modules and utility methods for managing authentication and configuration.

## Properties

### entities

> **entities**: [`EntitiesModule`](EntitiesModule.md)

[Entities module](EntitiesModule.md) for CRUD operations on your data models.

***

### integrations

> **integrations**: [`IntegrationsModule`](IntegrationsModule.md)

[Integrations module](IntegrationsModule.md) for calling pre-built integration endpoints.

***

### auth

> **auth**: [`AuthModule`](AuthModule.md)

[Auth module](AuthModule.md) for user authentication and management.

***

### functions

> **functions**: [`FunctionsModule`](FunctionsModule.md)

[Functions module](FunctionsModule.md) for invoking custom backend functions.

***

### agents

> **agents**: [`AgentsModule`](AgentsModule.md)

[Agents module](AgentsModule.md) for managing AI agent conversations.

***

### appLogs

> **appLogs**: [`AppLogsModule`](AppLogsModule.md)

[App logs module](AppLogsModule.md) for tracking application usage.

***

### cleanup()

> **cleanup**: () => `void`

Cleanup function to disconnect WebSocket connections. Call when you're done with the client.

#### Returns

`void`

***

### asServiceRole

> `readonly` **asServiceRole**: `object`

Provides access to service role modules with elevated permissions.

Service role authentication provides elevated permissions for server-side operations.
Unlike user authentication, which is scoped to a specific user's permissions, service
role authentication has access to data and operations across all users.

#### entities

> **entities**: [`EntitiesModule`](EntitiesModule.md)

[Entities module](EntitiesModule.md) with elevated permissions.

#### integrations

> **integrations**: [`IntegrationsModule`](IntegrationsModule.md)

[Integrations module](IntegrationsModule.md) with elevated permissions.

#### sso

> **sso**: [`SsoModule`](SsoModule.md)

[SSO module](SsoModule.md) for generating SSO tokens (service role only).

#### connectors

> **connectors**: [`ConnectorsModule`](ConnectorsModule.md)

[Connectors module](ConnectorsModule.md) for OAuth token retrieval (service role only).

#### functions

> **functions**: [`FunctionsModule`](FunctionsModule.md)

[Functions module](FunctionsModule.md) with elevated permissions.

#### agents

> **agents**: [`AgentsModule`](AgentsModule.md)

[Agents module](AgentsModule.md) with elevated permissions.

#### appLogs

> **appLogs**: [`AppLogsModule`](AppLogsModule.md)

[App logs module](AppLogsModule.md) with elevated permissions.

#### cleanup()

> **cleanup**: () => `void`

Cleanup function to disconnect WebSocket connections.

##### Returns

`void`

#### Throws

When accessed without providing a serviceToken during client creation

## Methods

### setToken()

> **setToken**(`newToken`): `void`

Sets a new authentication token for all subsequent requests.

Updates the token for both HTTP requests and WebSocket connections.

#### Parameters

##### newToken

`string`

The new authentication token

#### Returns

`void`
