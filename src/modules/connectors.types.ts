/**
 * Registry of connector integration type names. The [`types generate`](/developers/references/cli/commands/types-generate) command fills this registry, then [`ConnectorIntegrationType`](#connectorintegrationtype) resolves to a union of the keys.
 */
export interface ConnectorIntegrationTypeRegistry {}

/**
 * Union of all connector integration type names from the [`ConnectorIntegrationTypeRegistry`](#connectorintegrationtyperegistry). Defaults to `string` when no types have been generated.
 *
 * @example
 * ```typescript
 * // Using generated connector type names
 * // With generated types, you get autocomplete on integration types
 * const connection = await base44.asServiceRole.connectors.getConnection('googlecalendar');
 * const token = connection.accessToken;
 * ```
 */
export type ConnectorIntegrationType =
  keyof ConnectorIntegrationTypeRegistry extends never
    ? string
    : keyof ConnectorIntegrationTypeRegistry;

/**
 * Response from the connectors access token endpoint.
 */
export interface ConnectorAccessTokenResponse {
  access_token: string;
  integration_type: string;
  connection_config: Record<string, string> | null;
}

/**
 * Connection details.
 */
export interface ConnectorConnectionResponse {
  /** The OAuth access token for the external service. */
  accessToken: string;
  /** Key-value configuration for the connection, or `null` if the connector does not provide one. */
  connectionConfig: Record<string, string> | null;
}

/**
 * Connectors module for managing OAuth tokens for external services.
 *
 * This module allows you to retrieve OAuth access tokens for external services that the app has connected to. Connectors are app-scoped. When an app builder connects an integration like Google Calendar, Slack, or GitHub, all users of the app share that same connection.
 *
 * Unlike the integrations module that provides pre-built functions, connectors give you
 * raw OAuth tokens so you can call external service APIs directly with full control over
 * the API calls you make. This is useful when you need custom API interactions that aren't
 * covered by Base44's pre-built integrations.
 *
 * ## Available connectors
 *
 * All connectors work through [`getConnection()`](#getconnection). Pass the integration type string and use the returned OAuth token to call the external service's API directly.
 *
 * | Service | Type identifier |
 * |---|---|
 * | Airtable | `airtable` |
 * | Box | `box` |
 * | ClickUp | `clickup` |
 * | Discord | `discord` |
 * | Dropbox | `dropbox` |
 * | GitHub | `github` |
 * | Gmail | `gmail` |
 * | Google Analytics | `google_analytics` |
 * | Google BigQuery | `googlebigquery` |
 * | Google Calendar | `googlecalendar` |
 * | Google Classroom | `google_classroom` |
 * | Google Docs | `googledocs` |
 * | Google Drive | `googledrive` |
 * | Google Search Console | `google_search_console` |
 * | Google Sheets | `googlesheets` |
 * | Google Slides | `googleslides` |
 * | HubSpot | `hubspot` |
 * | Linear | `linear` |
 * | LinkedIn | `linkedin` |
 * | Microsoft Teams | `microsoft_teams` |
 * | Notion | `notion` |
 * | Outlook | `outlook` |
 * | Salesforce | `salesforce` |
 * | SharePoint | `share_point` |
 * | Slack User | `slack` |
 * | Slack Bot | `slackbot` |
 * | Splitwise | `splitwise` |
 * | TikTok | `tiktok` |
 * | Wix | `wix` |
 * | Wrike | `wrike` |
 *
 * See the integration guides for more details:
 *
 * - **Scopes and permissions**: {@link https://docs.base44.com/Integrations/gmail-connector#gmail-scopes-and-permissions | Gmail}, {@link https://docs.base44.com/Integrations/linkedin-connector#linkedin-scopes-and-permissions | LinkedIn}, {@link https://docs.base44.com/Integrations/slack-connector#slack-scopes-and-permissions | Slack}, {@link https://docs.base44.com/Integrations/github-connector#github-scopes-and-permissions | GitHub}
 * - **Slack connector types**: {@link https://docs.base44.com/Integrations/slack-connector#about-the-slack-connectors | About the Slack connectors} explains the difference between `slack` and `slackbot`
 *
 * ## Authentication Modes
 *
 * This module is only available to use with a client in service role authentication mode, which means it can only be used in backend environments.
 *
 * ## Dynamic Types
 *
 * If you're working in a TypeScript project, you can generate types from your app's connector configurations to get autocomplete on integration type names when calling `getConnection()`. See the [Dynamic Types](/developers/references/sdk/getting-started/dynamic-types) guide to get started.
 */
export interface ConnectorsModule {
  /**
   * Retrieves an OAuth access token for a specific [external integration type](#available-connectors).
   *
   * @deprecated Use {@link getConnection} instead.
   *
   * Returns the OAuth token string for an external service that an app builder
   * has connected to. This token represents the connected app builder's account
   * and can be used to make authenticated API calls to that external service on behalf of the app.
   *
   * @param integrationType - The type of integration, such as `'googlecalendar'`, `'slack'`, `'slackbot'`, `'github'`, or `'discord'`. See [Available connectors](#available-connectors) for the full list.
   * @returns Promise resolving to the access token string.
   *
   * @example
   * ```typescript
   * // Google Calendar connection
   * // Get Google Calendar OAuth token and fetch upcoming events
   * const googleToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
   *
   * // Fetch upcoming 10 events
   * const timeMin = new Date().toISOString();
   * const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${timeMin}`;
   *
   * const calendarResponse = await fetch(url, {
   *   headers: { 'Authorization': `Bearer ${googleToken}` }
   * });
   *
   * const events = await calendarResponse.json();
   * ```
   *
   * @example
   * ```typescript
   * // Slack User connection
   * // Get Slack user token and list channels
   * const slackToken = await base44.asServiceRole.connectors.getAccessToken('slack');
   *
   * // List all public and private channels
   * const url = 'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100';
   *
   * const slackResponse = await fetch(url, {
   *   headers: { 'Authorization': `Bearer ${slackToken}` }
   * });
   *
   * const data = await slackResponse.json();
   * ```
   *
   * @example
   * ```typescript
   * // Slack Bot connection
   * // Get Slack bot token and post a message with a custom bot identity
   * const botToken = await base44.asServiceRole.connectors.getAccessToken('slackbot');
   *
   * const response = await fetch('https://slack.com/api/chat.postMessage', {
   *   method: 'POST',
   *   headers: {
   *     'Authorization': `Bearer ${botToken}`,
   *     'Content-Type': 'application/json'
   *   },
   *   body: JSON.stringify({
   *     channel: '#alerts',
   *     text: 'Deployment to production completed successfully.',
   *     username: 'Deploy Bot',
   *     icon_emoji: ':rocket:'
   *   })
   * });
   *
   * const result = await response.json();
   * ```
   */
  getAccessToken(integrationType: ConnectorIntegrationType): Promise<string>;

  /**
   * Retrieves the OAuth access token and connection configuration for a specific [external integration type](#available-connectors).
   *
   * Some connectors require connection-specific parameters to build API calls.
   * In such cases, the returned `connectionConfig` is an object with the additional parameters. If there are no extra parameters needed for the connection, the `connectionConfig` is `null`.
   *
   * For example, a service might need a subdomain to construct the API URL in
   * the form of `{subdomain}.example.com`. In such a case the subdomain will be available as a property of the `connectionConfig` object.
   *
   * @param integrationType - The type of integration, such as `'googlecalendar'`, `'slack'`, `'slackbot'`, `'github'`, or `'discord'`. See [Available connectors](#available-connectors) for the full list.
   * @returns Promise resolving to a {@link ConnectorConnectionResponse} with `accessToken` and `connectionConfig`.
   *
   * @example
   * ```typescript
   * // Google Calendar connection
   * // Get Google Calendar OAuth token and fetch upcoming events
   * const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
   *
   * const timeMin = new Date().toISOString();
   * const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${timeMin}`;
   *
   * const calendarResponse = await fetch(url, {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   *
   * const events = await calendarResponse.json();
   * ```
   *
   * @example
   * ```typescript
   * // Slack connection
   * // Get Slack OAuth token and list channels
   * const { accessToken } = await base44.asServiceRole.connectors.getConnection('slack');
   *
   * const url = 'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100';
   *
   * const slackResponse = await fetch(url, {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   *
   * const data = await slackResponse.json();
   * ```
   *
   * @example
   * ```typescript
   * // Using connectionConfig
   * // Some connectors return a subdomain or other params needed to build the API URL
   * const { accessToken, connectionConfig } = await base44.asServiceRole.connectors.getConnection('myservice');
   *
   * const subdomain = connectionConfig?.subdomain;
   * const response = await fetch(
   *   `https://${subdomain}.example.com/api/v1/resources`,
   *   { headers: { Authorization: `Bearer ${accessToken}` } }
   * );
   *
   * const data = await response.json();
   * ```
   */
  getConnection(
    integrationType: ConnectorIntegrationType,
  ): Promise<ConnectorConnectionResponse>;
}
