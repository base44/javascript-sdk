import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient } from "../../src/index.ts";
import * as sdk from "../../src/index.ts";
import { Base44Error } from "../../src/index.ts";
import { resolveConnection, createGatewayTransport } from "../../src/modules/agents/gateway.ts";
import { tool } from "../../src/modules/agents/tool.ts";
import { createAgent } from "../../src/modules/agents/loop.ts";
import { openAICompatibleProvider } from "../../src/modules/agents/providers/openai-compatible.ts";

const config = {
  serverUrl: "https://app-1.base44.app",
  getToken: () => "tok-123",
};

// ---------------------------------------------------------------------------
// Helper: build a mock completion response
// ---------------------------------------------------------------------------

function completion(opts: {
  content?: string | null;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  finish?: string;
  usage?: Record<string, number>;
}) {
  const message: any = { role: "assistant", content: opts.content ?? null };
  if (opts.toolCalls) {
    message.tool_calls = opts.toolCalls.map((c) => ({
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: c.arguments },
    }));
  }
  return new Response(
    JSON.stringify({
      id: "cmpl",
      choices: [{ index: 0, message, finish_reason: opts.finish ?? "stop" }],
      usage: opts.usage ?? { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, base44_credits: 2 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// ---------------------------------------------------------------------------
// AI Gateway transport
// ---------------------------------------------------------------------------

describe("AI Gateway transport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("should build the gateway baseURL and apiKey from config", () => {
    expect(resolveConnection(config)).toEqual({
      baseURL: "https://app-1.base44.app/api/ai/unified/v1",
      apiKey: "tok-123",
    });
  });

  test("should POST to /chat/completions with bearer auth and return parsed body", async () => {
    const body = { model: "gpt_5_mini", messages: [{ role: "user", content: "hi" }] };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "x", choices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const transport = createGatewayTransport(config);
    const result = await transport.complete(body);

    expect(result).toEqual({ id: "x", choices: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app-1.base44.app/api/ai/unified/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  test("should map an OpenAI error envelope to a Base44Error", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "insufficient quota", type: "insufficient_quota", code: null, param: null },
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      )
    );
    const transport = createGatewayTransport(config);
    await expect(transport.complete({ model: "m", messages: [] })).rejects.toMatchObject({
      name: "Base44Error",
      status: 402,
      message: "insufficient quota",
    });
    await expect(transport.complete({ model: "m", messages: [] })).rejects.toBeInstanceOf(Base44Error);
  });
});

// ---------------------------------------------------------------------------
// tool()
// ---------------------------------------------------------------------------

describe("tool()", () => {
  test("should return its argument unchanged", () => {
    const t = { description: "d", parameters: { type: "object" }, execute: () => 1 };
    expect(tool(t)).toBe(t);
  });
});

// ---------------------------------------------------------------------------
// Agent loop (createAgent)
// ---------------------------------------------------------------------------

describe("Agent loop", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("should return text, usage (incl. credits), and finishReason on a no-tool completion", async () => {
    fetchMock.mockResolvedValue(completion({ content: "Hello there." }));
    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "gpt_5_mini", system: "Be terse." }, openAICompatibleProvider(transport));
    const result = await agent.run({ prompt: "Hi" });

    expect(result.text).toBe("Hello there.");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, credits: 2 });
    expect(result.totalUsage).toEqual(result.usage);
    expect(result.steps).toEqual([]);
    // system + user were sent
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: "system", content: "Be terse." },
      { role: "user", content: "Hi" },
    ]);
  });

  test("should execute a tool then continue to a final answer", async () => {
    fetchMock
      .mockResolvedValueOnce(
        completion({ toolCalls: [{ id: "call_1", name: "getWeather", arguments: '{"city":"Haifa"}' }], finish: "tool_calls" })
      )
      .mockResolvedValueOnce(completion({ content: "It's sunny in Haifa." }));

    const execute = vi.fn(async ({ city }: { city: string }) => ({ city, condition: "sunny" }));
    const transport = createGatewayTransport(config);
    const agent = createAgent(
      {
        model: "claude_sonnet_4_6",
        tools: { getWeather: { description: "weather", parameters: { type: "object" }, execute } },
        maxSteps: 4,
      },
      openAICompatibleProvider(transport)
    );
    const result = await agent.run({ prompt: "weather in Haifa?" });

    expect(execute).toHaveBeenCalledWith({ city: "Haifa" });
    expect(result.text).toBe("It's sunny in Haifa.");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].toolResults[0]).toMatchObject({ toolCallId: "call_1", toolName: "getWeather" });
    // second request included the tool result message
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolMsg = secondBody.messages.find((m: any) => m.role === "tool");
    expect(toolMsg.tool_call_id).toBe("call_1");
    expect(JSON.parse(toolMsg.content)).toEqual({ city: "Haifa", condition: "sunny" });
  });

  test("should feed a throwing tool's error back to the model instead of aborting", async () => {
    fetchMock
      .mockResolvedValueOnce(
        completion({ toolCalls: [{ id: "c1", name: "boom", arguments: "{}" }], finish: "tool_calls" })
      )
      .mockResolvedValueOnce(completion({ content: "recovered" }));
    const transport = createGatewayTransport(config);
    const agent = createAgent(
      {
        model: "m",
        tools: { boom: { description: "x", parameters: { type: "object" }, execute: async () => { throw new Error("kaboom"); } } },
      },
      openAICompatibleProvider(transport)
    );
    const result = await agent.run({ prompt: "go" });
    expect(result.text).toBe("recovered");
    const toolMsg = JSON.parse(fetchMock.mock.calls[1][1].body).messages.find((m: any) => m.role === "tool");
    expect(toolMsg.content).toContain("Error: kaboom");
  });

  test("should stop at maxSteps with finishReason 'max_steps'", async () => {
    fetchMock.mockImplementation(() =>
      completion({ toolCalls: [{ id: "c", name: "t", arguments: "{}" }], finish: "tool_calls" })
    );
    const transport = createGatewayTransport(config);
    const agent = createAgent(
      {
        model: "m",
        tools: { t: { description: "x", parameters: { type: "object" }, execute: async () => "ok" } },
        maxSteps: 2,
      },
      openAICompatibleProvider(transport)
    );
    const result = await agent.run({ prompt: "loop" });
    expect(result.finishReason).toBe("max_steps");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("should accept a full messages array as run input", async () => {
    fetchMock.mockResolvedValue(completion({ content: "ok" }));
    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "m" }, openAICompatibleProvider(transport));
    await agent.run({ messages: [{ role: "user", content: "a" }] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: "user", content: "a" }]);
  });

  test("history-replay via run({ messages }): system+tool history preserved faithfully", async () => {
    fetchMock.mockResolvedValue(completion({ content: "28°C" }));
    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "m" }, openAICompatibleProvider(transport));
    await agent.run({
      messages: [
        { role: "system", content: "You are a pirate." },
        { role: "user", content: "weather in Haifa?" },
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "getWeather", arguments: '{"city":"Haifa"}' } }] },
        { role: "tool", tool_call_id: "c1", content: '{"tempC":28}' },
        { role: "user", content: "and tomorrow?" },
      ],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // System message stays as system, not flattened to user
    expect(body.messages[0]).toEqual({ role: "system", content: "You are a pirate." });
    expect(body.messages[1]).toEqual({ role: "user", content: "weather in Haifa?" });
    // Assistant tool_calls re-serialized with arguments as JSON string
    const asst = body.messages[2];
    expect(asst.role).toBe("assistant");
    expect(asst.tool_calls[0].function.arguments).toBe('{"city":"Haifa"}');
    // Tool result keyed by tool_call_id, not flattened to user
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "c1", content: '{"tempC":28}' });
    expect(body.messages[4]).toEqual({ role: "user", content: "and tomorrow?" });
    expect(body.messages).toHaveLength(5);
  });

  test("create({system}).run({prompt}) sends leading system message then user", async () => {
    fetchMock.mockResolvedValue(completion({ content: "aye" }));
    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "m", system: "You are a pirate." }, openAICompatibleProvider(transport));
    await agent.run({ prompt: "hello" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: "system", content: "You are a pirate." });
    expect(body.messages[1]).toEqual({ role: "user", content: "hello" });
    expect(body.messages).toHaveLength(2);
  });

  test("totalUsage sums usage across all model calls; steps[0].usage equals first call's mapped usage", async () => {
    const firstUsage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, base44_credits: 2 };
    const secondUsage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, base44_credits: 2 };
    fetchMock
      .mockResolvedValueOnce(
        completion({ toolCalls: [{ id: "c1", name: "t", arguments: "{}" }], finish: "tool_calls", usage: firstUsage })
      )
      .mockResolvedValueOnce(completion({ content: "done", usage: secondUsage }));

    const transport = createGatewayTransport(config);
    const agent = createAgent(
      { model: "m", tools: { t: { description: "x", parameters: { type: "object" }, execute: async () => "r" } } },
      openAICompatibleProvider(transport)
    );
    const result = await agent.run({ prompt: "go" });

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, credits: 2 });
    expect(result.totalUsage).toEqual({ inputTokens: 20, outputTokens: 10, totalTokens: 30, credits: 4 });
    expect(result.steps[0].usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, credits: 2 });
  });

  test("should execute parallel tool calls (two tool_calls in one completion) and include both role:tool messages in the next request", async () => {
    fetchMock
      .mockResolvedValueOnce(
        completion({
          toolCalls: [
            { id: "c1", name: "toolA", arguments: '{"x":1}' },
            { id: "c2", name: "toolB", arguments: '{"y":2}' },
          ],
          finish: "tool_calls",
        })
      )
      .mockResolvedValueOnce(completion({ content: "all done" }));

    const executeA = vi.fn(async () => "resultA");
    const executeB = vi.fn(async () => "resultB");
    const transport = createGatewayTransport(config);
    const agent = createAgent(
      {
        model: "m",
        tools: {
          toolA: { description: "a", parameters: { type: "object" }, execute: executeA },
          toolB: { description: "b", parameters: { type: "object" }, execute: executeB },
        },
      },
      openAICompatibleProvider(transport)
    );
    const result = await agent.run({ prompt: "go" });

    expect(executeA).toHaveBeenCalledWith({ x: 1 });
    expect(executeB).toHaveBeenCalledWith({ y: 2 });
    expect(result.text).toBe("all done");

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolMsgs = secondBody.messages.filter((m: any) => m.role === "tool");
    expect(toolMsgs).toHaveLength(2);
    expect(toolMsgs.find((m: any) => m.tool_call_id === "c1")).toBeDefined();
    expect(toolMsgs.find((m: any) => m.tool_call_id === "c2")).toBeDefined();
  });

  test("should feed back 'Error: tool \"<name>\" is not available.' when model calls an unknown tool", async () => {
    fetchMock
      .mockResolvedValueOnce(
        completion({ toolCalls: [{ id: "c1", name: "unknownTool", arguments: "{}" }], finish: "tool_calls" })
      )
      .mockResolvedValueOnce(completion({ content: "sorry" }));

    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "m", tools: {} }, openAICompatibleProvider(transport));
    await agent.run({ prompt: "call missing tool" });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolMsg = secondBody.messages.find((m: any) => m.role === "tool");
    expect(toolMsg.content).toBe('Error: tool "unknownTool" is not available.');
  });

  test("should pass string tool result through as-is (not JSON-quoted)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        completion({ toolCalls: [{ id: "c1", name: "tempTool", arguments: "{}" }], finish: "tool_calls" })
      )
      .mockResolvedValueOnce(completion({ content: "done" }));

    const transport = createGatewayTransport(config);
    const agent = createAgent(
      {
        model: "m",
        tools: { tempTool: { description: "t", parameters: { type: "object" }, execute: async () => "hot" } },
      },
      openAICompatibleProvider(transport)
    );
    await agent.run({ prompt: "go" });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolMsg = secondBody.messages.find((m: any) => m.role === "tool");
    expect(toolMsg.content).toBe("hot");
  });

  test("should reject immediately when an already-aborted AbortSignal is passed", async () => {
    const controller = new AbortController();
    controller.abort();

    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      return Promise.resolve(completion({ content: "ok" }));
    });

    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "m" }, openAICompatibleProvider(transport));
    await expect(agent.run({ prompt: "hi" }, { abortSignal: controller.signal })).rejects.toThrow();
  });

  test("getToken late-binding: gateway reads getToken() at call time, not construction time", async () => {
    let currentToken = "v1";
    const transport = createGatewayTransport({
      serverUrl: "https://app-z.base44.app",
      getToken: () => currentToken,
    });
    const provider = openAICompatibleProvider(transport);
    const agent = createAgent({ model: "m" }, provider);

    fetchMock.mockResolvedValue(completion({ content: "ok" }));

    await agent.run({ prompt: "first" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer v1");

    currentToken = "v2";
    await agent.run({ prompt: "second" });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer v2");
  });

  test("no-usage response: totalUsage fields remain numeric (not NaN) after loop", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "cmpl",
          choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
          // no usage field
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "m" }, openAICompatibleProvider(transport));
    const result = await agent.run({ prompt: "hello" });
    // sumUsage defaults undefined to 0, so totalUsage should be numeric
    expect(typeof result.totalUsage.inputTokens).toBe("number");
    expect(typeof result.totalUsage.outputTokens).toBe("number");
    expect(isNaN(result.totalUsage.inputTokens!)).toBe(false);
    expect(isNaN(result.totalUsage.outputTokens!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Public package exports
// ---------------------------------------------------------------------------

describe("Public package exports", () => {
  test("should export tool from the package root", () => {
    expect(typeof sdk.tool).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// base44.agents.create — client wiring
// ---------------------------------------------------------------------------

describe("base44.agents.create — client wiring", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(completion({ content: "agent-ok" }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("should hit the gateway with the user token", async () => {
    const base44 = createClient({ serverUrl: "https://app-y.base44.app", appId: "app-y", token: "user-tok-2" });
    const agent = base44.agents.create({ model: "gpt_5_mini" });
    const result = await agent.run({ prompt: "hello" });

    expect(result.text).toBe("agent-ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app-y.base44.app/api/ai/unified/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer user-tok-2");
  });

  test("should hit the gateway with the service token via asServiceRole", async () => {
    const base44 = createClient({
      serverUrl: "https://app-y.base44.app",
      appId: "app-y",
      token: "user-tok-2",
      serviceToken: "svc-tok-2",
    });
    const agent = base44.asServiceRole.agents.create({ model: "gpt_5_mini" });
    await agent.run({ prompt: "hello" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app-y.base44.app/api/ai/unified/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer svc-tok-2");
  });

  test("should run a full tool-calling loop through the client", async () => {
    fetchMock
      .mockResolvedValueOnce(
        completion({ toolCalls: [{ id: "call_2", name: "ping", arguments: '{"msg":"test"}' }], finish: "tool_calls" })
      )
      .mockResolvedValueOnce(completion({ content: "pong" }));

    const execute = vi.fn(async ({ msg }: { msg: string }) => `pong: ${msg}`);
    const base44 = createClient({ serverUrl: "https://app-y.base44.app", appId: "app-y", token: "user-tok-2" });
    const agent = base44.agents.create({
      model: "claude_sonnet_4_6",
      tools: { ping: { description: "ping tool", parameters: { type: "object" }, execute } },
    });
    const result = await agent.run({ prompt: "ping me" });

    expect(execute).toHaveBeenCalledWith({ msg: "test" });
    expect(result.text).toBe("pong");
    expect(result.steps).toHaveLength(1);
  });
});
