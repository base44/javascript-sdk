// tests/unit/as-tool.test.ts
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient } from "../../src/index.ts";

const opts = { serverUrl: "https://a.base44.app", appId: "a", token: "t" };

function reply(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage: {} }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("Agent.asTool", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  test("produces a prompt-only tool that runs the sub-agent and returns its text", async () => {
    const base44 = createClient(opts);
    const sub = base44.dynamicAgents.create({ model: "gpt_5_mini", system: "weather bot" });
    const t = sub.asTool({ name: "weather", description: "Get the weather for a city." });

    expect(t.description).toBe("Get the weather for a city.");
    expect(t.parameters).toEqual({
      type: "object",
      properties: { prompt: { type: "string", description: "What to ask the sub-agent." } },
      required: ["prompt"],
    });

    fetchMock.mockResolvedValue(reply("Sunny in Haifa."));
    const out = await t.execute({ prompt: "weather in Haifa" });
    expect(out).toBe("Sunny in Haifa.");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toContainEqual({ role: "user", content: "weather in Haifa" });
  });
});
