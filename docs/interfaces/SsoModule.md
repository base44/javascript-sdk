[**@base44/sdk**](../README.md)

***

# Interface: SsoModule

SSO (Single Sign-On) module for managing SSO authentication.

This module provides methods for retrieving SSO access tokens for users.
These tokens allow you to authenticate Base44 users with external
systems or services.

This module is only available to use with a client in service role authentication mode, which means it can only be used in backend environments.

## Example

```typescript
// Access SSO module with service role
const response = await base44.asServiceRole.sso.getAccessToken('user_123');
console.log(response.data.access_token);
```

## Methods

### getAccessToken()

> **getAccessToken**(`userid`): `Promise`\<[`SsoAccessTokenResponse`](SsoAccessTokenResponse.md)\>

Gets SSO access token for a specific user.

Retrieves a Single Sign-On access token that can be used to authenticate
a user with external services or systems.

#### Parameters

##### userid

`string`

The user ID to get the access token for.

#### Returns

`Promise`\<[`SsoAccessTokenResponse`](SsoAccessTokenResponse.md)\>

Promise resolving to the SSO access token response.

#### Example

```typescript
// Get SSO access token for a user
const response = await base44.asServiceRole.sso.getAccessToken('user_123');
console.log(response.access_token);
```
