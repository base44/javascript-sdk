import { describe, test, expect, beforeEach, afterEach } from "vitest";
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
  const functionsBase = `${serverUrl}/api/apps/${appId}/functions`;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("should call a function with JSON data", async () => {
    server.use(
      http.post(`${functionsBase}/sendNotification`, () =>
        HttpResponse.json({ success: true, messageId: "msg-456" })
      )
    );

    const result = await base44.functions.invoke("sendNotification", {
      userId: "123",
      message: "Hello World",
      priority: "high",
    });

    expect(result.data.success).toBe(true);
    expect(result.data.messageId).toBe("msg-456");
  });

  test("should handle function with empty object parameters", async () => {
    server.use(
      http.post(`${functionsBase}/getStatus`, () =>
        HttpResponse.json({ status: "healthy", timestamp: "2024-01-01T00:00:00Z" })
      )
    );

    const result = await base44.functions.invoke("getStatus", {});

    expect(result.data.status).toBe("healthy");
  });

  test("should handle function with complex nested objects", async () => {
    server.use(
      http.post(`${functionsBase}/processData`, () =>
        HttpResponse.json({ processed: true, userId: "123" })
      )
    );

    const result = await base44.functions.invoke("processData", {
      user: {
        id: "123",
        profile: { name: "John Doe", preferences: { theme: "dark", notifications: true } },
      },
      settings: { timeout: 5000, retries: 3 },
    });

    expect(result.data.processed).toBe(true);
  });

  test("should handle file uploads with FormData", async () => {
    server.use(
      http.post(`${functionsBase}/uploadFile`, () =>
        HttpResponse.json({ fileId: "file-789", filename: "test.txt", size: 12 })
      )
    );

    const file = new File(["test content"], "test.txt", { type: "text/plain" });
    const result = await base44.functions.invoke("uploadFile", {
      file,
      description: "Test file upload 2",
      category: "documents",
    });

    expect(result.data.fileId).toBe("file-789");
    expect(result.data.filename).toBe("test.txt");
  });

  test("should handle mixed data with files and regular data", async () => {
    server.use(
      http.post(`${functionsBase}/processDocument`, () =>
        HttpResponse.json({ documentId: "doc-123", processed: true, extractedText: "document content" })
      )
    );

    const file = new File(["document content"], "document.pdf", { type: "application/pdf" });
    const result = await base44.functions.invoke("processDocument", {
      file,
      metadata: { title: "Important Document", author: "Jane Smith", tags: ["important", "confidential"] },
      priority: "high",
    });

    expect(result.data.documentId).toBe("doc-123");
    expect(result.data.processed).toBe(true);
  });

  test("should handle FormData input directly", async () => {
    server.use(
      http.post(`${functionsBase}/submitForm`, () =>
        HttpResponse.json({ formId: "form-456", submitted: true })
      )
    );

    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");
    formData.append("message", "Hello there");

    const result = await base44.functions.invoke("submitForm", formData);

    expect(result.data.formId).toBe("form-456");
    expect(result.data.submitted).toBe(true);
  });

  test("should throw error for string input instead of object", async () => {
    await expect(
      // @ts-expect-error
      base44.functions.invoke("processData", "invalid string input")
    ).rejects.toThrow(
      `Function processData must receive an object with named parameters, received: invalid string input`
    );
  });

  test("should handle function names with special characters", async () => {
    server.use(
      http.post(`${functionsBase}/process-data_v2`, () =>
        HttpResponse.json({ processed: true })
      )
    );

    const result = await base44.functions.invoke("process-data_v2", { input: "test data" });

    expect(result.data.processed).toBe(true);
  });

  test("should handle API errors gracefully", async () => {
    server.use(
      http.post(`${functionsBase}/failingFunction`, () =>
        HttpResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 })
      )
    );

    await expect(base44.functions.invoke("failingFunction", { param: "value" })).rejects.toThrow();
  });

  test("should handle 404 errors for non-existent functions", async () => {
    server.use(
      http.post(`${functionsBase}/nonExistentFunction`, () =>
        HttpResponse.json({ error: "Function not found", code: "FUNCTION_NOT_FOUND" }, { status: 404 })
      )
    );

    await expect(base44.functions.invoke("nonExistentFunction", { param: "value" })).rejects.toThrow();
  });

  test("should handle null and undefined values in data", async () => {
    server.use(
      http.post(`${functionsBase}/handleNullValues`, () =>
        HttpResponse.json({ received: true })
      )
    );

    const result = await base44.functions.invoke("handleNullValues", {
      stringValue: "test",
      nullValue: null,
      undefinedValue: undefined,
      emptyString: "",
    });

    expect(result.data.received).toBe(true);
  });

  test("should handle array values in data", async () => {
    server.use(
      http.post(`${functionsBase}/processArray`, () =>
        HttpResponse.json({ processed: true, count: 3 })
      )
    );

    const result = await base44.functions.invoke("processArray", {
      numbers: [1, 2, 3, 4, 5],
      strings: ["a", "b", "c"],
      mixed: [1, "two", { three: 3 }],
    });

    expect(result.data.processed).toBe(true);
    expect(result.data.count).toBe(3);
  });

  test("should create FormData correctly when files are present", async () => {
    server.use(
      http.post(`${functionsBase}/uploadFile`, () =>
        HttpResponse.json({ success: true })
      )
    );

    const file = new File(["test content"], "test.txt", { type: "text/plain" });
    const result = await base44.functions.invoke("uploadFile", {
      file,
      description: "Test file upload",
      category: "documents",
    });

    expect(result.data.success).toBe(true);
  });

  test("should create FormData correctly when FormData is passed directly", async () => {
    server.use(
      http.post(`${functionsBase}/submitForm`, () =>
        HttpResponse.json({ success: true })
      )
    );

    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");

    const result = await base44.functions.invoke("submitForm", formData);

    expect(result.data.success).toBe(true);
  });

  test("should send user token as Authorization header when invoking functions", async () => {
    const userToken = "user-test-token";
    const authenticatedBase44 = createClient({ serverUrl, appId, token: userToken });

    let capturedAuth: string | null = null;
    server.use(
      http.post(`${functionsBase}/testAuth`, ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ success: true, authenticated: true });
      })
    );

    const result = await authenticatedBase44.functions.invoke("testAuth", { test: "data" });

    expect(result.data.success).toBe(true);
    expect(result.data.authenticated).toBe(true);
    expect(capturedAuth).toBe(`Bearer ${userToken}`);

    authenticatedBase44.cleanup();
  });

  test("should fetch function endpoint directly", async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get(`${serverUrl}/api/functions/my_function`, ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse("ok", { status: 200 });
      })
    );

    await base44.functions.fetch("/my_function", { method: "GET" });

    expect(capturedUrl).toBe(`${serverUrl}/api/functions/my_function`);
  });

  test("should include Authorization header when using functions.fetch", async () => {
    const userToken = "user-streaming-token";
    const authenticatedBase44 = createClient({ serverUrl, appId, token: userToken });

    let capturedAuth: string | null = null;
    server.use(
      http.post(`${serverUrl}/api/functions/streaming_demo`, ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return new HttpResponse("ok", { status: 200 });
      })
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
      })
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
      })
    );

    await serviceRoleBase44.asServiceRole.functions.fetch("/service_function", { method: "GET" });

    expect(capturedAuth).toBe(`Bearer ${serviceToken}`);

    serviceRoleBase44.cleanup();
  });
});
