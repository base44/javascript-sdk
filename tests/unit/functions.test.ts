import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { platform, type MultipartBody } from "../mocks/platform";
import { createClient } from "../../src/index.ts";

// Module augmentation: register function names in FunctionNameRegistry
declare module "../../src/modules/functions.types.ts" {
  interface FunctionNameRegistry {
    sendNotification: true;
    processOrder: true;
    generateReport: true;
  }
}

describe("Functions Module", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

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

  test("should call a function with JSON data", async () => {
    const functionName = "sendNotification";
    const functionData = {
      userId: "123",
      message: "Hello World",
      priority: "high",
    };

    platform.given.app(appId).functions.notificationDelivery("msg-456");

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.success).toBe(true);
    expect(result.data.messageId).toBe("msg-456");
    expect(platform.requests.last("functions.invoke").body).toEqual(
      functionData,
    );
    expect(platform.requests.last("functions.invoke").headers).toMatchObject({
      "content-type": "application/json",
      "x-app-id": appId,
    });
  });

  test("should handle function with empty object parameters", async () => {
    const functionName = "getStatus";

    platform.given.app(appId).functions.serviceHealth("2024-01-01T00:00:00Z");

    // Call the function
    const result = await base44.functions.invoke(functionName, {});

    // Verify the response
    expect(result.data.status).toBe("healthy");
    expect(platform.requests.last("functions.invoke").body).toEqual({});
  });

  test("should handle function with complex nested objects", async () => {
    const functionName = "processData";
    const functionData = {
      user: {
        id: "123",
        profile: {
          name: "John Doe",
          preferences: {
            theme: "dark",
            notifications: true,
          },
        },
      },
      settings: {
        timeout: 5000,
        retries: 3,
      },
    };

    platform.given.app(appId).functions.userProcessor();

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);
    expect(platform.requests.last("functions.invoke").body).toEqual(
      functionData,
    );
  });

  test("should handle file uploads with FormData", async () => {
    const functionName = "uploadFile";
    const file = new File(["test content"], "test.txt", { type: "text/plain" });
    const functionData = {
      file: file,
      description: "Test file upload 2",
      category: "documents",
    };

    platform.given.app(appId).functions.fileStore(functionName, "file-789");

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.fileId).toBe("file-789");
    expect(result.data.filename).toBe("test.txt");
    const body = platform.requests.last("functions.invoke")
      .body as MultipartBody;
    expect(body.entries).toContainEqual({
      name: "file",
      file: {
        name: "test.txt",
        type: "text/plain",
        size: 12,
        bytes: [...new TextEncoder().encode("test content")],
      },
    });
  });

  test("should handle mixed data with files and regular data", async () => {
    const functionName = "processDocument";
    const file = new File(["document content"], "document.pdf", {
      type: "application/pdf",
    });
    const functionData = {
      file: file,
      metadata: {
        title: "Important Document",
        author: "Jane Smith",
        tags: ["important", "confidential"],
      },
      priority: "high",
    };

    platform.given
      .app(appId)
      .functions.documentProcessor("doc-123", "document content");

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.documentId).toBe("doc-123");
    expect(result.data.processed).toBe(true);
    const body = platform.requests.last("functions.invoke")
      .body as MultipartBody;
    expect(body.entries).toEqual(
      expect.arrayContaining([
        {
          name: "file",
          file: {
            name: "document.pdf",
            type: "application/pdf",
            size: 16,
            bytes: [...new TextEncoder().encode("document content")],
          },
        },
        { name: "metadata", value: JSON.stringify(functionData.metadata) },
        { name: "priority", value: "high" },
      ]),
    );
  });

  test("should handle FormData input directly", async () => {
    const functionName = "submitForm";
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");
    formData.append("message", "Hello there");

    platform.given
      .app(appId)
      .functions.formSubmissions(functionName, "form-456");

    // Call the function
    const result = await base44.functions.invoke(functionName, formData);

    // Verify the response
    expect(result.data.formId).toBe("form-456");
    expect(result.data.submitted).toBe(true);
    expect(
      (platform.requests.last("functions.invoke").body as MultipartBody)
        .entries,
    ).toEqual([
      { name: "name", value: "John Doe" },
      { name: "email", value: "john@example.com" },
      { name: "message", value: "Hello there" },
    ]);
  });

  test("direct FormData preserves repeated keys, binary files and empty values", async () => {
    const form = new FormData();
    form.append("tag", "one");
    form.append("tag", "two");
    form.append("empty", "");
    form.append(
      "file",
      new File([new Uint8Array([0, 255, 10])], "bytes.bin", {
        type: "application/octet-stream",
      }),
    );
    platform.given.app(appId).functions.uploadAcceptance("upload");
    expect((await base44.functions.invoke("upload", form)).data).toEqual({
      ok: true,
      success: true,
    });
    expect(form.getAll("tag")).toEqual(["one", "two"]);
    expect(
      (platform.requests.last("functions.invoke").body as MultipartBody)
        .entries,
    ).toEqual([
      { name: "tag", value: "one" },
      { name: "tag", value: "two" },
      { name: "empty", value: "" },
      {
        name: "file",
        file: {
          name: "bytes.bin",
          type: "application/octet-stream",
          size: 3,
          bytes: [0, 255, 10],
        },
      },
    ]);
    expect(
      platform.requests.last("functions.invoke").headers["content-type"],
    ).toMatch(/^multipart\/form-data; boundary=/);
  });

  test("should throw error for string input instead of object", async () => {
    const functionName = "processData";

    // Call the function with string input (should throw)
    await expect(
      // @ts-expect-error
      base44.functions.invoke(functionName, "invalid string input"),
    ).rejects.toThrow(
      `Function ${functionName} must receive an object with named parameters, received: invalid string input`,
    );
  });

  test("should handle function names with special characters", async () => {
    const functionName = "process-data_v2";
    const functionData = {
      input: "test data",
    };

    platform.given.app(appId).functions.userProcessor(functionName);

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);
    expect(platform.requests.last("functions.invoke").body).toEqual(
      functionData,
    );
  });

  test("should handle API errors gracefully", async () => {
    const functionName = "failingFunction";
    const functionData = {
      param: "value",
    };

    platform.given.app(appId).faults.functions.internalError(functionName);
    platform.given.app(appId).functions.userProcessor(functionName);

    // Call the function and expect it to throw
    await expect(
      base44.functions.invoke(functionName, functionData),
    ).rejects.toMatchObject({
      message: "Request failed with status code 500",
      response: {
        status: 500,
        data: { error: "Internal server error", code: "INTERNAL_ERROR" },
      },
    });
    expect(platform.requests.last("functions.invoke").body).toEqual(
      functionData,
    );
    await expect(
      base44.functions.invoke(functionName, functionData),
    ).resolves.toMatchObject({ data: { processed: true } });
  });

  test("should handle 404 errors for non-existent functions", async () => {
    const functionName = "nonExistentFunction";
    const functionData = {
      param: "value",
    };

    platform.given.app(appId).faults.functions.notFound(functionName);

    // Call the function and expect it to throw
    await expect(
      base44.functions.invoke(functionName, functionData),
    ).rejects.toMatchObject({
      message: "Request failed with status code 404",
      response: {
        status: 404,
        data: { error: "Function not found", code: "FUNCTION_NOT_FOUND" },
      },
    });
    expect(platform.requests.last("functions.invoke").body).toEqual(
      functionData,
    );
  });

  test("should handle null and undefined values in data", async () => {
    const functionName = "handleNullValues";
    const functionData = {
      stringValue: "test",
      nullValue: null,
      undefinedValue: undefined,
      emptyString: "",
    };

    platform.given.app(appId).functions.inputReceipt(functionName);

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.received).toBe(true);
    expect(platform.requests.last("functions.invoke").body).toEqual({
      stringValue: "test",
      nullValue: null,
      emptyString: "",
    });
  });

  test("should handle array values in data", async () => {
    const functionName = "processArray";
    const functionData = {
      numbers: [1, 2, 3, 4, 5],
      strings: ["a", "b", "c"],
      mixed: [1, "two", { three: 3 }],
    };

    platform.given.app(appId).functions.arrayProcessor(functionName);

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);
    expect(result.data.count).toBe(3);
    expect(platform.requests.last("functions.invoke").body).toEqual(
      functionData,
    );
  });

  test("should create FormData correctly when files are present", async () => {
    const functionName = "uploadFile";
    const file = new File(["test content"], "test.txt", { type: "text/plain" });
    const functionData = {
      file: file,
      description: "Test file upload",
      category: "documents",
    };

    platform.given.app(appId).functions.uploadAcceptance(functionName);

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.success).toBe(true);
    expect(
      (platform.requests.last("functions.invoke").body as MultipartBody)
        .entries,
    ).toContainEqual({ name: "description", value: "Test file upload" });
  });

  test("should create FormData correctly when FormData is passed directly", async () => {
    const functionName = "submitForm";
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");

    platform.given.app(appId).functions.uploadAcceptance(functionName);

    // Call the function
    const result = await base44.functions.invoke(functionName, formData);

    // Verify the response
    expect(result.data.success).toBe(true);
    expect(
      (platform.requests.last("functions.invoke").body as MultipartBody)
        .entries,
    ).toEqual([
      { name: "name", value: "John Doe" },
      { name: "email", value: "john@example.com" },
    ]);
  });

  test("should send user token as Authorization header when invoking functions", async () => {
    const functionName = "testAuth";
    const userToken = "user-test-token";
    const functionData = {
      test: "data",
    };

    // Create client with user token
    const authenticatedBase44 = createClient({
      serverUrl,
      appId,
      token: userToken,
    });

    platform.given.app(appId).functions.authenticatedProbe(functionName);

    // Call the function
    const result = await authenticatedBase44.functions.invoke(
      functionName,
      functionData,
    );

    // Verify the response
    expect(result.data.success).toBe(true);
    expect(result.data.authenticated).toBe(true);
    expect(
      platform.requests.last("functions.invoke").headers.authorization,
    ).toBe(`Bearer ${userToken}`);
    authenticatedBase44.cleanup();
  });

  test("dispatches the same function name to app-scoped registered behavior", async () => {
    const otherAppId = "other-function-app";
    const thirdAppId = "unconfigured-function-app";
    const otherClient = createClient({ serverUrl, appId: otherAppId });
    const unconfiguredClient = createClient({ serverUrl, appId: thirdAppId });
    platform.given.app(appId).functions.serviceHealth("app-a-time");
    platform.given.app(otherAppId).functions.serviceHealth("app-b-time");

    await expect(
      base44.functions.invoke("getStatus", {}),
    ).resolves.toMatchObject({
      data: { status: "healthy", timestamp: "app-a-time" },
    });
    await expect(
      otherClient.functions.invoke("getStatus", {}),
    ).resolves.toMatchObject({
      data: { status: "healthy", timestamp: "app-b-time" },
    });
    await expect(
      unconfiguredClient.functions.invoke("getStatus", {}),
    ).rejects.toMatchObject({
      response: {
        status: 404,
        data: { error: "Function not found", code: "FUNCTION_NOT_FOUND" },
      },
    });
    otherClient.cleanup();
    unconfiguredClient.cleanup();
  });

  test("should fetch function endpoint directly", async () => {
    platform.given.functions.legacyEndpoint("my_function");

    await base44.functions.fetch("/my_function", { method: "GET" });

    expect(platform.requests.last("functions.fetch").url).toBe(
      `${serverUrl}/api/functions/my_function`,
    );
  });

  test("should include Authorization header when using functions.fetch", async () => {
    const userToken = "user-streaming-token";
    const authenticatedBase44 = createClient({
      serverUrl,
      appId,
      token: userToken,
    });

    platform.given.functions.legacyEndpoint("streaming_demo");

    await authenticatedBase44.functions.fetch("streaming_demo", {
      method: "POST",
      body: JSON.stringify({ mode: "text" }),
    });

    const request = platform.requests.last("functions.fetch");
    expect(request.headers.authorization).toBe(`Bearer ${userToken}`);
    expect(request.body).toBe(JSON.stringify({ mode: "text" }));

    authenticatedBase44.cleanup();
  });

  test("should normalize path with and without leading slash", async () => {
    platform.given.functions.legacyEndpoint("my_function");

    await base44.functions.fetch("/my_function");
    await base44.functions.fetch("my_function");

    const calledUrls = platform.requests
      .all("functions.fetch")
      .map((request) => request.url);
    expect(calledUrls).toEqual([
      `${serverUrl}/api/functions/my_function`,
      `${serverUrl}/api/functions/my_function`,
    ]);
  });

  test("should include service role Authorization header when using asServiceRole.functions.fetch", async () => {
    const serviceToken = "service-role-token";
    const serviceRoleBase44 = createClient({ serverUrl, appId, serviceToken });

    platform.given.functions.legacyEndpoint("service_function");

    await serviceRoleBase44.asServiceRole.functions.fetch("/service_function", {
      method: "GET",
    });

    expect(
      platform.requests.last("functions.fetch").headers.authorization,
    ).toBe(`Bearer ${serviceToken}`);

    serviceRoleBase44.cleanup();
  });
});
