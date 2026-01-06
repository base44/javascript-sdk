/**
 * The type of external integration/connector, such as `'googlecalendar'`, `'slack'`, or `'github'`.
 */
export type ConnectorIntegrationType = string;

/**
 * Response from the connectors access token endpoint.
 */
export interface ConnectorAccessTokenResponse {
  access_token: string;
}

/**
 * Connectors module for managing OAuth tokens for external services.
 *
 * This module allows you to retrieve OAuth access tokens for external services that the app has connected to. Connectors are app-scoped. When an app builder connects an integration like Google Calendar or Slack, all users of the app share that same connection.
 *
 * Unlike the integrations module that provides pre-built functions, connectors give you
 * raw OAuth tokens so you can call external service APIs directly with full control over
 * the API calls you make. This is useful when you need custom API interactions that aren't
 * covered by Base44's pre-built integrations.
 *
 * This module is only available to use with a client in service role authentication mode, which means it can only be used in backend environments.
 */
export interface ConnectorsModule {
  /**
   * Retrieves an OAuth access token for a specific external integration type.
   *
   * Returns the OAuth token string for an external service that an app builder
   * has connected to. This token represents the connected app builder's account
   * and can be used to make authenticated API calls to that external service on behalf of the app.
   *
   * @param integrationType - The type of integration, such as `'googlecalendar'`, `'slack'`, or `'github'`.
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
   * // Slack connection
   * // Get Slack OAuth token and list channels
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
   */
  getAccessToken(integrationType: ConnectorIntegrationType): Promise<string>;
}
