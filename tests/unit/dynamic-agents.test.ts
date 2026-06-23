import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveConnection, createGatewayTransport } from "../../src/modules/ai-gateway.ts";
import { Base44Error } from "../../src/index.ts";

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
