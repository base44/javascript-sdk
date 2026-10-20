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
   * Path parameters to substitute in the URL. For example, `{ owner: "user", repo: "repo" }`.
   */
  pathParams?: Record<string, string>;

  /**
   * Query string parameters to append to the URL.
   */
  queryParams?: Record<string, any>;
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
 * Module for calling custom pre-configured API integrations.
 *
 * Custom integrations allow workspace administrators to connect any external API by importing an OpenAPI specification. Apps in the workspace can then call these integrations using this module.
 */
export interface CustomIntegrationsModule {
  /**
   * Call a custom integration endpoint.
   *
   * @param slug - The integration's unique identifier, as defined by the workspace admin.
   * @param operationId - The endpoint in `method:path` format. For example, `"get:/contacts"`, or `"post:/users/{id}"`. The method is the HTTP verb in lowercase and the path matches the OpenAPI specification.
   * @param params - Optional parameters including payload, pathParams, and queryParams.
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
   * // Call a custom CRM integration
   * const response = await base44.integrations.custom.call(
   *   "my-crm",
   *   "get:/contacts",
   *   { queryParams: { limit: 10 } }
   * );
   *
   * if (response.success) {
   *   console.log("Contacts:", response.data);
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Call with path params and request body
   * const response = await base44.integrations.custom.call(
   *   "github",
   *   "post:/repos/{owner}/{repo}/issues",
   *   {
   *     pathParams: { owner: "myorg", repo: "myrepo" },
   *     payload: {
   *       title: "Bug report",
   *       body: "Something is broken"
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
