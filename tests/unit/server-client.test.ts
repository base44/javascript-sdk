import { describe, test, expect, beforeEach, vi } from "vitest";
import { createServerClient } from "../../src/index.ts";
import { createAxiosClient } from "../../src/utils/axios-client.ts";

vi.mock("../../src/utils/axios-client.ts", () => ({
  createAxiosClient: vi.fn(() => ({ request: vi.fn() })),
}));

// createClient builds four axios clients, in this order
const MAIN_CLIENT_CALL = 0;
const FUNCTIONS_CLIENT_CALL = 1;
const SERVICE_ROLE_CLIENT_CALL = 2;

const axiosClientArgs = (callIndex: number) =>
  vi.mocked(createAxiosClient).mock.calls[callIndex][0];

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request("https://my-app.example.com/some/page", { headers });

describe("createServerClient", () => {
  beforeEach(() => {
    vi.mocked(createAxiosClient).mockClear();
  });

  test("resolves config from explicit options over env and request headers", () => {
    const request = makeRequest({
      Authorization: "Bearer header-token",
      "Base44-Service-Authorization": "Bearer header-service-token",
      "Base44-App-Id": "header-app-id",
      "Base44-Api-Url": "https://header.example.com",
      "Base44-Functions-Version": "header-functions-version",
      Cookie: "base44_access_token=cookie-token",
    });

    const client = createServerClient({
      request,
      env: {
        BASE44_APP_ID: "env-app-id",
        BASE44_API_URL: "https://env.example.com",
        BASE44_SERVICE_TOKEN: "env-service-token",
        BASE44_FUNCTIONS_VERSION: "env-functions-version",
      },
      appId: "option-app-id",
      serverUrl: "https://option.example.com",
      token: "option-token",
      serviceToken: "option-service-token",
      functionsVersion: "option-functions-version",
    });

    expect(client.getConfig()).toEqual({
      serverUrl: "https://option.example.com",
      appId: "option-app-id",
      requiresAuth: false,
    });
    expect(axiosClientArgs(MAIN_CLIENT_CALL)).toMatchObject({
      baseURL: "https://option.example.com/api",
      token: "option-token",
    });
    expect(axiosClientArgs(FUNCTIONS_CLIENT_CALL).headers).toMatchObject({
      "Base44-Functions-Version": "option-functions-version",
    });
    expect(axiosClientArgs(SERVICE_ROLE_CLIENT_CALL).token).toBe(
      "option-service-token"
    );
  });

  test("resolves config from env over request headers", () => {
    const request = makeRequest({
      "Base44-Service-Authorization": "Bearer header-service-token",
      "Base44-App-Id": "header-app-id",
      "Base44-Api-Url": "https://header.example.com",
      "Base44-Functions-Version": "header-functions-version",
    });

    const client = createServerClient({
      request,
      env: {
        BASE44_APP_ID: "env-app-id",
        BASE44_API_URL: "https://env.example.com",
        BASE44_SERVICE_TOKEN: "env-service-token",
        BASE44_FUNCTIONS_VERSION: "env-functions-version",
      },
    });

    expect(client.getConfig()).toMatchObject({
      serverUrl: "https://env.example.com",
      appId: "env-app-id",
    });
    expect(axiosClientArgs(FUNCTIONS_CLIENT_CALL).headers).toMatchObject({
      "Base44-Functions-Version": "env-functions-version",
    });
    expect(axiosClientArgs(SERVICE_ROLE_CLIENT_CALL).token).toBe(
      "env-service-token"
    );
  });

  test("falls back to the Base44-* request headers (existing proxy contract)", () => {
    const request = makeRequest({
      Authorization: "Bearer header-token",
      "Base44-Service-Authorization": "Bearer header-service-token",
      "Base44-App-Id": "header-app-id",
      "Base44-Api-Url": "https://header.example.com",
      "Base44-Functions-Version": "header-functions-version",
    });

    const client = createServerClient({ request });

    expect(client.getConfig()).toMatchObject({
      serverUrl: "https://header.example.com",
      appId: "header-app-id",
    });
    expect(axiosClientArgs(MAIN_CLIENT_CALL).token).toBe("header-token");
    expect(axiosClientArgs(FUNCTIONS_CLIENT_CALL).headers).toMatchObject({
      "Base44-Functions-Version": "header-functions-version",
    });
    expect(axiosClientArgs(SERVICE_ROLE_CLIENT_CALL).token).toBe(
      "header-service-token"
    );
  });

  test("defaults serverUrl to https://base44.app", () => {
    const client = createServerClient({
      request: makeRequest(),
      appId: "my-app-id",
    });

    expect(client.getConfig()).toMatchObject({
      serverUrl: "https://base44.app",
      appId: "my-app-id",
    });
  });

  test("prefers the Authorization header over the cookie for the user token", () => {
    createServerClient({
      request: makeRequest({
        Authorization: "Bearer header-token",
        Cookie: "base44_access_token=cookie-token",
      }),
      appId: "my-app-id",
    });

    expect(axiosClientArgs(MAIN_CLIENT_CALL).token).toBe("header-token");
  });

  test("falls back to the base44_access_token cookie for the user token", () => {
    createServerClient({
      request: makeRequest({
        Cookie: "other=1; base44_access_token=cookie-token; another=2",
      }),
      appId: "my-app-id",
    });

    expect(axiosClientArgs(MAIN_CLIENT_CALL).token).toBe("cookie-token");
  });

  test("parses quoted and URL-encoded cookie values", () => {
    createServerClient({
      request: makeRequest({
        Cookie: 'base44_access_token="cookie%20token%3Dvalue"',
      }),
      appId: "my-app-id",
    });

    expect(axiosClientArgs(MAIN_CLIENT_CALL).token).toBe("cookie token=value");
  });

  test("ignores malformed Authorization headers and cookies without the token", () => {
    createServerClient({
      request: makeRequest({
        Authorization: "NotBearerFormat",
        Cookie: "unrelated=value",
      }),
      appId: "my-app-id",
    });

    expect(axiosClientArgs(MAIN_CLIENT_CALL).token).toBeUndefined();
  });

  test("throws a clear error when no app ID can be resolved", () => {
    expect(() => createServerClient({ request: makeRequest() })).toThrow(
      "createServerClient: unable to resolve an app ID. Pass appId explicitly, set the BASE44_APP_ID environment variable, or forward the Base44-App-Id request header."
    );
  });

  test("throws when the resolved serverUrl is not an absolute URL", () => {
    expect(() =>
      createServerClient({
        request: makeRequest(),
        appId: "my-app-id",
        serverUrl: "/relative/path",
      })
    ).toThrow('createServerClient: serverUrl must be an absolute URL, got "/relative/path"');

    expect(() =>
      createServerClient({
        request: makeRequest(),
        appId: "my-app-id",
        env: { BASE44_API_URL: "not-a-url" },
      })
    ).toThrow("createServerClient: serverUrl must be an absolute URL");
  });

  test("forces the axios fetch adapter on all clients", () => {
    createServerClient({ request: makeRequest(), appId: "my-app-id" });

    const calls = vi.mocked(createAxiosClient).mock.calls;
    expect(calls.length).toBe(4);
    for (const [args] of calls) {
      expect(args.adapter).toBe("fetch");
    }
  });

  test("propagates the Base44-State header like createClientFromRequest", () => {
    createServerClient({
      request: makeRequest({ "Base44-State": "192.168.1.100" }),
      appId: "my-app-id",
    });

    expect(axiosClientArgs(MAIN_CLIENT_CALL).headers).toMatchObject({
      "Base44-State": "192.168.1.100",
    });
  });

  test("does not start analytics timers or queue events (worker safety)", () => {
    // node test environment: no window global, like a Cloudflare Worker
    expect(typeof window).toBe("undefined");
    vi.useFakeTimers();

    const client = createServerClient({
      request: makeRequest(),
      appId: "my-app-id",
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(() =>
      client.analytics.track({ eventName: "server-event" })
    ).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);

    client.cleanup();
    vi.useRealTimers();
  });
});
