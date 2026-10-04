import { AxiosInstance } from "axios";
import {
  ConnectorIntegrationType,
  ConnectorAccessTokenResponse,
  ConnectorApiRequest,
  ConnectorApiResponse,
  ConnectorConnectionResponse,
  ConnectorProxyRawResponse,
  AppUserConnectorConnectionResponse,
  ConnectorsModule,
  UserConnectorsModule,
} from "./connectors.types.js";

const CONNECTOR_API_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
]);

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
        `/apps/${appId}/external-auth/tokens/${encodeURIComponent(integrationType)}`
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
        `/apps/${appId}/external-auth/tokens/${encodeURIComponent(integrationType)}`
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
        `/apps/${appId}/external-auth/tokens/connectors/${encodeURIComponent(connectorId)}`
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
        `/apps/${appId}/app-user-auth/connectors/${encodeURIComponent(connectorId)}/token`
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
        `/apps/${appId}/app-user-auth/connectors/${encodeURIComponent(connectorId)}/token`
      );

      const data = response as unknown as ConnectorAccessTokenResponse;
      return {
        accessToken: data.access_token,
        connectionConfig: data.connection_config ?? null,
      };
    },

    async callApi<T = unknown>(
      integrationType: ConnectorIntegrationType,
      request: ConnectorApiRequest
    ): Promise<ConnectorApiResponse<T>> {
      assertNonEmptyString(integrationType, "Integration type");
      // Encoded so a runtime-built identifier can only ever select a
      // connector, never re-target another route under this token.
      return proxyCall<T>(
        axios,
        `/apps/${appId}/connectors/${encodeURIComponent(integrationType)}/call`,
        request
      );
    },
  };
}

function assertNonEmptyString(value: unknown, label: string): void {
  if (!value || typeof value !== "string") {
    throw new Error(`${label} is required and must be a string`);
  }
}

/**
 * POST a request to the connector proxy and normalize the response.
 *
 * The proxy reports upstream outcomes in the body rather than as HTTP status, so
 * a provider 4xx/5xx arrives here as a resolved response with `success: false` —
 * only Base44-side failures reject through the axios error interceptor.
 *
 * @internal
 */
async function proxyCall<T>(
  axios: AxiosInstance,
  url: string,
  request: ConnectorApiRequest
): Promise<ConnectorApiResponse<T>> {
  if (!request || typeof request !== "object") {
    throw new Error("Request is required and must be an object");
  }
  assertNonEmptyString(request.path, "Request path");
  const method = request.method ?? "GET";
  if (!CONNECTOR_API_METHODS.has(method)) {
    throw new Error(
      "Request method must be one of GET, POST, PUT, PATCH, DELETE, or HEAD"
    );
  }

  const response = await axios.post(url, {
    method,
    // Omitted when unset (undefined or null, since untyped callers write
    // either) so the proxy applies the connector's declared default host.
    ...(request.host == null ? {} : { host: request.host }),
    path: request.path,
    query: request.query ?? {},
    headers: request.headers ?? {},
    body: request.body ?? null,
  });

  const data = response as unknown as ConnectorProxyRawResponse;
  return {
    success: data.success,
    phase: data.phase,
    status: data.status_code ?? null,
    data: data.data as T,
    dataBase64: data.data_base64 ?? null,
    contentType: data.content_type ?? null,
    headers: data.headers ?? {},
    creditsCharged: data.credits_charged ?? 0,
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
        `/apps/${appId}/app-user-auth/connectors/${encodeURIComponent(connectorId)}/initiate`
      );

      const data = response as unknown as { redirect_url: string };
      return data.redirect_url;
    },

    async disconnectAppUser(connectorId: string): Promise<void> {
      if (!connectorId || typeof connectorId !== "string") {
        throw new Error("Connector ID is required and must be a string");
      }

      await axios.delete(
        `/apps/${appId}/app-user-auth/connectors/${encodeURIComponent(connectorId)}`
      );
    },
  };
}
