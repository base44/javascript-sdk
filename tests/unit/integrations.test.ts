import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";

describe("Core Integrations - InvokeLLM", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
    });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("InvokeLLM should pass model parameter to the API", async () => {
    const params = {
      prompt: "Explain quantum computing",
      model: "gpt_5",
    };

    mockHttp({
      method: "post",
      url:
        serverUrl + `/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`,
      body: params,
      status: 200,
      response: "Quantum computing uses qubits...",
    });

    const result = await base44.integrations.Core.InvokeLLM(params);
    expect(result).toBe("Quantum computing uses qubits...");
  });

  test("InvokeLLM should work without model parameter", async () => {
    const params = {
      prompt: "Explain quantum computing",
    };

    mockHttp({
      method: "post",
      url:
        serverUrl + `/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`,
      body: params,
      status: 200,
      response: "Quantum computing uses qubits...",
    });

    const result = await base44.integrations.Core.InvokeLLM(params);
    expect(result).toBe("Quantum computing uses qubits...");
  });

  test("InvokeLLM should pass model alongside other optional parameters", async () => {
    const params = {
      prompt: "Analyze this text",
      model: "claude_sonnet_4_6" as const,
      response_json_schema: {
        type: "object",
        properties: {
          sentiment: { type: "string" },
        },
      },
    };

    const mockResponse = { sentiment: "positive" };

    mockHttp({
      method: "post",
      url:
        serverUrl + `/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`,
      body: params,
      status: 200,
      response: mockResponse,
    });

    const result = await base44.integrations.Core.InvokeLLM(params);
    expect(result).toEqual(mockResponse);
  });
});
