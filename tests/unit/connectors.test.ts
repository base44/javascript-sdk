import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform/index.ts";

describe("Connectors module – getConnection", () => {
  let base44: ReturnType<typeof createClient>;
  beforeEach(() => {
    base44 = createClient({ serverUrl: "https://base44.app", appId: "test-app-id", serviceToken: "service-token-123" });
  });
  afterEach(() => base44.cleanup());

  test("extracts accessToken and connectionConfig", async () => {
    platform.given.connectors.connection("jira", "oauth-token-abc123", { subdomain: "my-company" });
    const connection = await base44.asServiceRole.connectors.getConnection("jira");
    expect(connection).toEqual({ accessToken: "oauth-token-abc123", connectionConfig: { subdomain: "my-company" } });
    expect(platform.requests.last("connectors.getConnection")).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer service-token-123" },
    });
  });

  test.each([
    ["slack", undefined],
    ["github", null],
  ])("returns null config when backend config for %s is %s", async (type, config) => {
    platform.given.connectors.connection(type, "token-only", config);
    await expect(base44.asServiceRole.connectors.getConnection(type)).resolves.toEqual({
      accessToken: "token-only", connectionConfig: null,
    });
  });

  test.each(["", null])("rejects invalid integration type %s", async (type) => {
    await expect(base44.asServiceRole.connectors.getConnection(type as unknown as string)).rejects.toThrow(
      "Integration type is required and must be a string",
    );
    expect(platform.requests.count("connectors.getConnection")).toBe(0);
  });
});

describe("Connectors module – getWorkspaceConnection", () => {
  let base44: ReturnType<typeof createClient>;
  beforeEach(() => {
    base44 = createClient({ serverUrl: "https://base44.app", appId: "test-app-id", serviceToken: "service-token-123" });
  });
  afterEach(() => base44.cleanup());

  test("extracts accessToken and connectionConfig", async () => {
    platform.given.connectors.workspaceConnection("connector-abc", "snowflake", "builder-oauth-token-xyz789", { subdomain: "xy12345.us-east-1" });
    await expect(base44.asServiceRole.connectors.getWorkspaceConnection("connector-abc")).resolves.toEqual({
      accessToken: "builder-oauth-token-xyz789", connectionConfig: { subdomain: "xy12345.us-east-1" },
    });
  });

  test("returns null when connection_config is omitted", async () => {
    platform.given.connectors.workspaceConnection("conn-2", "databricks", "token-only");
    await expect(base44.asServiceRole.connectors.getWorkspaceConnection("conn-2")).resolves.toEqual({
      accessToken: "token-only", connectionConfig: null,
    });
  });

  test.each(["", null])("rejects invalid connector ID %s", async (id) => {
    await expect(base44.asServiceRole.connectors.getWorkspaceConnection(id as unknown as string)).rejects.toThrow(
      "Connector ID is required and must be a string",
    );
  });
});

describe("Connectors module – getCurrentAppUserConnection", () => {
  let base44: ReturnType<typeof createClient>;
  beforeEach(() => {
    base44 = createClient({ serverUrl: "https://base44.app", appId: "test-app-id", serviceToken: "service-token-123" });
  });
  afterEach(() => base44.cleanup());

  test("extracts accessToken and connectionConfig", async () => {
    platform.given.connectors.appUserConnection("connector-1", "jira", "user-oauth-token-abc123", { subdomain: "my-company" });
    await expect(base44.asServiceRole.connectors.getCurrentAppUserConnection("connector-1")).resolves.toEqual({
      accessToken: "user-oauth-token-abc123", connectionConfig: { subdomain: "my-company" },
    });
  });

  test.each([
    ["connector-2", "slack", undefined],
    ["connector-3", "github", null],
  ])("returns null config for %s", async (id, type, config) => {
    platform.given.connectors.appUserConnection(id, type, "user-token-only", config);
    await expect(base44.asServiceRole.connectors.getCurrentAppUserConnection(id)).resolves.toEqual({
      accessToken: "user-token-only", connectionConfig: null,
    });
  });

  test.each(["", null])("rejects invalid connector ID %s", async (id) => {
    await expect(base44.asServiceRole.connectors.getCurrentAppUserConnection(id as unknown as string)).rejects.toThrow(
      "Connector ID is required and must be a string",
    );
  });
});
