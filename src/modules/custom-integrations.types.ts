/**
 * Parameters for calling a custom integration endpoint.
 */
export interface CustomIntegrationCallParams {
  /**
   * Request body to send to the external API. The payload is JSON-serialized before being sent.
   */
  payload?: Record<string, any>;

  /**
   * Path parameters to substitute into the URL template.
   * For example, if the API endpoint is `/repos/{owner}/{repo}/issues`,
   * pass `{ owner: "myorg", repo: "myrepo" }`.
   */
  pathParams?: Record<string, string>;

  /**
   * Query string parameters to append to the URL.
   * For example, `{ state: "open", per_page: 50 }` becomes `?state=open&per_page=50`.
   */
  queryParams?: Record<string, any>;

  /**
   * Additional HTTP headers to include in the request.
   * These headers are merged with any headers configured for the integration itself, with headers specified here taking precedence in case of conflicts.
   */
  headers?: Record<string, string>;
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
   * The parsed JSON response body from the external API.
   * The structure depends on the API endpoint being called.
   */
  data: any;
}

/**
 * Custom integrations module for calling workspace-level API integrations.
 */
export interface CustomIntegrationsModule {
  /**
   * Call a custom integration endpoint.
   *
   * Custom integrations are external APIs that have been pre-configured by a workspace administrator who imports an OpenAPI specification. Each integration is identified by a slug and exposes operations defined in the specification.
   *
   * Requests are proxied through Base44's backend, so API credentials aren't exposed. That means you can safely use this method to call external APIs from frontend code.
   *
   * @param slug - The integration's unique identifier, as defined by the workspace admin.
   * @param operationId - The operation ID from the OpenAPI specification, such as `"listIssues"` or `"getUser"`.
   * @param params - Optional parameters to send to the external API.
   * @returns Promise resolving to the integration call response.
   *
   * @throws {Error} If slug is not provided.
   * @throws {Error} If operationId is not provided.
   * @throws {Base44Error} If the integration or operation is not found (404).
   * @throws {Base44Error} If the external API call fails (502).
   * @throws {Base44Error} If the request times out (504).
   *
   * @example
   * ```typescript
   * // GET request with path and query parameters
   * const response = await base44.integrations.custom.call(
   *   "github",
   *   "listRepoIssues",
   *   {
   *     pathParams: { owner: "myorg", repo: "myrepo" },
   *     queryParams: { state: "open", per_page: 50 }
   *   }
   * );
   *
   * if (response.success) {
   *   console.log("Found issues:", response.data.length);
   * }
   * ```
   *
   * @example
   * ```typescript
   * // POST request with a JSON body
   * const response = await base44.integrations.custom.call(
   *   "slack",
   *   "postMessage",
   *   {
   *     payload: {
   *       channel: "#general",
   *       text: "Hello from Base44!"
   *     }
   *   }
   * );
   * ```
   */
  call(
    slug: string,
    operationId: string,
    params?: CustomIntegrationCallParams
  ): Promise<CustomIntegrationCallResponse>;
}
