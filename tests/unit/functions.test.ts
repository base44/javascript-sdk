import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.js";

describe("Functions Module", () => {
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  beforeEach(() => {
    // Create a new client for each test
    base44 = createClient({
      serverUrl,
      appId,
    });

    // Create a nock scope for mocking API calls
    scope = nock(serverUrl);

    // Enable request debugging for Nock
    nock.disableNetConnect();
    nock.emitter.on("no match", (req) => {
      console.log(`Nock: No match for ${req.method} ${req.path}`);
      console.log("Headers:", req.getHeaders());
    });
  });

  afterEach(() => {
    // Clean up any pending mocks
    nock.cleanAll();
    nock.emitter.removeAllListeners("no match");
    nock.enableNetConnect();
  });

  test("should call a function with JSON data", async () => {
    const functionName = "sendNotification";
    const functionData = {
      userId: "123",
      message: "Hello World",
      priority: "high",
    };

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, functionData)
      .matchHeader("Content-Type", "application/json")
      .reply(200, {
        success: true,
        messageId: "msg-456",
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.success).toBe(true);
    expect(result.data.messageId).toBe("msg-456");

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should handle function with empty object parameters", async () => {
    const functionName = "getStatus";

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, {})
      .matchHeader("Content-Type", "application/json")
      .reply(200, {
        status: "healthy",
        timestamp: "2024-01-01T00:00:00Z",
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, {});

    // Verify the response
    expect(result.data.status).toBe("healthy");

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
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

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, functionData)
      .matchHeader("Content-Type", "application/json")
      .reply(200, {
        processed: true,
        userId: "123",
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should handle file uploads with FormData", async () => {
    const functionName = "uploadFile";
    const file = new File(["test content"], "test.txt", { type: "text/plain" });
    const functionData = {
      file: file,
      description: "Test file upload 2",
      category: "documents",
    };

    // Mock the API response
    // TODO: Add validation to the request body
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`)
      .matchHeader("Content-Type", /^multipart\/form-data/)
      .reply(() => {
        return [
          200,
          {
            fileId: "file-789",
            filename: "test.txt",
            size: 12,
          },
        ];
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.fileId).toBe("file-789");
    expect(result.data.filename).toBe("test.txt");

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
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

    // Mock the API response
    // TODO: Add validation to the request body
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`)
      .matchHeader("Content-Type", /^multipart\/form-data/)
      .reply(200, {
        documentId: "doc-123",
        processed: true,
        extractedText: "document content",
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.documentId).toBe("doc-123");
    expect(result.data.processed).toBe(true);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should handle FormData input directly", async () => {
    const functionName = "submitForm";
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");
    formData.append("message", "Hello there");

    // Mock the API response
    // TODO: Add validation to the request body
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`)
      .matchHeader("Content-Type", /^multipart\/form-data/)
      .reply(200, {
        formId: "form-456",
        submitted: true,
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, formData);

    // Verify the response
    expect(result.data.formId).toBe("form-456");
    expect(result.data.submitted).toBe(true);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should throw error for string input instead of object", async () => {
    const functionName = "processData";

    // Call the function with string input (should throw)
    await expect(
      // @ts-expect-error
      base44.functions.invoke(functionName, "invalid string input")
    ).rejects.toThrow(
      `Function ${functionName} must receive an object with named parameters, received: invalid string input`
    );
  });

  test("should handle function names with special characters", async () => {
    const functionName = "process-data_v2";
    const functionData = {
      input: "test data",
    };

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, functionData)
      .matchHeader("Content-Type", "application/json")
      .reply(200, {
        processed: true,
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should handle API errors gracefully", async () => {
    const functionName = "failingFunction";
    const functionData = {
      param: "value",
    };

    // Mock the API error response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, functionData)
      .matchHeader("Content-Type", "application/json")
      .reply(500, {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });

    // Call the function and expect it to throw
    await expect(
      base44.functions.invoke(functionName, functionData)
    ).rejects.toThrow();

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should handle 404 errors for non-existent functions", async () => {
    const functionName = "nonExistentFunction";
    const functionData = {
      param: "value",
    };

    // Mock the API 404 response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, functionData)
      .matchHeader("Content-Type", "application/json")
      .reply(404, {
        error: "Function not found",
        code: "FUNCTION_NOT_FOUND",
      });

    // Call the function and expect it to throw
    await expect(
      base44.functions.invoke(functionName, functionData)
    ).rejects.toThrow();

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should handle null and undefined values in data", async () => {
    const functionName = "handleNullValues";
    const functionData = {
      stringValue: "test",
      nullValue: null,
      undefinedValue: undefined,
      emptyString: "",
    };

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, functionData)
      .matchHeader("Content-Type", "application/json")
      .reply(200, {
        received: true,
        values: functionData,
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.received).toBe(true);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should handle array values in data", async () => {
    const functionName = "processArray";
    const functionData = {
      numbers: [1, 2, 3, 4, 5],
      strings: ["a", "b", "c"],
      mixed: [1, "two", { three: 3 }],
    };

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`, functionData)
      .matchHeader("Content-Type", "application/json")
      .reply(200, {
        processed: true,
        count: 3,
      });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);
    expect(result.data.count).toBe(3);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should create FormData correctly when files are present", async () => {
    const functionName = "uploadFile";
    const file = new File(["test content"], "test.txt", { type: "text/plain" });
    const functionData = {
      file: file,
      description: "Test file upload",
      category: "documents",
    };

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`)
      .matchHeader("Content-Type", /^multipart\/form-data/)
      .reply(200, { success: true });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.success).toBe(true);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });

  test("should create FormData correctly when FormData is passed directly", async () => {
    const functionName = "submitForm";
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");

    // Mock the API response
    scope
      .post(`/api/apps/${appId}/functions/${functionName}`)
      .matchHeader("Content-Type", /^multipart\/form-data/)
      .reply(200, { success: true });

    // Call the function
    const result = await base44.functions.invoke(functionName, formData);

    // Verify the response
    expect(result.data.success).toBe(true);

    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });
});
