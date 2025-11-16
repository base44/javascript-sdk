/**
 * Function signature for calling an integration endpoint.
 *
 * @param data - An object containing named parameters for the integration endpoint
 * @returns Promise resolving to the integration endpoint's response
 */
export type IntegrationEndpointFunction = (
  data: Record<string, any>
) => Promise<any>;

/**
 * A package containing integration endpoints.
 *
 * Provides dynamic access to integration endpoints within a package.
 * Each endpoint is accessed as a property that returns a function to invoke it.
 *
 * @example
 * ```typescript
 * // Access endpoints dynamically
 * const result = await integrations.Core.SendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'Message'
 * });
 * ```
 */
export type IntegrationPackage = {
  [endpointName: string]: IntegrationEndpointFunction;
};

/**
 * Integrations module for calling pre-built integration endpoints.
 *
 * This module provides access to integration endpoints that Base44 provides
 * for interacting with external services. Integrations are organized into
 * packages, with the most common being the "Core" package.
 *
 * Unlike the connectors module (which gives you raw OAuth tokens), integrations
 * provide pre-built functions that Base44 executes on your behalf.
 *
 * **Dynamic Access:**
 * Integration endpoints are accessed dynamically using the pattern:
 * `client.integrations.PackageName.EndpointName(params)`
 *
 * **File Upload Support:**
 * If any parameter is a `File` object, the request will automatically be
 * sent as `multipart/form-data`. Otherwise, it will be sent as JSON.
 *
 * **Available with both auth modes:**
 * - User auth: `client.integrations.PackageName.EndpointName(...)`
 * - Service role: `client.asServiceRole.integrations.PackageName.EndpointName(...)`
 *
 * @example
 * ```typescript
 * // Send email using Core package
 * const emailResult = await client.integrations.Core.SendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello from Base44',
 *   body: 'This is a test email'
 * });
 *
 * // Upload file using Core package
 * const fileInput = document.querySelector('input[type="file"]');
 * const uploadResult = await client.integrations.Core.UploadFile({
 *   file: fileInput.files[0],
 *   metadata: { type: 'profile-picture' }
 * });
 *
 * // Use custom integration package
 * const result = await client.integrations.CustomPackage.CustomEndpoint({
 *   param1: 'value1',
 *   param2: 'value2'
 * });
 *
 * // Use with service role
 * const adminEmail = await client.asServiceRole.integrations.Core.SendEmail({
 *   to: 'admin@example.com',
 *   subject: 'Admin notification',
 *   body: 'System alert'
 * });
 * ```
 */
export type IntegrationsModule = {
  /**
   * Core package containing built-in Base44 integration endpoints.
   *
   * Common endpoints include:
   * - `SendEmail` - Send emails
   * - `UploadFile` - Upload files
   *
   * @example
   * ```typescript
   * await client.integrations.Core.SendEmail({
   *   to: 'user@example.com',
   *   subject: 'Welcome',
   *   body: 'Welcome to our app!'
   * });
   * ```
   */
  Core: IntegrationPackage;

  /**
   * Access to any custom or installable integration package.
   *
   * Use this to call endpoints from custom integration packages
   * you've installed in your Base44 app.
   *
   * @example
   * ```typescript
   * // Access custom package dynamically
   * await client.integrations.Slack.PostMessage({
   *   channel: '#general',
   *   text: 'Hello from Base44'
   * });
   * ```
   */
  [packageName: string]: IntegrationPackage;
};
