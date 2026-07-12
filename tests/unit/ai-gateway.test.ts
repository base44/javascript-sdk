import { describe, test, expect } from "vitest";
import { createClient, createClientFromRequest } from "../../src/index.ts";

describe("AI Gateway Module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";
  const baseURL = `${serverUrl}/api/apps/${appId}/ai/openai/v1`;

  describe("connection", () => {
    test("should return the OpenAI-compatible gateway baseURL", () => {
      const base44 = createClient({ serverUrl, appId });
      expect(base44.aiGateway.connection().baseURL).toBe(baseURL);
    });

    test("should return an empty token when unauthenticated", () => {
      const base44 = createClient({ serverUrl, appId });
      expect(base44.aiGateway.connection().token).toBe("");
    });

    test("should use the user token when authenticated", () => {
      const base44 = createClient({ serverUrl, appId, token: "user-token" });
      expect(base44.aiGateway.connection()).toEqual({
        baseURL,
        token: "user-token",
      });
    });

    test("should build from the Base44-Api-Url header in backend functions", () => {
      const request = new Request("https://functions.internal/run", {
        headers: {
          "Base44-App-Id": appId,
          "Base44-Api-Url": serverUrl,
          Authorization: "Bearer user-token",
        },
      });
      const base44 = createClientFromRequest(request);
      expect(base44.aiGateway.connection()).toEqual({
        baseURL,
        token: "user-token",
      });
    });

    test("should use the service-role token via asServiceRole", () => {
      const base44 = createClient({
        serverUrl,
        appId,
        token: "user-token",
        serviceToken: "service-token",
      });
      expect(base44.asServiceRole.aiGateway.connection()).toEqual({
        baseURL,
        token: "service-token",
      });
    });
  });
});
