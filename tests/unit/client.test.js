import {
  createClient as newClient,
  createClientFromRequest as newClientFromRequest,
} from "../../src/index.ts";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { platform } from "../mocks/platform";

const clients = [];
const createClient = (...args) => {
  const client = newClient(...args);
  clients.push(client);
  return client;
};
const createClientFromRequest = (...args) => {
  const client = newClientFromRequest(...args);
  clients.push(client);
  return client;
};
beforeEach(() => platform.reset());
afterEach(() => {
  for (const client of clients.splice(0)) client.cleanup();
});

describe("Client Creation", () => {
  test("should create a client with default options", () => {
    const client = createClient({
      appId: "test-app-id",
    });

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.analytics).toBeDefined();

    const config = client.getConfig();
    expect(config.appId).toBe("test-app-id");
    expect(config.serverUrl).toBe("https://base44.app");
    expect(config.requiresAuth).toBe(false);

    // Should throw error when accessing asServiceRole without service token
    expect(() => client.asServiceRole).toThrow(
      "Service token is required to use asServiceRole. Please provide a serviceToken when creating the client.",
    );
  });

  test("should create a client with custom options", () => {
    const client = createClient({
      appId: "test-app-id",
      serverUrl: "https://custom-server.com",
      requiresAuth: true,
      token: "test-token",
    });

    expect(client).toBeDefined();

    const config = client.getConfig();
    expect(config.appId).toBe("test-app-id");
    expect(config.serverUrl).toBe("https://custom-server.com");
    expect(config.requiresAuth).toBe(true);
  });

  test("should create a client with service token", () => {
    const client = createClient({
      appId: "test-app-id",
      serviceToken: "service-token-123",
    });

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
    expect(client.asServiceRole.entities).toBeDefined();
    expect(client.asServiceRole.integrations).toBeDefined();
    expect(client.asServiceRole.functions).toBeDefined();
    // Service role should not have auth module
    expect(client.asServiceRole.auth).toBeUndefined();
  });

  test("should create a client with both user token and service token", () => {
    const client = createClient({
      appId: "test-app-id",
      token: "user-token-123",
      serviceToken: "service-token-123",
      requiresAuth: true,
    });

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
    expect(client.asServiceRole.entities).toBeDefined();
    expect(client.asServiceRole.integrations).toBeDefined();
    expect(client.asServiceRole.functions).toBeDefined();
    expect(client.asServiceRole.auth).toBeUndefined();
  });
});

describe("appBaseUrl Normalization", () => {
  test("should use appBaseUrl when provided as a string", () => {
    const customAppBaseUrl = "https://custom-app.example.com";
    const client = createClient({
      appId: "test-app-id",
      appBaseUrl: customAppBaseUrl,
    });

    // Mock window.location
    const originalWindow = global.window;
    const mockLocation = { href: "", origin: "https://current-app.com" };
    global.window = {
      location: mockLocation,
    };

    const nextUrl = "https://example.com/dashboard";
    client.auth.redirectToLogin(nextUrl);

    // Verify the redirect URL uses the custom appBaseUrl
    expect(mockLocation.href).toBe(
      `${customAppBaseUrl}/login?from_url=${encodeURIComponent(nextUrl)}`,
    );

    // Restore window
    global.window = originalWindow;
  });

  test("should normalize appBaseUrl to empty string when not provided", () => {
    const client = createClient({
      appId: "test-app-id",
      // appBaseUrl not provided
    });

    // Mock window.location
    const originalWindow = global.window;
    const mockLocation = { href: "", origin: "https://current-app.com" };
    global.window = {
      location: mockLocation,
    };

    const nextUrl = "https://example.com/dashboard";
    client.auth.redirectToLogin(nextUrl);

    // Verify the redirect URL uses empty string (relative path)
    expect(mockLocation.href).toBe(
      `/login?from_url=${encodeURIComponent(nextUrl)}`,
    );

    // Restore window
    global.window = originalWindow;
  });
});

describe("createClientFromRequest", () => {
  test("should create client from request with all headers", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer user-token-123",
            "Base44-Service-Authorization": "Bearer service-token-123",
            "Base44-App-Id": "test-app-id",
            "Base44-Api-Url": "https://custom-server.com",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    expect(client.entities).toBeDefined();
    expect(client.integrations).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();

    const config = client.getConfig();
    expect(config.appId).toBe("test-app-id");
    expect(config.serverUrl).toBe("https://custom-server.com");
  });

  test("should create client from request with minimal headers", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            "Base44-App-Id": "minimal-app-id",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.appId).toBe("minimal-app-id");
    expect(config.serverUrl).toBe("https://base44.app"); // Default value
  });

  test("should create client with only user token", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer user-only-token",
            "Base44-App-Id": "user-app-id",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    // Should throw error when accessing asServiceRole without service token
    expect(() => client.asServiceRole).toThrow(
      "Service token is required to use asServiceRole. Please provide a serviceToken when creating the client.",
    );
  });

  test("should create client with only service token", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            "Base44-Service-Authorization": "Bearer service-only-token",
            "Base44-App-Id": "service-app-id",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.asServiceRole).toBeDefined();
  });

  test("should throw error when Base44-App-Id header is missing", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer some-token",
          };
          return headers[name] || null;
        },
      },
    };

    expect(() => createClientFromRequest(mockRequest)).toThrow(
      "Base44-App-Id header is required, but is was not found on the request",
    );
  });

  test("should throw error for malformed authorization headers", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "InvalidFormat",
            "Base44-Service-Authorization": "AlsoInvalid",
            "Base44-App-Id": "test-app-id",
          };
          return headers[name] || null;
        },
      },
    };

    // Should throw error for malformed headers instead of continuing silently
    expect(() => createClientFromRequest(mockRequest)).toThrow(
      'Invalid authorization header format. Expected "Bearer <token>"',
    );
  });

  test("should throw error for empty authorization headers", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "",
            "Base44-Service-Authorization": "",
            "Base44-App-Id": "test-app-id",
          };
          return headers[name] === "" ? "" : headers[name] || null;
        },
      },
    };

    // Should throw error for empty headers instead of continuing silently
    expect(() => createClientFromRequest(mockRequest)).toThrow(
      'Invalid authorization header format. Expected "Bearer <token>"',
    );
  });

  test("should propagate Base44-State header when present", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            "Base44-App-Id": "test-app-id",
            "Base44-State": "192.168.1.100",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.appId).toBe("test-app-id");
  });

  test("should work without Base44-State header", () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            "Base44-App-Id": "test-app-id",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    expect(client).toBeDefined();
    const config = client.getConfig();
    expect(config.appId).toBe("test-app-id");
  });
});

describe("Service Role Authorization Headers", () => {
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  test("should use user token for regular client operations and service token for service role operations", async () => {
    const userToken = "user-token-123";
    const serviceToken = "service-token-456";

    const client = createClient({
      serverUrl,
      appId,
      token: userToken,
      serviceToken: serviceToken,
    });

    platform.given.app(appId).entities.records("Todo", []);

    // Make requests
    await client.entities.Todo.list();
    await client.asServiceRole.entities.Todo.list();
    const requests = platform.requests.all("entities.list");
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      `Bearer ${userToken}`,
      `Bearer ${serviceToken}`,
    ]);
  });

  test("should use service token for service role entities operations", async () => {
    const serviceToken = "service-token-only-123";

    const client = createClient({
      serverUrl,
      appId,
      serviceToken: serviceToken,
    });

    platform.given
      .app(appId)
      .entities.records("User", [{ id: "123", name: "Test User" }]);

    // Make request
    const result = await client.asServiceRole.entities.User.get("123");

    // Verify response
    expect(result.id).toBe("123");
    expect(result.name).toBe("Test User");
    expect(platform.requests.last("entities.get").headers.authorization).toBe(
      `Bearer ${serviceToken}`,
    );
  });

  test("should use service token for service role integrations operations", async () => {
    const serviceToken = "service-token-integration-456";

    const client = createClient({
      serverUrl,
      appId,
      serviceToken: serviceToken,
    });

    platform.given.app(appId).integrations.emailDelivered("123");

    // Make request
    const result = await client.asServiceRole.integrations.Core.SendEmail({
      to: "test@example.com",
      subject: "Test",
      body: "Test message",
    });

    // Verify response
    expect(result.success).toBe(true);
    expect(result.messageId).toBe("123");
    expect(
      platform.requests.last("integrations.invoke").headers.authorization,
    ).toBe(`Bearer ${serviceToken}`);
  });

  test("should use service token for service role functions operations", async () => {
    const serviceToken = "service-token-functions-789";

    const client = createClient({
      serverUrl,
      appId,
      serviceToken: serviceToken,
    });

    platform.given.app(appId).functions.serviceExecution("testFunction");

    // Make request
    const result = await client.asServiceRole.functions.invoke("testFunction", {
      param: "test",
    });

    // Verify response
    expect(result.data.result).toBe("function executed");
    expect(platform.requests.last("functions.invoke")).toMatchObject({
      body: { param: "test" },
      headers: { authorization: `Bearer ${serviceToken}` },
    });
  });

  test("should use user token for regular operations when both tokens are present", async () => {
    const userToken = "user-token-regular-123";
    const serviceToken = "service-token-regular-456";

    const client = createClient({
      serverUrl,
      appId,
      token: userToken,
      serviceToken: serviceToken,
    });

    platform.given
      .app(appId)
      .entities.records("Task", [{ id: "task1", title: "User Task" }]);
    platform.given.app(appId).integrations.emailDelivered("email123");

    // Make requests using regular client (not service role)
    const taskResult = await client.entities.Task.list();
    const emailResult = await client.integrations.Core.SendEmail({
      to: "user@example.com",
      subject: "User Test",
      body: "User message",
    });

    // Verify responses
    expect(taskResult[0].title).toBe("User Task");
    expect(emailResult.success).toBe(true);
    expect(emailResult.messageId).toBe("email123");
    expect(platform.requests.last("entities.list").headers.authorization).toBe(
      `Bearer ${userToken}`,
    );
    expect(
      platform.requests.last("integrations.invoke").headers.authorization,
    ).toBe(`Bearer ${userToken}`);
  });

  test("should work without authorization header when no tokens are provided", async () => {
    const client = createClient({
      serverUrl,
      appId,
    });

    platform.given
      .app(appId)
      .entities.records("PublicData", [{ id: "public1", data: "public" }]);

    // Make request
    const result = await client.entities.PublicData.list();

    // Verify response
    expect(result[0].data).toBe("public");
    expect(
      platform.requests.last("entities.list").headers.authorization,
    ).toBeUndefined();
  });

  test("should propagate Base44-State header in API requests when created from request", async () => {
    const clientIp = "192.168.1.100";

    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer user-token-123",
            "Base44-App-Id": appId,
            "Base44-Api-Url": serverUrl,
            "Base44-State": clientIp,
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    platform.given.app(appId).entities.records("Todo", []);

    // Make request
    await client.entities.Todo.list();
    expect(platform.requests.last("entities.list").headers).toMatchObject({
      authorization: "Bearer user-token-123",
      "base44-state": clientIp,
    });
  });

  test("should propagate X-Data-Env header on user-scoped API requests when created from request", async () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer user-token-123",
            "Base44-App-Id": appId,
            "Base44-Api-Url": serverUrl,
            "X-Data-Env": "dev",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    platform.given.app(appId).entities.records("Todo", []);

    await client.entities.Todo.list();
    expect(platform.requests.last("entities.list").headers).toMatchObject({
      authorization: "Bearer user-token-123",
      "x-data-env": "dev",
    });
  });

  test("should not forward an X-Data-Env value outside the dev/prod set", async () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer user-token-123",
            "Base44-App-Id": appId,
            "Base44-Api-Url": serverUrl,
            "X-Data-Env": "evil",
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    platform.given.app(appId).entities.records("Todo", []);

    await client.entities.Todo.list();
    const headers = platform.requests.last("entities.list").headers;
    expect(headers.authorization).toBe("Bearer user-token-123");
    expect(headers["x-data-env"]).toBeUndefined();
  });

  test("should not include X-Data-Env header when not present in original request", async () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer user-token-123",
            "Base44-App-Id": appId,
            "Base44-Api-Url": serverUrl,
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    platform.given.app(appId).entities.records("Todo", []);

    await client.entities.Todo.list();
    const headers = platform.requests.last("entities.list").headers;
    expect(headers.authorization).toBe("Bearer user-token-123");
    expect(headers["x-data-env"]).toBeUndefined();
  });

  test("should not include Base44-State header when not present in original request", async () => {
    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            Authorization: "Bearer user-token-123",
            "Base44-App-Id": appId,
            "Base44-Api-Url": serverUrl,
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    platform.given.app(appId).entities.records("Todo", []);

    // Make request
    await client.entities.Todo.list();
    const headers = platform.requests.last("entities.list").headers;
    expect(headers.authorization).toBe("Bearer user-token-123");
    expect(headers["base44-state"]).toBeUndefined();
  });

  test("should propagate Base44-State header in service role API requests", async () => {
    const clientIp = "10.0.0.50";

    const mockRequest = {
      headers: {
        get: (name) => {
          const headers = {
            "Base44-Service-Authorization": "Bearer service-token-123",
            "Base44-App-Id": appId,
            "Base44-Api-Url": serverUrl,
            "Base44-State": clientIp,
          };
          return headers[name] || null;
        },
      },
    };

    const client = createClientFromRequest(mockRequest);

    platform.given
      .app(appId)
      .entities.records("User", [{ id: "123", name: "Test User" }]);

    // Make request using service role
    const result = await client.asServiceRole.entities.User.get("123");

    // Verify response
    expect(result.id).toBe("123");
    expect(platform.requests.last("entities.get").headers).toMatchObject({
      authorization: "Bearer service-token-123",
      "base44-state": clientIp,
    });
  });
});
