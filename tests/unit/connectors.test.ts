import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";

describe("Connectors module – getConnection", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
      serviceToken,
    });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("extracts accessToken and connectionConfig from API response", async () => {
    const apiResponse = {
      access_token: "oauth-token-abc123",
      integration_type: "jira",
      connection_config: { subdomain: "my-company" },
    };

    scope
      .get(`/api/apps/${appId}/external-auth/tokens/jira`)
      .reply(200, apiResponse);

    const connection = await base44.asServiceRole.connectors.getConnection(
      "jira"
    );

    expect(connection).toBeDefined();
    expect(connection.accessToken).toBe("oauth-token-abc123");
    expect(connection.connectionConfig).toEqual({
      subdomain: "my-company",
    });
    expect(scope.isDone()).toBe(true);
  });

  test("returns connectionConfig as null when API omits connection_config", async () => {
    const apiResponse = {
      access_token: "token-only",
      integration_type: "slack",
    };

    scope
      .get(`/api/apps/${appId}/external-auth/tokens/slack`)
      .reply(200, apiResponse);

    const connection = await base44.asServiceRole.connectors.getConnection(
      "slack"
    );

    expect(connection.accessToken).toBe("token-only");
    expect(connection.connectionConfig).toBeNull();
    expect(scope.isDone()).toBe(true);
  });

  test("returns connectionConfig as null when API sends null connection_config", async () => {
    const apiResponse = {
      access_token: "token-only",
      integration_type: "github",
      connection_config: null,
    };

    scope
      .get(`/api/apps/${appId}/external-auth/tokens/github`)
      .reply(200, apiResponse);

    const connection = await base44.asServiceRole.connectors.getConnection(
      "github"
    );

    expect(connection.accessToken).toBe("token-only");
    expect(connection.connectionConfig).toBeNull();
    expect(scope.isDone()).toBe(true);
  });

  test("throws when integrationType is empty string", async () => {
    await expect(
      base44.asServiceRole.connectors.getConnection("")
    ).rejects.toThrow("Integration type is required and must be a string");
  });

  test("throws when integrationType is not a string", async () => {
    await expect(
      base44.asServiceRole.connectors.getConnection(
        null as unknown as string
      )
    ).rejects.toThrow("Integration type is required and must be a string");
  });
});
