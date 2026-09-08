import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform/index.ts";

describe("Custom Integrations Module", () => {
  let base44: ReturnType<typeof createClient>;
  beforeEach(() => {
    base44 = createClient({ serverUrl: "https://base44.app", appId: "test-app-id" });
  });
  afterEach(() => base44.cleanup());

  test("converts camelCase params to snake_case for the backend", async () => {
    const operationId = "get:/repos/{owner}/{repo}/issues";
    platform.given.customIntegrations.operation("github", operationId, {
      issues: [{ id: 1, title: "Test Issue" }],
    });
    const result = await base44.integrations.custom.call("github", operationId, {
      payload: { title: "Test Issue" },
      pathParams: { owner: "testuser", repo: "testrepo" },
      queryParams: { state: "open" },
    });
    expect(result).toMatchObject({ success: true, status_code: 200 });
    expect(result.data.issues).toHaveLength(1);
    expect(platform.requests.last("customIntegrations.call").body).toEqual({
      payload: { title: "Test Issue" },
      path_params: { owner: "testuser", repo: "testrepo" },
      query_params: { state: "open" },
    });
  });

  test("works with empty params", async () => {
    platform.given.customIntegrations.operation("github", "getAuthenticatedUser", { login: "testuser", id: 123 });
    const result = await base44.integrations.custom.call("github", "getAuthenticatedUser");
    expect(result.data.login).toBe("testuser");
    expect(platform.requests.last("customIntegrations.call").body).toEqual({});
  });

  test("maps missing integration to a 404 Base44Error", async () => {
    await expect(base44.integrations.custom.call("nonexistent", "someEndpoint")).rejects.toMatchObject({
      status: 404, name: "Base44Error", message: "Custom integration 'nonexistent' not found in workspace",
    });
  });

  test("maps missing operation to a 404 Base44Error", async () => {
    platform.given.customIntegrations.operation("github", "existingOperation", {});
    await expect(base44.integrations.custom.call("github", "nonExistentOperation")).rejects.toMatchObject({
      status: 404, name: "Base44Error",
      message: "Operation 'nonExistentOperation' not found in integration 'github'",
    });
  });

  test("returns the current backend envelope for an upstream-unavailable fault", async () => {
    const operationId = "get:/repos/{owner}/{repo}/issues";
    platform.given.customIntegrations.operation("github", operationId, { issues: [] });
    platform.given.faults.customIntegrations.upstreamUnavailable("github", operationId);
    await expect(base44.integrations.custom.call("github", operationId)).resolves.toEqual({
      success: false,
      status_code: 502,
      data: { detail: "Failed to connect to external API: Connection refused" },
    });
    await expect(base44.integrations.custom.call("github", operationId)).resolves.toEqual({
      success: true,
      status_code: 200,
      data: { issues: [] },
    });
  });

  test.each([
    [undefined, undefined, "Integration slug is required and cannot be empty"],
    ["github", undefined, "Operation ID is required and cannot be empty"],
    ["", "get", "Integration slug is required and cannot be empty"],
    ["   ", "get", "Integration slug is required and cannot be empty"],
    ["github", "", "Operation ID is required and cannot be empty"],
    ["github", "  \t\n  ", "Operation ID is required and cannot be empty"],
  ])("validates slug and operation ID (%s, %s)", async (slug, operationId, message) => {
    await expect(
      // @ts-expect-error Deliberately exercising invalid runtime input.
      base44.integrations.custom.call(slug, operationId),
    ).rejects.toThrow(message);
    expect(platform.requests.count("customIntegrations.call")).toBe(0);
  });

  test("handles large payloads without dropping data", async () => {
    const items = Array.from({ length: 1000 }, (_, id) => ({
      id, name: `Item ${id}`, description: "A".repeat(100), metadata: { key: `value_${id}` },
    }));
    platform.given.customIntegrations.operation("myapi", "bulkCreate", { created: 1000 });
    const result = await base44.integrations.custom.call("myapi", "bulkCreate", { payload: { items } });
    expect(result.data.created).toBe(1000);
    expect(platform.requests.last("customIntegrations.call").body).toEqual({ payload: { items } });
  });

  test("includes custom headers in the backend request body", async () => {
    const headers = { "X-Custom-Header": "custom-value" };
    platform.given.customIntegrations.operation("myapi", "getData", { result: "ok" });
    await base44.integrations.custom.call("myapi", "getData", { headers });
    expect(platform.requests.last("customIntegrations.call").body).toEqual({ headers });
  });

  test("passes through multiple headers", async () => {
    const headers = {
      "X-API-Key": "secret-key-123", "X-Request-ID": "req-456",
      "Accept-Language": "en-US", "X-Custom-Auth": "Bearer token123",
    };
    platform.given.customIntegrations.operation("myapi", "secureEndpoint", { authenticated: true });
    const result = await base44.integrations.custom.call("myapi", "secureEndpoint", { headers });
    expect(result.data.authenticated).toBe(true);
    expect(platform.requests.last("customIntegrations.call").body).toEqual({ headers });
  });

  test("only includes defined params in body", async () => {
    const operationId = "get:/users/{username}";
    platform.given.customIntegrations.operation("github", operationId, { login: "octocat" });
    await base44.integrations.custom.call("github", operationId, { pathParams: { username: "octocat" } });
    expect(platform.requests.last("customIntegrations.call").body).toEqual({
      path_params: { username: "octocat" },
    });
  });

  test("custom property does not interfere with other integration packages", async () => {
    platform.given.integrations.emailDelivered();
    // Legacy SDK compatibility; current Apper has removed this route.
    platform.given.integrations.packageSucceeds("SomePackage", "SomeEndpoint");
    await expect(base44.integrations.Core.SendEmail({ to: "test@example.com", subject: "Test", body: "Test body" })).resolves.toMatchObject({ success: true });
    await expect(base44.integrations.SomePackage.SomeEndpoint({ param: "value" })).resolves.toMatchObject({ success: true });
    expect(platform.requests.count("integrations.invoke")).toBe(2);
  });
});
