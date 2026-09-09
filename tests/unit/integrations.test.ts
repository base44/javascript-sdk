import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform/index.ts";

describe("Core Integrations - InvokeLLM", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";
  beforeEach(() => {
    base44 = createClient({ serverUrl: "https://base44.app", appId });
  });
  afterEach(() => base44.cleanup());

  test("passes model parameter to the API", async () => {
    platform.given
      .app(appId)
      .integrations.llmResponds("Quantum computing uses qubits...");
    const params = { prompt: "Explain quantum computing", model: "gpt_5" };
    await expect(base44.integrations.Core.InvokeLLM(params)).resolves.toBe(
      "Quantum computing uses qubits...",
    );
    expect(platform.requests.last("integrations.invoke").body).toEqual(params);
  });

  test("works without model parameter", async () => {
    platform.given
      .app(appId)
      .integrations.llmResponds("Quantum computing uses qubits...");
    const params = { prompt: "Explain quantum computing" };
    await expect(base44.integrations.Core.InvokeLLM(params)).resolves.toBe(
      "Quantum computing uses qubits...",
    );
    expect(platform.requests.last("integrations.invoke").body).toEqual(params);
  });

  test("passes model alongside other optional parameters", async () => {
    const response = { sentiment: "positive" };
    platform.given.app(appId).integrations.llmResponds(response);
    const params = {
      prompt: "Analyze this text",
      model: "claude_sonnet_4_6" as const,
      response_json_schema: {
        type: "object",
        properties: { sentiment: { type: "string" } },
      },
    };
    await expect(base44.integrations.Core.InvokeLLM(params)).resolves.toEqual(
      response,
    );
    expect(platform.requests.last("integrations.invoke").body).toEqual(params);
  });
});
