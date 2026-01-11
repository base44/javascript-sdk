/**
 * Parameters for calling a custom integration endpoint.
 */
export interface CustomIntegrationCallParams {
  /**
   * Request body payload to send to the external API.
   */
  payload?: Record<string, any>;

  /**
   * Path parameters to substitute in the URL (e.g., `{ owner: "user", repo: "repo" }`).
   */
  pathParams?: Record<string, string>;

  /**
   * Query string parameters to append to the URL.
   */
  queryParams?: Record<string, any>;
}

/**
 * Response from a custom integration call.
 */
export interface CustomIntegrationCallResponse {
  /**
   * Whether the external API returned a 2xx status code.
   */
  success: boolean;

  /**
   * The HTTP status code returned by the external API.
   */
  status_code: number;

  /**
   * The response data from the external API.
   * Can be any JSON-serializable value depending on the external API's response.
   */
  data: any;
}

/**
 * Module for calling custom workspace-level API integrations.
 *
 * Custom integrations allow workspace administrators to connect any external API
 * by importing an OpenAPI specification. Apps in the workspace can then call
 * these integrations using this module.
 *
 * Unlike the built-in integrations (like `Core`), custom integrations:
 * - Are defined per-workspace by importing OpenAPI specs
 * - Use a slug-based identifier instead of package names
 * - Proxy requests through Base44's backend (credentials never exposed to frontend)
 *
 * @example
 * ```typescript
 * // Call a custom CRM integration
 * const response = await base44.integrations.custom.call(
 *   "my-crm",         // integration slug (defined by workspace admin)
 *   "get:/contacts",  // endpoint: method:path format
 *   {
 *     queryParams: { limit: 10 }
 *   }
 * );
 *
 * if (response.success) {
 *   console.log("Contacts:", response.data);
 * } else {
 *   console.error("API returned error:", response.status_code);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Call with path params and request body payload
 * const response = await base44.integrations.custom.call(
 *   "github",
 *   "post:/repos/{owner}/{repo}/issues",
 *   {
 *     pathParams: { owner: "myorg", repo: "myrepo" },
 *     payload: {
 *       title: "Bug report",
 *       body: "Something is broken",
 *       labels: ["bug"]
 *     }
 *   }
 * );
 * ```
 */
export interface CustomIntegrationsModule {
  /**
   * Call a custom integration endpoint.
   *
   * @param slug - The integration's unique identifier (slug), as defined by the workspace admin.
   * @param endpoint - The endpoint in `method:path` format (e.g., `"get:/contacts"`, `"post:/users/{id}"`). The method is the HTTP verb (lowercase) and the path matches the OpenAPI specification.
   * @param params - Optional parameters including payload, pathParams, and queryParams.
   * @returns Promise resolving to the integration call response.
   *
   * @throws {Error} If slug is not provided.
   * @throws {Error} If endpoint is not provided.
   * @throws {Base44Error} If the integration or endpoint is not found (404).
   * @throws {Base44Error} If the external API call fails (502).
   * @throws {Base44Error} If the request times out (504).
   */
  call(
    slug: string,
    endpoint: string,
    params?: CustomIntegrationCallParams
  ): Promise<CustomIntegrationCallResponse>;
}
