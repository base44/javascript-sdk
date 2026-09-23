import { describe, test, expect } from "vitest";
import { createClient, createClientFromRequest } from "../../src/index.ts";

describe("AI Gateway Module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";
  const baseURL = `${serverUrl}/api/apps/${appId}/ai/openai/v1`;
  const typesafeBaseURL = `${serverUrl}/api/apps/${appId}/ai/typesafe/v1`;

  describe("connection", () => {
    test("should default to OpenAI and accept it explicitly", () => {
      const base44 = createClient({ serverUrl, appId });
      expect(base44.aiGateway.connection().baseURL).toBe(baseURL);
      expect(
        base44.aiGateway.connection({ provider: "openai" }).baseURL
      ).toBe(baseURL);
    });

    test("should return the TypeSafe gateway baseURL", () => {
      const base44 = createClient({ serverUrl, appId });
      expect(
        base44.aiGateway.connection({ provider: "typesafe" }).baseURL
      ).toBe(typesafeBaseURL);
    });

    test("should reject unsupported providers", () => {
      const base44 = createClient({ serverUrl, appId });
      expect(() =>
        base44.aiGateway.connection({ provider: "unsupported" } as never)
      ).toThrow("Unsupported AI Gateway provider: unsupported");
    });

    test("should return an empty token when unauthenticated", () => {
      const base44 = createClient({ serverUrl, appId });
      expect(base44.aiGateway.connection().token).toBe("");
    });

    test("should use the user token for TypeSafe when authenticated", () => {
      const base44 = createClient({ serverUrl, appId, token: "user-token" });
      expect(base44.aiGateway.connection({ provider: "typesafe" })).toEqual({
        baseURL: typesafeBaseURL,
        token: "user-token",
      });
    });

    test("should propagate the backend request host and both authentication modes", () => {
      const backendServerUrl = "https://backend.example.com";
      const backendTypesafeBaseURL = `${backendServerUrl}/api/apps/${appId}/ai/typesafe/v1`;
      const request = new Request("https://functions.internal/run", {
        headers: {
          "Base44-App-Id": appId,
          "Base44-Api-Url": backendServerUrl,
          Authorization: "Bearer user-token",
          "Base44-Service-Authorization": "Bearer service-token",
        },
      });
      const base44 = createClientFromRequest(request);
      expect(base44.aiGateway.connection({ provider: "typesafe" })).toEqual({
        baseURL: backendTypesafeBaseURL,
        token: "user-token",
      });
      expect(
        base44.asServiceRole.aiGateway.connection({ provider: "typesafe" })
      ).toEqual({
        baseURL: backendTypesafeBaseURL,
        token: "service-token",
      });
    });

    test("should use the service-role token for TypeSafe via asServiceRole", () => {
      const base44 = createClient({
        serverUrl,
        appId,
        token: "user-token",
        serviceToken: "service-token",
      });
      expect(
        base44.asServiceRole.aiGateway.connection({ provider: "typesafe" })
      ).toEqual({
        baseURL: typesafeBaseURL,
        token: "service-token",
      });
    });
  });
});
