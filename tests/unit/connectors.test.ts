import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createClient } from "../../src/index.ts";

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
        })
      )
    );

    const connection = await base44.asServiceRole.connectors.getConnection("jira");

    expect(connection).toBeDefined();
    expect(connection.accessToken).toBe("oauth-token-abc123");
    expect(connection.connectionConfig).toEqual({ subdomain: "my-company" });
  });

  test("returns connectionConfig as null when API omits connection_config", async () => {
    server.use(
      http.get(`${tokensBase}/slack`, () =>
        HttpResponse.json({ access_token: "token-only", integration_type: "slack" })
      )
    );

    const connection = await base44.asServiceRole.connectors.getConnection("slack");

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
        })
      )
    );

    const connection = await base44.asServiceRole.connectors.getConnection("github");

    expect(connection.accessToken).toBe("token-only");
    expect(connection.connectionConfig).toBeNull();
  });

  test("throws when integrationType is empty string", async () => {
    await expect(
      base44.asServiceRole.connectors.getConnection("")
    ).rejects.toThrow("Integration type is required and must be a string");
  });

  test("throws when integrationType is not a string", async () => {
    await expect(
      base44.asServiceRole.connectors.getConnection(null as unknown as string)
    ).rejects.toThrow("Integration type is required and must be a string");
  });
});
