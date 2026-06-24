import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient } from "../../src/index.ts";
import * as sdk from "../../src/index.ts";
import { Base44Error } from "../../src/index.ts";
import { resolveConnection, createGatewayTransport } from "../../src/modules/agents/gateway.ts";
import { tool, serializeTools } from "../../src/modules/agents/tool.ts";
import { buildRequestBody, createAgent } from "../../src/modules/agents/loop.ts";

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
// tool() + serializeTools()
// ---------------------------------------------------------------------------

describe("tool() + serializeTools()", () => {
  test("should return its argument unchanged", () => {
    const t = { description: "d", parameters: { type: "object" }, execute: () => 1 };
    expect(tool(t)).toBe(t);
  });

  test("should map to OpenAI function-tool shape", () => {
    const getWeather = {
      description: "Get weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      execute: async () => ({}),
    };
    expect(serializeTools({ getWeather })).toEqual([
      {
        type: "function",
        function: {
          name: "getWeather",
          description: "Get weather",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      },
    ]);
  });

  test("should return undefined when there are no tools", () => {
    expect(serializeTools(undefined)).toBeUndefined();
    expect(serializeTools({})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildRequestBody()
// ---------------------------------------------------------------------------

describe("buildRequestBody()", () => {
  const messages = [{ role: "user" as const, content: "hi" }];

  test("should emit only model and messages by default (temperature omitted)", () => {
    expect(buildRequestBody({ model: "gpt_5_mini" }, messages)).toEqual({
      model: "gpt_5_mini",
      messages,
    });
  });

  test("should include temperature, tool_choice, response_format and tools when set", () => {
    const body = buildRequestBody(
      {
        model: "claude_sonnet_4_6",
        temperature: 0.3,
        toolChoice: "auto",
        responseFormat: { type: "object", properties: { a: { type: "string" } } },
        tools: { t: { description: "d", parameters: { type: "object" }, execute: () => 1 } },
      },
      messages
    );
    expect(body.temperature).toBe(0.3);
    expect(body.tool_choice).toBe("auto");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "response", schema: { type: "object", properties: { a: { type: "string" } } }, strict: true },
    });
    expect(Array.isArray(body.tools)).toBe(true);
  });

  test("should never emit rejected params even if smuggled in via cast", () => {
    const sneaky = { model: "m", max_tokens: 50, stop: ["x"], top_p: 0.5, seed: 1, n: 2 } as any;
    const body = buildRequestBody(sneaky, messages);
    for (const k of ["max_tokens", "max_completion_tokens", "stop", "top_p", "frequency_penalty", "presence_penalty", "logit_bias", "seed", "n"]) {
      expect(body).not.toHaveProperty(k);
    }
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
    const agent = createAgent({ model: "gpt_5_mini", system: "Be terse." }, transport);
    const result = await agent.run({ prompt: "Hi" });

    expect(result.text).toBe("Hello there.");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, credits: 2 });
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
      transport
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
      transport
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
      transport
    );
    const result = await agent.run({ prompt: "loop" });
    expect(result.finishReason).toBe("max_steps");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("should accept a full messages array as run input", async () => {
    fetchMock.mockResolvedValue(completion({ content: "ok" }));
    const transport = createGatewayTransport(config);
    const agent = createAgent({ model: "m" }, transport);
    await agent.run({ messages: [{ role: "user", content: "a" }] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: "user", content: "a" }]);
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
