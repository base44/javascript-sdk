import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { inspect } from "node:util";
import { createClient } from "../../src/index.ts";

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
function logged(error: unknown): string {
  return inspect(error, { depth: 10 });
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

  test("a raw axios error from functions.invoke does not carry the token", async () => {
    nock(serverUrl)
      .post(`/api/apps/${appId}/functions/broken`)
      .reply(500, { error: "boom" });
    const base44 = createClient({ serverUrl, appId, token: USER_TOKEN });

    const error = await rejection(base44.functions.invoke("broken", {}));

    expect(error.response.status).toBe(500);
    expect(error.response.data).toEqual({ error: "boom" });
    expect(logged(error)).not.toContain(USER_TOKEN);
    expect(JSON.stringify(error)).not.toContain(USER_TOKEN);
  });
});
