import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { inspect } from "node:util";
import { createClient } from "../../src/index.ts";
import { createAxiosClient } from "../../src/utils/axios-client.ts";

const serverUrl = "https://api.base44.com";
const appId = "test-app-id";
const USER_TOKEN = "user-token-do-not-log";
const SERVICE_TOKEN = "service-token-do-not-log";

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

// console.log(error) in Node is util.inspect; depth is raised to reach the Node request.
function logged(value: unknown): string {
  return inspect(value, { depth: 10 });
}

// What debuggers, `showHidden` and property-walking error reporters can see.
function loggedWithHidden(value: unknown): string {
  return inspect(value, { depth: 10, showHidden: true });
}

describe("Credential redaction in request errors", () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test("a logged Base44Error does not carry the service or on-behalf-of token", async () => {
    nock(serverUrl)
      .get(`/api/apps/${appId}/entities/Todo/missing`)
      .reply(404, { detail: "Not found" });
    const base44 = createClient({
      serverUrl,
      appId,
      token: USER_TOKEN,
      serviceToken: SERVICE_TOKEN,
    });

    const error = await rejection(base44.asServiceRole.entities.Todo.get("missing"));

    expect(error.name).toBe("Base44Error");
    expect(error.status).toBe(404);
    expect(logged(error)).not.toContain(SERVICE_TOKEN);
    expect(logged(error)).not.toContain(USER_TOKEN);
    expect(error.originalError.config.headers.Authorization).toBe("[REDACTED]");
  });

  test("hidden properties of a Base44Error do not carry the tokens", async () => {
    nock(serverUrl)
      .get(`/api/apps/${appId}/entities/Todo/missing`)
      .reply(404, { detail: "Not found" });
    const base44 = createClient({
      serverUrl,
      appId,
      token: USER_TOKEN,
      serviceToken: SERVICE_TOKEN,
    });

    const error = await rejection(base44.asServiceRole.entities.Todo.get("missing"));

    expect(loggedWithHidden(error)).not.toContain(SERVICE_TOKEN);
    expect(loggedWithHidden(error)).not.toContain(USER_TOKEN);
    expect(error.originalError.request).toBeUndefined();
    expect(error.originalError.response.request).toBeUndefined();
    expect(error.originalError.response.status).toBe(404);
  });

  test("a raw axios error from functions.invoke does not carry the token", async () => {
    nock(serverUrl)
      .post(`/api/apps/${appId}/functions/broken`)
      .reply(500, { error: "boom" });
    const base44 = createClient({ serverUrl, appId, token: USER_TOKEN });

    const error = await rejection(base44.functions.invoke("broken", {}));

    expect(error.response.status).toBe(500);
    expect(error.response.data).toEqual({ error: "boom" });
    expect(logged(error)).not.toContain(USER_TOKEN);
    expect(loggedWithHidden(error)).not.toContain(USER_TOKEN);
    expect(JSON.stringify(error)).not.toContain(USER_TOKEN);
  });

  test("a network error does not carry the token", async () => {
    nock(serverUrl)
      .get(`/api/apps/${appId}/entities/Todo/1`)
      .replyWithError({ code: "ECONNRESET", message: "socket hang up" });
    const base44 = createClient({ serverUrl, appId, token: USER_TOKEN });

    const error = await rejection(base44.entities.Todo.get("1"));

    expect(error.name).toBe("Base44Error");
    expect(loggedWithHidden(error)).not.toContain(USER_TOKEN);
  });

  test("a failed login does not carry the password", async () => {
    nock(serverUrl)
      .post(`/api/apps/${appId}/auth/login`)
      .reply(400, { detail: "Invalid credentials" });
    const base44 = createClient({ serverUrl, appId });

    const error = await rejection(
      base44.auth.loginViaEmailPassword("user@example.com", "PWSECRET", "TURNSTILE")
    );

    expect(loggedWithHidden(error)).not.toContain("PWSECRET");
    expect(loggedWithHidden(error)).not.toContain("TURNSTILE");
    expect(JSON.stringify(error.originalError)).not.toContain("PWSECRET");
    // Non-secret fields stay visible for debugging.
    expect(JSON.parse(error.originalError.config.data)).toEqual({
      email: "user@example.com",
      password: "[REDACTED]",
      turnstile_token: "[REDACTED]",
    });
  });

  test("a logged error does not carry the Base44-State header", async () => {
    nock(serverUrl)
      .get(`/api/apps/${appId}/entities/Todo/missing`)
      .reply(404, { detail: "Not found" });
    const base44 = createClient({
      serverUrl,
      appId,
      headers: { "Base44-State": "STATE_SECRET" },
    });

    const error = await rejection(base44.entities.Todo.get("missing"));

    expect(loggedWithHidden(error)).not.toContain("STATE_SECRET");
  });

  test("the config axios sent is left unchanged", async () => {
    nock(serverUrl).get("/api/thing").reply(500, {});
    const client = createAxiosClient({
      baseURL: `${serverUrl}/api`,
      token: USER_TOKEN,
      interceptResponses: false,
    });
    let sentConfig: any;
    client.interceptors.request.use((config) => {
      sentConfig = config;
      return config;
    });

    const error = await rejection(client.get("/thing"));

    expect(error.config.headers.Authorization).toBe("[REDACTED]");
    expect(error.config.headers["Content-Type"]).toBe("application/json");
    expect(sentConfig.headers.Authorization).toBe(`Bearer ${USER_TOKEN}`);
  });

  test("a non-object rejection reaches the caller unchanged", async () => {
    const client = createAxiosClient({
      baseURL: `${serverUrl}/api`,
      interceptResponses: false,
    });
    client.interceptors.request.use(() => Promise.reject("offline"));

    await expect(client.get("/thing")).rejects.toBe("offline");
  });
});

describe("Credential redaction in functions.invoke responses", () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test("a successful response does not carry the user token", async () => {
    nock(serverUrl)
      .post(`/api/apps/${appId}/functions/ok`)
      .reply(200, { total: 3 }, { "X-Custom": "yes" });
    const base44 = createClient({ serverUrl, appId, token: USER_TOKEN });

    const result = await base44.functions.invoke("ok", {});

    expect(result.data).toEqual({ total: 3 });
    expect(result.status).toBe(200);
    expect(result.headers["x-custom"]).toBe("yes");
    expect(result.config).toBeUndefined();
    expect(result.request).toBeUndefined();
    expect(loggedWithHidden(result)).not.toContain(USER_TOKEN);
  });

  test("a successful service-role response does not carry the service token", async () => {
    nock(serverUrl)
      .post(`/api/apps/${appId}/functions/ok`)
      .reply(200, { ok: true });
    const base44 = createClient({
      serverUrl,
      appId,
      token: USER_TOKEN,
      serviceToken: SERVICE_TOKEN,
    });

    const result = await base44.asServiceRole.functions.invoke("ok", {});

    expect(result.data).toEqual({ ok: true });
    expect(loggedWithHidden(result)).not.toContain(SERVICE_TOKEN);
    expect(loggedWithHidden(result)).not.toContain(USER_TOKEN);
  });
});
