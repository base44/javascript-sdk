import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";

describe("Integrations Module", () => {
  let base44;
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

  test("Core integration should send requests to the correct endpoint", async () => {
    const emailParams = {
      to: "test@example.com",
      subject: "Test Email",
      body: "This is a test email",
    };

    // Mock the API response
    mockHttp({
      method: "post",
      url:
        serverUrl + `/api/apps/${appId}/integration-endpoints/Core/SendEmail`,
      body: emailParams,
      status: 200,
      response: { success: true, messageId: "123456" },
    });

    // Call the API
    const result = await base44.integrations.Core.SendEmail(emailParams);

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.messageId).toBe("123456");
  });

  test("Custom package integration should send requests to the correct endpoint", async () => {
    const customParams = {
      param1: "value1",
      param2: "value2",
    };

    // Mock the API response
    mockHttp({
      method: "post",
      url:
        serverUrl +
        `/api/apps/${appId}/integration-endpoints/installable/CustomPackage/integration-endpoints/CustomEndpoint`,
      body: customParams,
      status: 200,
      response: { success: true, result: "custom result" },
    });

    // Call the API
    const result =
      await base44.integrations.CustomPackage.CustomEndpoint(customParams);

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.result).toBe("custom result");
  });

  test("Integration should handle file uploads correctly", async () => {
    // Mock a file
    const mockFile = new Blob(["file content"], { type: "text/plain" });
    mockFile.name = "test.txt";

    const uploadParams = {
      file: mockFile,
      metadata: { type: "document" },
    };

    mockHttp({
      method: "post",
      url:
        serverUrl + `/api/apps/${appId}/integration-endpoints/Core/UploadFile`,
      status: 200,
      response: { success: true, fileId: "file123" },
    });

    // Call the API
    const result = await base44.integrations.Core.UploadFile(uploadParams);

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.fileId).toBe("file123");
  });

  test("Integration should throw error with string parameters", async () => {
    // Expect error when trying to call with a string instead of object
    await expect(async () => {
      await base44.integrations.Core.SendEmail("invalid string parameter");
    }).rejects.toThrow(
      "Integration SendEmail must receive an object with named parameters",
    );
  });

  test("Integration should handle API errors correctly", async () => {
    const params = { invalid: "params" };

    // Mock an API error response
    mockHttp({
      method: "post",
      url:
        serverUrl + `/api/apps/${appId}/integration-endpoints/Core/SendEmail`,
      body: params,
      status: 400,
      response: { detail: "Invalid parameters", code: "INVALID_PARAMS" },
    });

    // Call the API and expect an error
    await expect(
      base44.integrations.Core.SendEmail(params),
    ).rejects.toMatchObject({
      status: 400,
      name: "Base44Error",
      message: "Invalid parameters",
      code: "INVALID_PARAMS",
    });
  });
});
