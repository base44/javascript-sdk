/**
 * Parameters for calling a custom integration endpoint.
 * @internal
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

  /**
   * Additional headers to send with this specific request.
   * These are merged with the integration's configured headers.
   */
  headers?: Record<string, string>;
}

/**
 * Response from a custom integration call.
 * @internal
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
 * // Call a custom GitHub integration
 * const response = await base44.integrations.custom.call(
 *   "github",        // integration slug (defined by workspace admin)
 *   "listIssues",    // operation ID from the OpenAPI spec
 *   {
 *     pathParams: { owner: "myorg", repo: "myrepo" },
 *     queryParams: { state: "open", per_page: 100 }
 *   }
 * );
 *
 * if (response.success) {
 *   console.log("Issues:", response.data);
 * } else {
 *   console.error("API returned error:", response.status_code);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Call with request body payload
 * const response = await base44.integrations.custom.call(
 *   "github",
 *   "createIssue",
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
 * @internal
 */
export interface CustomIntegrationsModule {
  /**
   * Call a custom integration endpoint.
   *
   * @param slug - The integration's unique identifier (slug), as defined by the workspace admin.
   * @param operationId - The operation ID from the OpenAPI spec (e.g., "listIssues", "getUser").
   * @param params - Optional parameters including payload, pathParams, queryParams, and headers.
   * @returns Promise resolving to the integration call response.
   *
   * @throws {Error} If slug is not provided.
   * @throws {Error} If operationId is not provided.
   * @throws {Base44Error} If the integration or operation is not found (404).
   * @throws {Base44Error} If the external API call fails (502).
   * @throws {Base44Error} If the request times out (504).
   */
  call(
    slug: string,
    operationId: string,
    params?: CustomIntegrationCallParams
  ): Promise<CustomIntegrationCallResponse>;
}
