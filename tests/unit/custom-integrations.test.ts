import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";

describe("Custom Integrations Module", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";

  beforeEach(() => {
    // Create a new client for each test
    base44 = createClient({
      serverUrl,
      appId,
    });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("custom.call() should convert camelCase params to snake_case for backend", async () => {
    const slug = "github";
    const operationId = "get:/repos/{owner}/{repo}/issues";

    // SDK call uses camelCase (JS convention)
    const sdkParams = {
      payload: { title: "Test Issue" },
      pathParams: { owner: "testuser", repo: "testrepo" },
      queryParams: { state: "open" },
    };

    // Backend expects snake_case (Python convention)
    const expectedBody = {
      payload: { title: "Test Issue" },
      path_params: { owner: "testuser", repo: "testrepo" },
      query_params: { state: "open" },
    };

    const mockResponse = {
      success: true,
      status_code: 200,
      data: { issues: [{ id: 1, title: "Test Issue" }] },
    };

    const encodedOperationId = operationId
      .replace(/{/g, "%7B")
      .replace(/}/g, "%7D");
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${encodedOperationId}`,
      body: expectedBody,
      status: 200,
      response: mockResponse,
    });

    // SDK call uses camelCase
    const result = await base44.integrations.custom.call(
      slug,
      operationId,
      sdkParams,
    );

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.status_code).toBe(200);
    expect(result.data.issues).toHaveLength(1);
  });

  test("custom.call() should work with empty params", async () => {
    const slug = "github";
    const operationId = "getAuthenticatedUser";

    const mockResponse = {
      success: true,
      status_code: 200,
      data: { login: "testuser", id: 123 },
    };

    // Mock the API response
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${operationId}`,
      body: {},
      status: 200,
      response: mockResponse,
    });

    // Call without params
    const result = await base44.integrations.custom.call(slug, operationId);

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.data.login).toBe("testuser");
  });

  test("custom.call() should handle 404 error for non-existent integration", async () => {
    const slug = "nonexistent";
    const operationId = "someEndpoint";

    // Mock a 404 error response
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${operationId}`,
      body: {},
      status: 404,
      response: {
        detail: `Custom integration '${slug}' not found in workspace`,
      },
    });

    // Call the API and expect an error
    await expect(
      base44.integrations.custom.call(slug, operationId),
    ).rejects.toMatchObject({
      status: 404,
      name: "Base44Error",
    });
  });

  test("custom.call() should handle 404 error for non-existent operation", async () => {
    const slug = "github";
    const operationId = "nonExistentOperation";

    // Mock a 404 error response
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${operationId}`,
      body: {},
      status: 404,
      response: {
        detail: `Operation '${operationId}' not found in integration '${slug}'`,
      },
    });

    // Call the API and expect an error
    await expect(
      base44.integrations.custom.call(slug, operationId),
    ).rejects.toMatchObject({
      status: 404,
      name: "Base44Error",
    });
  });

  test("custom.call() should handle 502 error from external API", async () => {
    const slug = "github";
    const operationId = "get:/repos/{owner}/{repo}/issues";

    // Mock a 502 error response (external API failure) - curly braces in operationId must be URL-encoded
    const encodedOperationId = operationId
      .replace(/{/g, "%7B")
      .replace(/}/g, "%7D");
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${encodedOperationId}`,
      body: {},
      status: 502,
      response: {
        detail: "Failed to connect to external API: Connection refused",
      },
    });

    // Call the API and expect an error
    await expect(
      base44.integrations.custom.call(slug, operationId),
    ).rejects.toMatchObject({
      status: 502,
      name: "Base44Error",
    });
  });

  test("custom.call() should throw error when slug is missing", async () => {
    // @ts-expect-error Testing invalid input
    await expect(base44.integrations.custom.call()).rejects.toThrow(
      "Integration slug is required and cannot be empty",
    );
  });

  test("custom.call() should throw error when operationId is missing", async () => {
    // @ts-expect-error Testing invalid input
    await expect(base44.integrations.custom.call("github")).rejects.toThrow(
      "Operation ID is required and cannot be empty",
    );
  });

  test("custom.call() should throw error when slug is empty string", async () => {
    await expect(
      base44.integrations.custom.call("", "get:/repos/{owner}/{repo}/issues"),
    ).rejects.toThrow("Integration slug is required and cannot be empty");
  });

  test("custom.call() should throw error when slug is whitespace only", async () => {
    await expect(
      base44.integrations.custom.call(
        "   ",
        "get:/repos/{owner}/{repo}/issues",
      ),
    ).rejects.toThrow("Integration slug is required and cannot be empty");
  });

  test("custom.call() should throw error when operationId is empty string", async () => {
    await expect(base44.integrations.custom.call("github", "")).rejects.toThrow(
      "Operation ID is required and cannot be empty",
    );
  });

  test("custom.call() should throw error when operationId is whitespace only", async () => {
    await expect(
      base44.integrations.custom.call("github", "  \t\n  "),
    ).rejects.toThrow("Operation ID is required and cannot be empty");
  });

  test("custom.call() should handle large payloads", async () => {
    const slug = "myapi";
    const operationId = "bulkCreate";

    // Create a large payload with many items
    const largeArray = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      description: "A".repeat(100),
      metadata: { key: `value_${i}` },
    }));

    const sdkParams = {
      payload: { items: largeArray },
    };

    const mockResponse = {
      success: true,
      status_code: 200,
      data: { created: 1000 },
    };

    // Mock the API response
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${operationId}`,
      body: sdkParams,
      status: 200,
      response: mockResponse,
    });

    // Call the API with large payload
    const result = await base44.integrations.custom.call(
      slug,
      operationId,
      sdkParams,
    );

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.data.created).toBe(1000);
  });

  test("custom.call() should include custom headers in request", async () => {
    const slug = "myapi";
    const operationId = "getData";
    const sdkParams = {
      headers: { "X-Custom-Header": "custom-value" },
    };

    const mockResponse = {
      success: true,
      status_code: 200,
      data: { result: "ok" },
    };

    // Mock the API response
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${operationId}`,
      body: sdkParams,
      status: 200,
      response: mockResponse,
    });

    // Call the API
    const result = await base44.integrations.custom.call(
      slug,
      operationId,
      sdkParams,
    );

    // Verify the response
    expect(result.success).toBe(true);
  });

  test("custom.call() should pass through multiple headers", async () => {
    const slug = "myapi";
    const operationId = "secureEndpoint";
    const sdkParams = {
      headers: {
        "X-API-Key": "secret-key-123",
        "X-Request-ID": "req-456",
        "Accept-Language": "en-US",
        "X-Custom-Auth": "Bearer token123",
      },
    };

    const mockResponse = {
      success: true,
      status_code: 200,
      data: { authenticated: true },
    };

    // Mock the API response - verify all headers are passed in the body
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${operationId}`,
      body: sdkParams,
      status: 200,
      response: mockResponse,
    });

    // Call the API
    const result = await base44.integrations.custom.call(
      slug,
      operationId,
      sdkParams,
    );

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.data.authenticated).toBe(true);
  });

  test("custom.call() should only include defined params in body", async () => {
    const slug = "github";
    const operationId = "get:/users/{username}";

    // SDK call with only pathParams
    const sdkParams = {
      pathParams: { username: "octocat" },
    };

    // Expected body should only have path_params, not empty payload/query_params/headers
    const expectedBody = {
      path_params: { username: "octocat" },
    };

    const mockResponse = {
      success: true,
      status_code: 200,
      data: { login: "octocat" },
    };

    const encodedOperationId = operationId
      .replace(/{/g, "%7B")
      .replace(/}/g, "%7D");
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integrations/custom/${slug}/${encodedOperationId}`,
      body: expectedBody,
      status: 200,
      response: mockResponse,
    });

    const result = await base44.integrations.custom.call(
      slug,
      operationId,
      sdkParams,
    );

    expect(result.success).toBe(true);
  });

  test("custom property should not interfere with other integration packages", async () => {
    // Test that Core still works
    const coreParams = {
      to: "test@example.com",
      subject: "Test",
      body: "Test body",
    };

    mockHttp({
      method: "post",
      url:
        serverUrl + `/api/apps/${appId}/integration-endpoints/Core/SendEmail`,
      body: coreParams,
      status: 200,
      response: { success: true },
    });

    const coreResult = await base44.integrations.Core.SendEmail(coreParams);
    expect(coreResult.success).toBe(true);

    // Test that custom packages still work
    const customPackageParams = { param: "value" };

    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integration-endpoints/installable/SomePackage/integration-endpoints/SomeEndpoint`,
      body: customPackageParams,
      status: 200,
      response: { success: true },
    });

    const packageResult =
      await base44.integrations.SomePackage.SomeEndpoint(customPackageParams);
    expect(packageResult.success).toBe(true);
  });
});
