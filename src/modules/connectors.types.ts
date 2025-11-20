/**
 * The type of external integration/connector, such as `'google'`, `'slack'`, or `'github'`.
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
 * This module allows you to retrieve OAuth access tokens for external services
 * that your Base44 app has connected to. Use these tokens to make API
 * calls to external services.
 *
 * Unlike the integrations module that provides pre-built functions, connectors give you
 * raw OAuth tokens so you can call external service APIs directly with full control over
 * the API calls you make. This is useful when you need custom API interactions that aren't
 * covered by Base44's pre-built integrations.
 *
 * This module is only available with service role authentication.
 *
 * @example
 * ```typescript
 * // Retrieve Google OAuth token and use it to call Google APIs
 * const response = await base44.asServiceRole.connectors.getAccessToken('google');
 * const googleToken = response.access_token;
 * const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
 *   headers: { 'Authorization': `Bearer ${googleToken}` }
 * });
 * ```
 */
export interface ConnectorsModule {
  /**
   * Retrieves an OAuth access token for a specific external integration type.
   *
   * Returns the stored OAuth token for an external service that your Base44 app
   * has connected to. You can then use this token to make authenticated API calls
   * to that external service.
   *
   * @param integrationType - The type of integration, such as `'google'`, `'slack'`, or `'github'`.
   * @returns Promise resolving to the access token response.
   *
   * @example
   * ```typescript
   * // Get Google OAuth token
   * const response = await base44.asServiceRole.connectors.getAccessToken('google');
   * console.log(response.access_token);
   * ```
   *
   * @example
   * ```typescript
   * // Get Slack OAuth token
   * const slackResponse = await base44.asServiceRole.connectors.getAccessToken('slack');
   * console.log(slackResponse.access_token);
   * ```
   */
  getAccessToken(
    integrationType: ConnectorIntegrationType
  ): Promise<ConnectorAccessTokenResponse>;
}
