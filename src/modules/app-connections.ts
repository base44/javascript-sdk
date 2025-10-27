import { AxiosInstance } from "axios";
import {
  AppConnectionIntegrationType,
  AppConnectionAccessTokenResponse,
} from "./app-connections.types.js";

/**
 * Creates the App Connections module for the Base44 SDK
 * @param axios - Axios instance (should be service role client)
 * @param appId - Application ID
 * @returns App Connections module
 */
export function createAppConnectionsModule(axios: AxiosInstance, appId: string) {
  return {
    /**
     * Retrieve an access token for a given integration type
     * @param integrationType - The integration type to get access token for
     * @returns Access token response
     */
    async getAccessToken(
      integrationType: AppConnectionIntegrationType
    ): Promise<AppConnectionAccessTokenResponse> {
      if (!integrationType || typeof integrationType !== "string") {
        throw new Error(
          "Integration type is required and must be a string"
        );
      }

      const response = await axios.get<AppConnectionAccessTokenResponse>(
        `/apps/${appId}/external-auth/tokens/${integrationType}`
      );

      // @ts-expect-error
      return response.access_token;
    },
  };
}
