import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
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

    // Mock the API response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [["Content-Type", "application/json"]],
      status: 200,
      response: {
        success: true,
        messageId: "msg-456",
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.success).toBe(true);
    expect(result.data.messageId).toBe("msg-456");
  });

  test("should handle function with empty object parameters", async () => {
    const functionName = "getStatus";

    // Mock the API response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: {},
      headers: [["Content-Type", "application/json"]],
      status: 200,
      response: {
        status: "healthy",
        timestamp: "2024-01-01T00:00:00Z",
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, {});

    // Verify the response
    expect(result.data.status).toBe("healthy");
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
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [["Content-Type", "application/json"]],
      status: 200,
      response: {
        processed: true,
        userId: "123",
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);
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
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      headers: [["Content-Type", /^multipart\/form-data/]],
      inspect: async (request) => {
        const form = await request.formData();
        const file = form.get("file") as File;
        expect(file.name).toBe("test.txt");
        expect(file.type).toBe("text/plain");
        expect(await file.text()).toBe("test content");
      },
      respond: () => {
        return [
          200,
          {
            fileId: "file-789",
            filename: "test.txt",
            size: 12,
          },
        ];
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.fileId).toBe("file-789");
    expect(result.data.filename).toBe("test.txt");
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
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      headers: [["Content-Type", /^multipart\/form-data/]],
      inspect: async (request) => {
        const form = await request.formData();
        const file = form.get("file") as File;
        expect(file.name).toBe("document.pdf");
        expect(file.type).toBe("application/pdf");
        expect(await file.text()).toBe("document content");
        expect(JSON.parse(form.get("metadata") as string)).toEqual(
          functionData.metadata,
        );
        expect(form.get("priority")).toBe("high");
      },
      status: 200,
      response: {
        documentId: "doc-123",
        processed: true,
        extractedText: "document content",
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.documentId).toBe("doc-123");
    expect(result.data.processed).toBe(true);
  });

  test("should handle FormData input directly", async () => {
    const functionName = "submitForm";
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");
    formData.append("message", "Hello there");

    // Mock the API response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      headers: [["Content-Type", /^multipart\/form-data/]],
      inspect: async (request) => {
        expect(Object.fromEntries(await request.formData())).toEqual({
          name: "John Doe",
          email: "john@example.com",
          message: "Hello there",
        });
      },
      status: 200,
      response: {
        formId: "form-456",
        submitted: true,
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, formData);

    // Verify the response
    expect(result.data.formId).toBe("form-456");
    expect(result.data.submitted).toBe(true);
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
    mockHttp({
      method: "post",
      url: `${serverUrl}/api/apps/${appId}/functions/upload`,
      response: { ok: true },
      inspect: async (request) => {
        const actual = await request.formData();
        expect(actual.getAll("tag")).toEqual(["one", "two"]);
        expect(actual.get("empty")).toBe("");
        const file = actual.get("file") as File;
        expect(file.name).toBe("bytes.bin");
        expect(file.type).toBe("application/octet-stream");
        expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
          0, 255, 10,
        ]);
      },
    });
    expect((await base44.functions.invoke("upload", form)).data).toEqual({
      ok: true,
    });
    expect(form.getAll("tag")).toEqual(["one", "two"]);
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

    // Mock the API response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [["Content-Type", "application/json"]],
      status: 200,
      response: {
        processed: true,
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);
  });

  test("should handle API errors gracefully", async () => {
    const functionName = "failingFunction";
    const functionData = {
      param: "value",
    };

    // Mock the API error response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [["Content-Type", "application/json"]],
      status: 500,
      response: {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      },
    });

    // Call the function and expect it to throw
    await expect(
      base44.functions.invoke(functionName, functionData),
    ).rejects.toThrow();
  });

  test("should handle 404 errors for non-existent functions", async () => {
    const functionName = "nonExistentFunction";
    const functionData = {
      param: "value",
    };

    // Mock the API 404 response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [["Content-Type", "application/json"]],
      status: 404,
      response: {
        error: "Function not found",
        code: "FUNCTION_NOT_FOUND",
      },
    });

    // Call the function and expect it to throw
    await expect(
      base44.functions.invoke(functionName, functionData),
    ).rejects.toThrow();
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
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [["Content-Type", "application/json"]],
      status: 200,
      response: {
        received: true,
        values: functionData,
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.received).toBe(true);
  });

  test("should handle array values in data", async () => {
    const functionName = "processArray";
    const functionData = {
      numbers: [1, 2, 3, 4, 5],
      strings: ["a", "b", "c"],
      mixed: [1, "two", { three: 3 }],
    };

    // Mock the API response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [["Content-Type", "application/json"]],
      status: 200,
      response: {
        processed: true,
        count: 3,
      },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.processed).toBe(true);
    expect(result.data.count).toBe(3);
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
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      headers: [["Content-Type", /^multipart\/form-data/]],
      status: 200,
      response: { success: true },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, functionData);

    // Verify the response
    expect(result.data.success).toBe(true);
  });

  test("should create FormData correctly when FormData is passed directly", async () => {
    const functionName = "submitForm";
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");

    // Mock the API response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      headers: [["Content-Type", /^multipart\/form-data/]],
      status: 200,
      response: { success: true },
    });

    // Call the function
    const result = await base44.functions.invoke(functionName, formData);

    // Verify the response
    expect(result.data.success).toBe(true);
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

    // Mock the API response, verifying the Authorization header
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/functions/${functionName}`,
      body: functionData,
      headers: [
        ["Content-Type", "application/json"],
        ["Authorization", `Bearer ${userToken}`],
      ],
      status: 200,
      response: {
        success: true,
        authenticated: true,
      },
    });

    // Call the function
    const result = await authenticatedBase44.functions.invoke(
      functionName,
      functionData,
    );

    // Verify the response
    expect(result.data.success).toBe(true);
    expect(result.data.authenticated).toBe(true);
  });

  test("should fetch function endpoint directly", async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get(`${serverUrl}/api/functions/my_function`, ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse("ok", { status: 200 });
      }),
    );

    await base44.functions.fetch("/my_function", { method: "GET" });

    expect(capturedUrl).toBe(`${serverUrl}/api/functions/my_function`);
  });

  test("should include Authorization header when using functions.fetch", async () => {
    const userToken = "user-streaming-token";
    const authenticatedBase44 = createClient({
      serverUrl,
      appId,
      token: userToken,
    });

    let capturedAuth: string | null = null;
    server.use(
      http.post(`${serverUrl}/api/functions/streaming_demo`, ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return new HttpResponse("ok", { status: 200 });
      }),
    );

    await authenticatedBase44.functions.fetch("streaming_demo", {
      method: "POST",
      body: JSON.stringify({ mode: "text" }),
    });

    expect(capturedAuth).toBe(`Bearer ${userToken}`);

    authenticatedBase44.cleanup();
  });

  test("should normalize path with and without leading slash", async () => {
    const calledUrls: string[] = [];
    server.use(
      http.get(`${serverUrl}/api/functions/my_function`, ({ request }) => {
        calledUrls.push(request.url);
        return new HttpResponse("ok", { status: 200 });
      }),
    );

    await base44.functions.fetch("/my_function");
    await base44.functions.fetch("my_function");

    expect(calledUrls).toHaveLength(2);
    expect(calledUrls[0]).toBe(`${serverUrl}/api/functions/my_function`);
    expect(calledUrls[1]).toBe(`${serverUrl}/api/functions/my_function`);
  });

  test("should include service role Authorization header when using asServiceRole.functions.fetch", async () => {
    const serviceToken = "service-role-token";
    const serviceRoleBase44 = createClient({ serverUrl, appId, serviceToken });

    let capturedAuth: string | null = null;
    server.use(
      http.get(`${serverUrl}/api/functions/service_function`, ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return new HttpResponse("ok", { status: 200 });
      }),
    );

    await serviceRoleBase44.asServiceRole.functions.fetch("/service_function", {
      method: "GET",
    });

    expect(capturedAuth).toBe(`Bearer ${serviceToken}`);

    serviceRoleBase44.cleanup();
  });
});
