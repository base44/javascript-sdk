/**
 * Function signature for calling an integration endpoint.
 *
 * If any parameter is a `File` object, the request will automatically be
 * sent as `multipart/form-data`. Otherwise, it will be sent as JSON.
 *
 * @param data - An object containing named parameters for the integration endpoint.
 * @returns Promise resolving to the integration endpoint's response.
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
 * Integrations module for calling integration endpoints.
 *
 * This module provides access to integration endpoints for interacting with external
 * services. Integrations are organized into packages. Base44 provides built-in integrations
 * in the "Core" package, and you can install additional integration packages for other services.
 *
 * Unlike the connectors module that gives you raw OAuth tokens, integrations provide
 * pre-built functions that Base44 executes on your behalf.
 *
 * Integration endpoints are accessed dynamically using the pattern:
 * `base44.integrations.PackageName.EndpointName(params)`
 *
 * This module is available to use with a client in both user and service role authentication modes:
 *
 * - **User authentication** (`base44.integrations`): Integration endpoints are invoked with the
 *   currently authenticated user's permissions. The endpoints execute with the user's authentication
 *   context and can only access data the user has permission to access.
 *
 * - **Service role authentication** (`client.asServiceRole.integrations`): Integration endpoints
 *   are invoked with elevated permissions. The endpoints execute with service role authentication
 *   and can access data across all users. This is useful for admin operations or workflows that
 *   need to operate regardless of user permissions.
 *
 * @example
 * ```typescript
 * // Send email using Core package
 * const emailResult = await base44.integrations.Core.SendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello from Base44',
 *   body: 'This is a test email'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Upload file using Core package in React
 * const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
 *   const file = event.target.files?.[0];
 *   if (file) {
 *     const uploadResult = await base44.integrations.Core.UploadFile({
 *       file: file,
 *       metadata: { type: 'profile-picture' }
 *     });
 *   }
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Use with service role
 * const adminEmail = await client.asServiceRole.integrations.Core.SendEmail({
 *   to: 'admin@example.com',
 *   subject: 'Admin notification',
 *   body: 'System alert'
 * });
 * ```
 */
export interface IntegrationsModule {
  /**
   * Core package containing built-in Base44 integration functions.
   *
   * The core integrations package includes the following functions:
   * - `InvokeLLM`: Generate text or structured JSON data using AI models.
   * - `GenerateImage`: Create AI-generated images from text prompts.
   * - `UploadFile`: Upload files to public storage and get a URL.
   * - `SendEmail`: Send emails to users.
   * - `ExtractDataFromUploadedFile`: Extract structured data (CSV, PDF, etc.) from uploaded files.
   * - `UploadPrivateFile`: Upload files to private storage (requires signed URLs to access).
   * - `CreateFileSignedUrl`: Generate temporary access links for private files.
   *
   * @example
   * ```typescript
   * // Send an email
   * await base44.integrations.Core.SendEmail({
   *   to: 'user@example.com',
   *   subject: 'Welcome',
   *   body: 'Welcome to our app!'
   * });
   * ```
   */
  Core: IntegrationPackage;

  /**
   * Access to additional integration packages.
   *
   * Additional integration packages may be added in the future and will be
   * accessible using the same pattern as Core.
   */
  [packageName: string]: IntegrationPackage;
}
