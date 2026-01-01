import { AxiosInstance } from "axios";
import {
  CustomIntegrationsModule,
  CustomIntegrationCallParams,
  CustomIntegrationCallResponse,
} from "./custom-integrations.types.js";

/**
 * Normalizes parameters to snake_case for the API.
 *
 * Supports both camelCase (pathParams) and snake_case (path_params) input,
 * always outputting snake_case for the backend.
 */
function normalizeParams(params?: CustomIntegrationCallParams): Record<string, any> {
  if (!params) {
    return {};
  }

  const normalized: Record<string, any> = {};

  // Handle payload
  if (params.payload !== undefined) {
    normalized.payload = params.payload;
  }

  // Handle path_params (support both camelCase and snake_case)
  const pathParams = params.pathParams ?? params.path_params;
  if (pathParams !== undefined) {
    normalized.path_params = pathParams;
  }

  // Handle query_params (support both camelCase and snake_case)
  const queryParams = params.queryParams ?? params.query_params;
  if (queryParams !== undefined) {
    normalized.query_params = queryParams;
  }

  // Handle headers
  if (params.headers !== undefined) {
    normalized.headers = params.headers;
  }

  return normalized;
}

/**
 * Creates the custom integrations module for the Base44 SDK.
 *
 * @param axios - Axios instance for making HTTP requests
 * @param appId - Application ID
 * @returns Custom integrations module with `call()` method
 * @internal
 */
export function createCustomIntegrationsModule(
  axios: AxiosInstance,
  appId: string
): CustomIntegrationsModule {
  return {
    async call(
      slug: string,
      operationId: string,
      params?: CustomIntegrationCallParams
    ): Promise<CustomIntegrationCallResponse> {
      // Validate required parameters
      if (!slug) {
        throw new Error("Integration slug is required");
      }
      if (!operationId) {
        throw new Error("Operation ID is required");
      }

      // Normalize parameters to snake_case
      const normalizedParams = normalizeParams(params);

      // Make the API call
      const response = await axios.post<CustomIntegrationCallResponse>(
        `/apps/${appId}/integrations/custom/${slug}/${operationId}`,
        normalizedParams
      );

      // Return the response data
      // Note: axios interceptor already extracts data from response
      return response as unknown as CustomIntegrationCallResponse;
    },
  };
}

