import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createAxiosClient } from "../../src/utils/axios-client.ts";

vi.mock("axios", () => ({
  default: {
    create: vi.fn(),
  },
}));

function createMockClient() {
  return {
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
}

describe("createAxiosClient Deno adapter selection", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.mocked(axios.create).mockReturnValue(mockClient as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function getRequestInterceptor() {
    createAxiosClient({ baseURL: "https://example.com/api" });
    return mockClient.interceptors.request.use.mock.calls[0][0];
  }

  test("uses the fetch adapter for DELETE requests with a body in Deno", () => {
    vi.stubGlobal("Deno", {});
    const intercept = getRequestInterceptor();
    const config = { method: "delete", data: { status: "done" }, headers: new Headers() };

    expect(intercept(config).adapter).toBe("fetch");
  });

  test("keeps the default adapter for bodyless DELETE requests in Deno", () => {
    vi.stubGlobal("Deno", {});
    const intercept = getRequestInterceptor();
    const config = { method: "delete", headers: new Headers() };

    expect(intercept(config).adapter).toBeUndefined();
  });

  test("keeps the default adapter for other request methods in Deno", () => {
    vi.stubGlobal("Deno", {});
    const intercept = getRequestInterceptor();
    const config = { method: "post", data: { title: "new" }, headers: new Headers() };

    expect(intercept(config).adapter).toBeUndefined();
  });

  test("keeps the default adapter outside Deno", () => {
    const intercept = getRequestInterceptor();
    const config = { method: "delete", data: { status: "done" }, headers: new Headers() };

    expect(intercept(config).adapter).toBeUndefined();
  });
});
