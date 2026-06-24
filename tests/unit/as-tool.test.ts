import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient } from "../../src/index.ts";

const opts = { serverUrl: "https://a.base44.app", appId: "a", token: "t" };

function reply(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage: {} }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// ---------------------------------------------------------------------------
// functions.asTool
// ---------------------------------------------------------------------------

describe("functions.asTool", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  test("should wrap invoke(name, args) with a supplied description and parameters", async () => {
    // functions module uses axios, not fetch — mock axios post via the function endpoint.
    const nock = (await import("nock")).default;
    const scope = nock("https://a.base44.app")
      .post("/api/apps/a/functions/sendOrderEmail", { orderId: "o1" })
      .reply(200, { sent: true });

    const base44 = createClient(opts);
    const t = base44.functions.asTool("sendOrderEmail", {
      description: "Email the customer an update.",
      parameters: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
    });

    expect(t.description).toBe("Email the customer an update.");
    expect(t.parameters).toEqual({ type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] });
    const out = await t.execute({ orderId: "o1" });
    expect(out).toEqual({ sent: true });
    scope.done();
  });

  test("should default parameters to an open object when omitted", () => {
    const base44 = createClient(opts);
    const t = base44.functions.asTool("anyFn", { description: "d" });
    expect(t.parameters).toEqual({ type: "object", properties: {}, additionalProperties: true });
  });
});

// ---------------------------------------------------------------------------
// Agent.asTool
// ---------------------------------------------------------------------------

describe("Agent.asTool", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  test("should produce a prompt-only tool that runs the sub-agent and returns its text", async () => {
    const base44 = createClient(opts);
    const sub = base44.agents.create({ model: "gpt_5_mini", system: "weather bot" });
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
