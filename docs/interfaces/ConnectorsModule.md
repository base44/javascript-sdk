[**@base44/sdk**](../README.md)

***

# Interface: ConnectorsModule

Connectors module for managing OAuth tokens for external services.

This module allows you to retrieve OAuth access tokens for external services
that users have connected to your Base44 app. Use these tokens to make API
calls to external services on behalf of your users.

**Important:** This module is only available with service role authentication.

**Difference from SSO module:**
- **Connectors**: Retrieve OAuth tokens for external services (Google, Slack, etc.)
  to call their APIs on behalf of users
- **SSO**: Generate tokens to authenticate your Base44 users with external systems

## Example

```typescript
// Retrieve Google OAuth token for a user
const response = await client.asServiceRole.connectors.getAccessToken("google");
const googleToken = response.access_token;

// Use the token to call Google APIs
const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
  headers: { 'Authorization': `Bearer ${googleToken}` }
});
```

## Methods

### getAccessToken()

> **getAccessToken**(`integrationType`): `Promise`\<[`ConnectorAccessTokenResponse`](ConnectorAccessTokenResponse.md)\>

Retrieve an OAuth access token for a specific external integration type.

Returns the stored OAuth token for an external service that a user has
connected to your Base44 app. You can then use this token to make
authenticated API calls to that external service.

#### Parameters

##### integrationType

`string`

The type of integration (e.g., "google", "slack", "github")

#### Returns

`Promise`\<[`ConnectorAccessTokenResponse`](ConnectorAccessTokenResponse.md)\>

Promise resolving to the access token response

#### Throws

When integrationType is not provided or is not a string

#### Example

```typescript
// Get Google OAuth token
const response = await client.asServiceRole.connectors.getAccessToken("google");
console.log(response.access_token);

// Get Slack OAuth token
const slackResponse = await client.asServiceRole.connectors.getAccessToken("slack");
console.log(slackResponse.access_token);
```
