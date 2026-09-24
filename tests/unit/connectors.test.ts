import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform/index.ts";

const appId = "test-app-id";
const serviceToken = "service-token-123";
const userToken = "user-token-123";
const userId = "user-123";

function arrangeServicePrincipal() {
  platform.given
    .app(appId)
    .auth.servicePrincipal(serviceToken, { id: "service-principal" });
}

describe("Connectors module – getConnection", () => {
  let base44: ReturnType<typeof createClient>;
  beforeEach(() => {
    arrangeServicePrincipal();
    base44 = createClient({
      serverUrl: "https://base44.app",
      appId,
      serviceToken,
    });
  });
  afterEach(() => base44.cleanup());

  test("extracts accessToken and connectionConfig", async () => {
    platform.given
      .app(appId)
      .connectors.connection("jira", "oauth-token-abc123", {
        subdomain: "my-company",
      });
    const connection =
      await base44.asServiceRole.connectors.getConnection("jira");
    expect(connection).toEqual({
      accessToken: "oauth-token-abc123",
      connectionConfig: { subdomain: "my-company" },
    });
    expect(platform.requests.last("connectors.getConnection")).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer service-token-123" },
    });
  });

  test.each([
    ["slack", undefined],
    ["github", null],
  ])(
    "returns null config when backend config for %s is %s",
    async (type, config) => {
      platform.given
        .app(appId)
        .connectors.connection(type, "token-only", config);
      await expect(
        base44.asServiceRole.connectors.getConnection(type),
      ).resolves.toEqual({
        accessToken: "token-only",
        connectionConfig: null,
      });
    },
  );

  test.each(["", null])("rejects invalid integration type %s", async (type) => {
    await expect(
      base44.asServiceRole.connectors.getConnection(type as unknown as string),
    ).rejects.toThrow("Integration type is required and must be a string");
    expect(platform.requests.count("connectors.getConnection")).toBe(0);
  });

  test("isolates connections and service credentials by application", async () => {
    const otherAppId = "other-connector-app";
    const otherServiceToken = "other-service-token";
    const otherClient = createClient({
      serverUrl: "https://base44.app",
      appId: otherAppId,
      serviceToken: otherServiceToken,
    });
    const anonymousService = createClient({
      serverUrl: "https://base44.app",
      appId,
    });
    const wrongScope = createClient({
      serverUrl: "https://base44.app",
      appId: otherAppId,
      serviceToken,
    });
    const userAsService = createClient({
      serverUrl: "https://base44.app",
      appId,
      serviceToken: userToken,
    });
    platform.given
      .app(otherAppId)
      .auth.servicePrincipal(otherServiceToken, { id: "other-service" });
    platform.given.app(appId).auth.principal(userToken, { id: userId });
    platform.given.app(appId).connectors.connection("jira", "app-a-token");
    platform.given.app(otherAppId).connectors.connection("jira", "app-b-token");

    await expect(
      base44.asServiceRole.connectors.getConnection("jira"),
    ).resolves.toMatchObject({
      accessToken: "app-a-token",
    });
    await expect(
      otherClient.asServiceRole.connectors.getConnection("jira"),
    ).resolves.toMatchObject({
      accessToken: "app-b-token",
    });
    await expect(
      wrongScope.asServiceRole.connectors.getConnection("jira"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      userAsService.asServiceRole.connectors.getConnection("jira"),
    ).rejects.toMatchObject({
      status: 403,
      message: "This endpoint is only accessible to service tokens",
    });
    expect(() => anonymousService.asServiceRole).toThrow(
      "Service token is required to use asServiceRole. Please provide a serviceToken when creating the client.",
    );
    otherClient.cleanup();
    anonymousService.cleanup();
    wrongScope.cleanup();
    userAsService.cleanup();
  });
});

describe("Connectors module – getWorkspaceConnection", () => {
  let base44: ReturnType<typeof createClient>;
  beforeEach(() => {
    arrangeServicePrincipal();
    base44 = createClient({
      serverUrl: "https://base44.app",
      appId,
      serviceToken,
    });
  });
  afterEach(() => base44.cleanup());

  test("extracts accessToken and connectionConfig", async () => {
    platform.given
      .app(appId)
      .connectors.workspaceConnection(
        "connector-abc",
        "snowflake",
        "builder-oauth-token-xyz789",
        { subdomain: "xy12345.us-east-1" },
      );
    await expect(
      base44.asServiceRole.connectors.getWorkspaceConnection("connector-abc"),
    ).resolves.toEqual({
      accessToken: "builder-oauth-token-xyz789",
      connectionConfig: { subdomain: "xy12345.us-east-1" },
    });
  });

  test("returns null when connection_config is omitted", async () => {
    platform.given
      .app(appId)
      .connectors.workspaceConnection("conn-2", "databricks", "token-only");
    await expect(
      base44.asServiceRole.connectors.getWorkspaceConnection("conn-2"),
    ).resolves.toEqual({
      accessToken: "token-only",
      connectionConfig: null,
    });
  });

  test("isolates the same workspace connector ID between applications", async () => {
    const otherAppId = "other-workspace-app";
    const otherServiceToken = "other-workspace-service";
    platform.given
      .app(otherAppId)
      .auth.servicePrincipal(otherServiceToken, { id: "other-service" });
    platform.given
      .app(appId)
      .connectors.workspaceConnection("shared-id", "snowflake", "app-a-token");
    platform.given
      .app(otherAppId)
      .connectors.workspaceConnection("shared-id", "snowflake", "app-b-token");
    const otherClient = createClient({
      serverUrl: "https://base44.app",
      appId: otherAppId,
      serviceToken: otherServiceToken,
    });
    const userAsService = createClient({
      serverUrl: "https://base44.app",
      appId,
      serviceToken: userToken,
    });
    platform.given.app(appId).auth.principal(userToken, { id: userId });

    await expect(
      base44.asServiceRole.connectors.getWorkspaceConnection("shared-id"),
    ).resolves.toMatchObject({ accessToken: "app-a-token" });
    await expect(
      otherClient.asServiceRole.connectors.getWorkspaceConnection("shared-id"),
    ).resolves.toMatchObject({ accessToken: "app-b-token" });
    await expect(
      userAsService.asServiceRole.connectors.getWorkspaceConnection(
        "shared-id",
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "This endpoint is only accessible to service tokens",
    });
    otherClient.cleanup();
    userAsService.cleanup();
  });

  test.each(["", null])("rejects invalid connector ID %s", async (id) => {
    await expect(
      base44.asServiceRole.connectors.getWorkspaceConnection(
        id as unknown as string,
      ),
    ).rejects.toThrow("Connector ID is required and must be a string");
  });
});

describe("Connectors module – getCurrentAppUserConnection", () => {
  let base44: ReturnType<typeof createClient>;
  beforeEach(() => {
    arrangeServicePrincipal();
    platform.given.app(appId).auth.principal(userToken, { id: userId });
    base44 = createClient({
      serverUrl: "https://base44.app",
      appId,
      token: userToken,
      serviceToken,
    });
  });
  afterEach(() => base44.cleanup());

  test("extracts accessToken and connectionConfig", async () => {
    platform.given
      .app(appId)
      .connectors.appUserConnection(
        userId,
        "connector-1",
        "jira",
        "user-oauth-token-abc123",
        { subdomain: "my-company" },
      );
    await expect(
      base44.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-1",
      ),
    ).resolves.toEqual({
      accessToken: "user-oauth-token-abc123",
      connectionConfig: { subdomain: "my-company" },
    });
    const userAsService = createClient({
      serverUrl: "https://base44.app",
      appId,
      token: userToken,
      serviceToken: userToken,
    });
    await expect(
      userAsService.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-1",
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "This endpoint is only accessible to service tokens",
    });
    userAsService.cleanup();
  });

  test.each([
    ["connector-2", "slack", undefined],
    ["connector-3", "github", null],
  ])("returns null config for %s", async (id, type, config) => {
    platform.given
      .app(appId)
      .connectors.appUserConnection(
        userId,
        id,
        type,
        "user-token-only",
        config,
      );
    await expect(
      base44.asServiceRole.connectors.getCurrentAppUserConnection(id),
    ).resolves.toEqual({
      accessToken: "user-token-only",
      connectionConfig: null,
    });
  });

  test.each(["", null])("rejects invalid connector ID %s", async (id) => {
    await expect(
      base44.asServiceRole.connectors.getCurrentAppUserConnection(
        id as unknown as string,
      ),
    ).rejects.toThrow("Connector ID is required and must be a string");
  });

  test("connects and disconnects only the current app user", async () => {
    platform.given
      .app(appId)
      .connectors.appUserAuthorization(
        userId,
        "connector-1",
        "https://oauth.example/authorize",
      );
    platform.given
      .app(appId)
      .connectors.appUserConnection(
        userId,
        "connector-1",
        "jira",
        "user-oauth-token",
      );
    await expect(base44.connectors.connectAppUser("connector-1")).resolves.toBe(
      "https://oauth.example/authorize",
    );
    await expect(
      base44.connectors.disconnectAppUser("connector-1"),
    ).resolves.toBeUndefined();
    await expect(
      base44.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-1",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("isolates app-user connections by on-behalf-of principal", async () => {
    const otherUserToken = "other-user-token";
    const otherUserId = "other-user";
    platform.given
      .app(appId)
      .auth.principal(otherUserToken, { id: otherUserId });
    platform.given
      .app(appId)
      .connectors.appUserConnection(
        userId,
        "connector-1",
        "jira",
        "user-a-token",
      );
    platform.given
      .app(appId)
      .connectors.appUserConnection(
        otherUserId,
        "connector-1",
        "jira",
        "user-b-token",
      );
    const otherUser = createClient({
      serverUrl: "https://base44.app",
      appId,
      token: otherUserToken,
      serviceToken,
    });
    const noUser = createClient({
      serverUrl: "https://base44.app",
      appId,
      serviceToken,
    });

    await expect(
      base44.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-1",
      ),
    ).resolves.toMatchObject({ accessToken: "user-a-token" });
    await expect(
      otherUser.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-1",
      ),
    ).resolves.toMatchObject({ accessToken: "user-b-token" });
    await expect(
      noUser.asServiceRole.connectors.getCurrentAppUserConnection(
        "connector-1",
      ),
    ).rejects.toMatchObject({ status: 401 });
    otherUser.cleanup();
    noUser.cleanup();
  });
});
