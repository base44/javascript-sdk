import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveConnection, createGatewayTransport } from "../../src/modules/ai-gateway.ts";
import { Base44Error } from "../../src/index.ts";
import { tool, serializeTools, buildRequestBody } from "../../src/modules/dynamic-agents.ts";

const config = {
  serverUrl: "https://app-1.base44.app",
  getToken: () => "tok-123",
};

describe("ai-gateway transport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("resolveConnection builds the gateway baseURL and apiKey", () => {
    expect(resolveConnection(config)).toEqual({
      baseURL: "https://app-1.base44.app/api/ai/unified/v1",
      apiKey: "tok-123",
    });
  });

  test("complete() POSTs to /chat/completions with bearer auth and returns parsed body", async () => {
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

  test("complete() maps the OpenAI error envelope to a Base44Error", async () => {
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

describe("tool() + serializeTools()", () => {
  test("tool() returns its argument unchanged", () => {
    const t = { description: "d", parameters: { type: "object" }, execute: () => 1 };
    expect(tool(t)).toBe(t);
  });

  test("serializeTools maps to OpenAI function-tool shape", () => {
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

  test("serializeTools returns undefined when there are no tools", () => {
    expect(serializeTools(undefined)).toBeUndefined();
    expect(serializeTools({})).toBeUndefined();
  });
});

describe("buildRequestBody()", () => {
  const messages = [{ role: "user" as const, content: "hi" }];

  test("emits only model and messages by default (temperature omitted)", () => {
    expect(buildRequestBody({ model: "gpt_5_mini" }, messages)).toEqual({
      model: "gpt_5_mini",
      messages,
    });
  });

  test("includes temperature, tool_choice, response_format and tools when set", () => {
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

  test("never emits rejected params even if smuggled in via cast", () => {
    const sneaky = { model: "m", max_tokens: 50, stop: ["x"], top_p: 0.5, seed: 1, n: 2 } as any;
    const body = buildRequestBody(sneaky, messages);
    for (const k of ["max_tokens", "max_completion_tokens", "stop", "top_p", "frequency_penalty", "presence_penalty", "logit_bias", "seed", "n"]) {
      expect(body).not.toHaveProperty(k);
    }
  });
});
