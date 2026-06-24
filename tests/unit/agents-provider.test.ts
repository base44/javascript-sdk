import { describe, test, expect, afterEach, vi } from "vitest";
import { openAICompatibleProvider } from "../../src/modules/agents/providers/openai-compatible.ts";

const transportFor = (body: object) => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("openAICompatibleProvider adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  // build a transport bound to the gateway
  const makeModel = async () => {
    const { createGatewayTransport } = await import("../../src/modules/agents/gateway.ts");
    return openAICompatibleProvider(createGatewayTransport({ serverUrl: "https://a.base44.app", getToken: () => "t" }));
  };

  test("system role message is serialized as a leading OpenAI system message", async () => {
    const fetchMock = transportFor({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: {} });
    const model = await makeModel();
    await model.generate({
      model: "gpt_5_mini",
      messages: [
        { role: "system", content: "Be terse." },
        { role: "user", content: "hi" },
      ],
    });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages).toEqual([
      { role: "system", content: "Be terse." },
      { role: "user", content: "hi" },
    ]);
  });

  test("parses tool_calls into ModelToolCall with PARSED object args and forces finishReason 'tool-calls'", async () => {
    transportFor({
      choices: [{
        message: { role: "assistant", content: null, tool_calls: [
          { id: "c1", type: "function", function: { name: "getWeather", arguments: '{"city":"Haifa"}' } },
        ] },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, base44_credits: 1 },
    });
    const model = await makeModel();
    const r = await model.generate({ model: "m", messages: [{ role: "user", content: "weather?" }] });
    expect(r.toolCalls).toEqual([{ id: "c1", name: "getWeather", args: { city: "Haifa" } }]);
    expect(r.finishReason).toBe("tool-calls");
    expect(r.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5, credits: 1 });
    expect(r.text).toBe("");
  });

  test("normalizes finish_reason and serializes a tool result message back to OpenAI shape", async () => {
    const fetchMock = transportFor({ choices: [{ message: { role: "assistant", content: "done" }, finish_reason: "length" }], usage: {} });
    const model = await makeModel();
    const r = await model.generate({
      model: "m",
      messages: [
        { role: "user", content: "go" },
        { role: "assistant", toolCalls: [{ id: "c1", name: "t", args: { x: 1 } }] },
        { role: "tool", toolCallId: "c1", toolName: "t", result: '{"ok":true}' },
      ],
    });
    expect(r.finishReason).toBe("length");
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    // assistant tool call re-serialized with arguments as a JSON STRING
    const asst = sent.messages.find((m: any) => m.role === "assistant");
    expect(asst.tool_calls[0]).toEqual({ id: "c1", type: "function", function: { name: "t", arguments: '{"x":1}' } });
    // tool result keyed by tool_call_id
    const toolMsg = sent.messages.find((m: any) => m.role === "tool");
    expect(toolMsg).toEqual({ role: "tool", tool_call_id: "c1", content: '{"ok":true}' });
  });

  test("history-replay: full system+user+assistant(tool_calls)+tool+user round-trip preserves all roles faithfully", async () => {
    const fetchMock = transportFor({ choices: [{ message: { role: "assistant", content: "sunny" }, finish_reason: "stop" }], usage: {} });
    const model = await makeModel();
    await model.generate({
      model: "m",
      messages: [
        { role: "system", content: "You are a pirate." },
        { role: "user", content: "weather in Haifa?" },
        { role: "assistant", content: undefined, toolCalls: [{ id: "c1", name: "getWeather", args: { city: "Haifa" } }] },
        { role: "tool", toolCallId: "c1", result: '{"tempC":28}' },
        { role: "user", content: "and tomorrow?" },
      ],
    });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Leading system message preserved
    expect(sent.messages[0]).toEqual({ role: "system", content: "You are a pirate." });
    // User message preserved
    expect(sent.messages[1]).toEqual({ role: "user", content: "weather in Haifa?" });
    // Assistant with tool_calls — arguments serialized as JSON string
    const asst = sent.messages[2];
    expect(asst.role).toBe("assistant");
    expect(asst.tool_calls[0].function.arguments).toBe('{"city":"Haifa"}');
    // Tool result keyed by tool_call_id — NOT flattened to user
    const toolMsg = sent.messages[3];
    expect(toolMsg).toEqual({ role: "tool", tool_call_id: "c1", content: '{"tempC":28}' });
    // Final user preserved
    expect(sent.messages[4]).toEqual({ role: "user", content: "and tomorrow?" });
    expect(sent.messages).toHaveLength(5);
  });
});
