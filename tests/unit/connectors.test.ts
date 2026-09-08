import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createClient } from "../../src/index.ts";
import type { AppUserConnectorConnectionResponse } from "../../src/modules/connectors.types.ts";

describe("Connectors module – getConnection", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  let base44: ReturnType<typeof createClient>;
  const tokensBase = `${serverUrl}/api/apps/${appId}/external-auth/tokens`;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, serviceToken });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("extracts accessToken and connectionConfig from API response", async () => {
    server.use(
      http.get(`${tokensBase}/jira`, () =>
        HttpResponse.json({
          access_token: "oauth-token-abc123",
          integration_type: "jira",
          connection_config: { subdomain: "my-company" },
        }),
      ),
    );

    const connection =
      await base44.asServiceRole.connectors.getConnection("jira");

    expect(connection).toBeDefined();
    expect(connection.accessToken).toBe("oauth-token-abc123");
    expect(connection.connectionConfig).toEqual({ subdomain: "my-company" });
  });

  test("returns connectionConfig as null when API omits connection_config", async () => {
    server.use(
      http.get(`${tokensBase}/slack`, () =>
        HttpResponse.json({
          access_token: "token-only",
          integration_type: "slack",
        }),
      ),
    );

    const connection =
      await base44.asServiceRole.connectors.getConnection("slack");

    expect(connection.accessToken).toBe("token-only");
    expect(connection.connectionConfig).toBeNull();
  });

  test("returns connectionConfig as null when API sends null connection_config", async () => {
    server.use(
      http.get(`${tokensBase}/github`, () =>
        HttpResponse.json({
          access_token: "token-only",
          integration_type: "github",
          connection_config: null,
        }),
      ),
    );

    const connection =
      await base44.asServiceRole.connectors.getConnection("github");

    expect(connection.accessToken).toBe("token-only");
    expect(connection.connectionConfig).toBeNull();
  });

  test("throws when integrationType is empty string", async () => {
    await expect(
      base44.asServiceRole.connectors.getConnection(""),
    ).rejects.toThrow("Integration type is required and must be a string");
  });

  test("throws when integrationType is not a string", async () => {
    await expect(
      base44.asServiceRole.connectors.getConnection(null as unknown as string),
    ).rejects.toThrow("Integration type is required and must be a string");
  });
});

describe("Connectors module – getWorkspaceConnection", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  let base44: ReturnType<typeof createClient>;

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
      serviceToken,
    });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("extracts accessToken and connectionConfig from connectors endpoint", async () => {
    const apiResponse = {
      access_token: "builder-oauth-token-xyz789",
      integration_type: "snowflake",
      connection_config: { subdomain: "xy12345.us-east-1" },
    };

    mockHttp({
      method: "get",
      url:
        serverUrl +
        `/api/apps/${appId}/external-auth/tokens/connectors/connector-abc`,
      status: 200,
      response: apiResponse,
    });

    const connection =
      await base44.asServiceRole.connectors.getWorkspaceConnection(
        "connector-abc",
      );

    expect(connection.accessToken).toBe("builder-oauth-token-xyz789");
    expect(connection.connectionConfig).toEqual({
      subdomain: "xy12345.us-east-1",
    });
  });

  test("returns connectionConfig as null when API omits connection_config", async () => {
    const apiResponse = {
      access_token: "token-only",
      integration_type: "databricks",
    };

    mockHttp({
      method: "get",
      url:
        serverUrl + `/api/apps/${appId}/external-auth/tokens/connectors/conn-2`,
      status: 200,
      response: apiResponse,
    });

    const connection =
      await base44.asServiceRole.connectors.getWorkspaceConnection("conn-2");

    expect(connection.accessToken).toBe("token-only");
    expect(connection.connectionConfig).toBeNull();
  });

  test("throws when connectorId is empty string", async () => {
    await expect(
      base44.asServiceRole.connectors.getWorkspaceConnection(""),
    ).rejects.toThrow("Connector ID is required and must be a string");
  });

  test("throws when connectorId is not a string", async () => {
    await expect(
      base44.asServiceRole.connectors.getWorkspaceConnection(
        null as unknown as string,
      ),
    ).rejects.toThrow("Connector ID is required and must be a string");
  });
});

describe("Connectors module – getCurrentAppUserConnection", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  let base44: ReturnType<typeof createClient>;

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
      serviceToken,
    });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("extracts accessToken and connectionConfig from API response", async () => {
    const apiResponse = {
      access_token: "user-oauth-token-abc123",
      integration_type: "jira",
      connection_config: { subdomain: "my-company" },
    };

    mockHttp({
      method: "get",
      url:
        serverUrl +
        `/api/apps/${appId}/app-user-auth/connectors/connector-1/token`,
      status: 200,
      response: apiResponse,
    });

    const connection: AppUserConnectorConnectionResponse =
      await base44.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-1",
      );

    expect(connection).toBeDefined();
    expect(connection.accessToken).toBe("user-oauth-token-abc123");
    expect(connection.connectionConfig).toEqual({
      subdomain: "my-company",
    });
  });

  test("returns connectionConfig as null when API omits connection_config", async () => {
    const apiResponse = {
      access_token: "user-token-only",
      integration_type: "slack",
    };

    mockHttp({
      method: "get",
      url:
        serverUrl +
        `/api/apps/${appId}/app-user-auth/connectors/connector-2/token`,
      status: 200,
      response: apiResponse,
    });

    const connection: AppUserConnectorConnectionResponse =
      await base44.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-2",
      );

    expect(connection.accessToken).toBe("user-token-only");
    expect(connection.connectionConfig).toBeNull();
  });

  test("returns connectionConfig as null when API sends null connection_config", async () => {
    const apiResponse = {
      access_token: "user-token-only",
      integration_type: "github",
      connection_config: null,
    };

    mockHttp({
      method: "get",
      url:
        serverUrl +
        `/api/apps/${appId}/app-user-auth/connectors/connector-3/token`,
      status: 200,
      response: apiResponse,
    });

    const connection: AppUserConnectorConnectionResponse =
      await base44.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-3",
      );

    expect(connection.accessToken).toBe("user-token-only");
    expect(connection.connectionConfig).toBeNull();
  });

  test("throws when connectorId is empty string", async () => {
    await expect(
      base44.asServiceRole.connectors.getCurrentAppUserConnection(""),
    ).rejects.toThrow("Connector ID is required and must be a string");
  });

  test("throws when connectorId is not a string", async () => {
    await expect(
      base44.asServiceRole.connectors.getCurrentAppUserConnection(
        null as unknown as string,
      ),
    ).rejects.toThrow("Connector ID is required and must be a string");
  });
});
