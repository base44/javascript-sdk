import { AxiosInstance } from "axios";
import {
  CustomIntegrationsModule,
  CustomIntegrationCallParams,
  CustomIntegrationCallResponse,
} from "./custom-integrations.types.js";

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

      // Make the API call
      const response = await axios.post<CustomIntegrationCallResponse>(
        `/apps/${appId}/integrations/custom/${slug}/${operationId}`,
        params ?? {}
      );

      // Return the response data
      // Note: axios interceptor already extracts data from response
      return response as unknown as CustomIntegrationCallResponse;
    },
  };
}
