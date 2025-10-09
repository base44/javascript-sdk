import { AxiosInstance } from "axios";
import {
  ExternalAuthIntegrationType,
  ExternalAuthAccessTokenResponse,
} from "./external-auth.types.js";

/**
 * Creates the External Auth module for the Base44 SDK
 * @param axios - Axios instance (should be service role client)
 * @param appId - Application ID
 * @returns External Auth module
 */
export function createExternalAuthModule(axios: AxiosInstance, appId: string) {
  return {
    /**
     * Retrieve an access token for a given integration type
     * @param integrationType - The integration type to get access token for
     * @returns Access token response
     */
    async getAccessToken(
      integrationType: ExternalAuthIntegrationType
    ): Promise<ExternalAuthAccessTokenResponse> {
      if (!integrationType || typeof integrationType !== "string") {
        throw new Error(
          "Integration type is required and must be a string"
        );
      }

      const response = await axios.get<ExternalAuthAccessTokenResponse>(
        `/apps/${appId}/external-auth/tokens/${integrationType}`
      );

      // @ts-expect-error
      return response.access_token;
    },
  };
}
