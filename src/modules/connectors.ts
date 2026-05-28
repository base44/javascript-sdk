import { AxiosInstance } from "axios";
import {
  ConnectorIntegrationType,
  ConnectorAccessTokenResponse,
  ConnectorConnectionResponse,
  AppUserConnectorConnectionResponse,
  ConnectorsModule,
  UserConnectorsModule,
} from "./connectors.types.js";

/**
 * Creates the Connectors module for the Base44 SDK.
 *
 * @param axios - Axios instance (should be service role client)
 * @param appId - Application ID
 * @returns Connectors module with methods to retrieve OAuth tokens
 * @internal
 */
export function createConnectorsModule(
  axios: AxiosInstance,
  appId: string
): ConnectorsModule {
  return {
    /**
     * Retrieve an OAuth access token for a specific external integration type.
     * @deprecated Use getConnection(integrationType) and use the returned accessToken (and connectionConfig when needed) instead.
     */
    // @ts-expect-error Return type mismatch with interface - implementation returns string, interface expects string but implementation is typed as ConnectorAccessTokenResponse
    async getAccessToken(
      integrationType: ConnectorIntegrationType
    ): Promise<ConnectorAccessTokenResponse> {
      if (!integrationType || typeof integrationType !== "string") {
        throw new Error("Integration type is required and must be a string");
      }

      const response = await axios.get<ConnectorAccessTokenResponse>(
        `/apps/${appId}/external-auth/tokens/${integrationType}`
      );

      // @ts-expect-error
      return response.access_token;
    },

    async getConnection(
      integrationType: ConnectorIntegrationType
    ): Promise<ConnectorConnectionResponse> {
      if (!integrationType || typeof integrationType !== "string") {
        throw new Error("Integration type is required and must be a string");
      }

      const response = await axios.get<ConnectorAccessTokenResponse>(
        `/apps/${appId}/external-auth/tokens/${integrationType}`
      );

      const data = response as unknown as ConnectorAccessTokenResponse;
      return {
        accessToken: data.access_token,
        connectionConfig: data.connection_config ?? null,
      };
    },

    async getWorkspaceConnection(
      connectorId: string
    ): Promise<ConnectorConnectionResponse> {
      if (!connectorId || typeof connectorId !== "string") {
        throw new Error("Connector ID is required and must be a string");
      }

      const response = await axios.get<ConnectorAccessTokenResponse>(
        `/apps/${appId}/external-auth/tokens/by-connector/${connectorId}`
      );

      const data = response as unknown as ConnectorAccessTokenResponse;
      return {
        accessToken: data.access_token,
        connectionConfig: data.connection_config ?? null,
      };
    },

    /**
     * @deprecated Use getCurrentAppUserConnection(connectorId) and use the returned accessToken (and connectionConfig when needed) instead.
     */
    async getCurrentAppUserAccessToken(
      connectorId: string
    ): Promise<string> {
      if (!connectorId || typeof connectorId !== "string") {
        throw new Error("Connector ID is required and must be a string");
      }

      const response = await axios.get(
        `/apps/${appId}/app-user-auth/connectors/${connectorId}/token`
      );

      const data = response as unknown as { access_token: string };
      return data.access_token;
    },

    async getCurrentAppUserConnection(
      connectorId: string
    ): Promise<AppUserConnectorConnectionResponse> {
      if (!connectorId || typeof connectorId !== "string") {
        throw new Error("Connector ID is required and must be a string");
      }

      const response = await axios.get(
        `/apps/${appId}/app-user-auth/connectors/${connectorId}/token`
      );

      const data = response as unknown as ConnectorAccessTokenResponse;
      return {
        accessToken: data.access_token,
        connectionConfig: data.connection_config ?? null,
      };
    },
  };
}

/**
 * Creates the user-scoped Connectors module (app-user OAuth flows).
 *
 * @param axios - Axios instance (user-scoped client)
 * @param appId - Application ID
 * @returns User connectors module with app-user OAuth methods
 * @internal
 */
export function createUserConnectorsModule(
  axios: AxiosInstance,
  appId: string
): UserConnectorsModule {
  return {
    async connectAppUser(connectorId: string): Promise<string> {
      if (!connectorId || typeof connectorId !== "string") {
        throw new Error("Connector ID is required and must be a string");
      }

      const response = await axios.post(
        `/apps/${appId}/app-user-auth/connectors/${connectorId}/initiate`
      );

      const data = response as unknown as { redirect_url: string };
      return data.redirect_url;
    },

    async disconnectAppUser(connectorId: string): Promise<void> {
      if (!connectorId || typeof connectorId !== "string") {
        throw new Error("Connector ID is required and must be a string");
      }

      await axios.delete(
        `/apps/${appId}/app-user-auth/connectors/${connectorId}`
      );
    },
  };
}
