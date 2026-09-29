import { test } from "vitest";
import assert from "node:assert/strict";
import { harness, json, mint } from "./helpers.js";
import { Base44PlatformClient, InMemoryTokenStore, type TokenStore, type TokenRecord } from "../../../platform-src/server/index.js";

const identity = { service_external_id: "u", user_id: "base44-u", email: "u@workspace.svc.base44.invalid", role: "editor", created: true };
test("provision is explicit, canonical and does not mint; deprovision clears credentials", async () => {
  const { client, calls } = harness(c => c.url.pathname.endsWith("user-tokens") ? mint("u") : c.method === "DELETE" ? json({ removed: true, private: true }) : json(identity));
  const user = client.asUser(" U ");
  assert.equal(calls.length, 0);
  assert.equal(user.externalId, "u");
  assert.deepEqual(await client.users.provision({ externalId: " U ", displayName: "Person" }), { externalId: "u", userId: "base44-u", email: identity.email, role: "editor", created: true });
  assert.deepEqual(calls[0].body, { service_external_id: "u", display_name: "Person" });
  assert.equal(calls[0].headers.get("Authorization"), "workspace-secret");
  await user.getAccessToken();
  assert.deepEqual(await client.users.deprovision(" U "), { removed: true });
  assert.equal(calls.at(-1)?.url.pathname, "/api/service/users/u");
  await user.getAccessToken();
  assert.equal(calls.filter(c => c.url.pathname.endsWith("user-tokens")).length, 2);
});

test("provision preserves existing created:false and rejects a human address", async () => {
  const { client } = harness(() => json({ ...identity, created: false }));
  assert.equal((await client.users.provision({ externalId: "u" })).created, false);
  const human = harness(() => json({ ...identity, email: "person@example.com" }));
  await assert.rejects(human.client.users.provision({ externalId: "u" }), { code: "invalid_response" });
});

test("unknown principal never auto-provisions; absent deprovision is idempotent", async () => {
  const { client, calls } = harness(() => json({ detail: "private" }, 404));
  await assert.rejects(client.asUser("u").getAccessToken(), { status: 404 });
  assert.deepEqual(await client.users.deprovision("u"), { removed: false });
  assert.deepEqual(calls.map(c => c.method), ["POST", "DELETE"]);
});

test("concurrent users never share identity and concurrent renewals deduplicate", async () => {
  const { client, calls } = harness(c => mint((c.body as { service_external_id: string }).service_external_id));
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => client.asUser(i % 2 ? "u" : "v").getAccessToken()));
  assert.equal(calls.length, 2);
  assert.deepEqual(new Set(results), new Set(["access-u", "access-v"]));
  await Promise.all(Array.from({ length: 10 }, () => client.asUser("u").getAccessToken({ forceRefresh: true })));
  assert.equal(calls.length, 3);
  assert.equal(Object.isFrozen(client.asUser("u")), true);
  assert.equal(JSON.stringify(client).includes("workspace-secret"), false);
});

test("custom storage reuses tokens across client instances and isolates host/workspace", async () => {
  const store = new InMemoryTokenStore();
  const first = harness(() => mint("u"), { tokenStore: store });
  await first.client.asUser("u").getAccessToken();
  const second = harness(() => { throw Error("Unexpected mint"); }, { tokenStore: store });
  assert.equal(await second.client.asUser("u").getAccessToken(), "access-u");
  const third = harness(() => mint("other"), { tokenStore: store, workspaceId: "workspace2" });
  assert.equal(await third.client.asUser("u").getAccessToken(), "access-other");
  const fourth = harness(() => mint("host"), { tokenStore: store, serverUrl: "https://other.example" });
  assert.equal(await fourth.client.asUser("u").getAccessToken(), "access-host");
});

test("short token lifetime clamps renewal skew; transient failures preserve stored record", async () => {
  let stored: TokenRecord | null = null;
  const store: TokenStore = { async get() { return stored; }, async set(_key, record) { stored = record; }, async delete() { stored = null; } };
  let fail = false;
  const { client, calls } = harness(() => fail ? json({}, 429) : mint("u", 20), { tokenStore: store });
  await client.asUser("u").getAccessToken();
  const snapshot = { ...stored! };
  assert.equal(snapshot.expiresAt - snapshot.renewAt!, 10_000);
  await client.asUser("u").getAccessToken();
  assert.equal(calls.length, 1);
  fail = true;
  await assert.rejects(client.asUser("u").getAccessToken({ forceRefresh: true }), { status: 429 });
  assert.deepEqual(stored, snapshot);
  stored = { ...snapshot, expiresAt: 0, renewAt: 0 };
  fail = false;
  await client.asUser("u").getAccessToken();
  assert.equal(calls.length, 3);
});

test("revocation sends only the refresh credential and clears even on failure", async () => {
  const { client, calls } = harness(c => c.url.pathname.endsWith("user-tokens") ? mint("u") : json({}, 503));
  await client.asUser("u").getAccessToken();
  await assert.rejects(client.asUser("u").revokeToken(), { status: 503 });
  const revoke = calls.at(-1)!;
  assert.equal(revoke.url.pathname, "/oauth/revoke");
  assert.equal(revoke.headers.has("Authorization"), false);
  assert.deepEqual(revoke.body, { token: "refresh-u", client_id: "svc_delegate" });
  await client.asUser("u").getAccessToken();
  assert.equal(calls.length, 3);
});

test("storage errors never expose adapter errors or credentials", async () => {
  const { client } = harness(() => mint("u"), { tokenStore: { async get() { throw Error("secret-db-password"); }, async set() {}, async delete() {} } });
  await assert.rejects(client.asUser("u").getAccessToken(), { code: "token_store_error", message: "Token storage could not complete the operation." });
});

test("invalid configuration and browser construction fail locally", () => {
  assert.throws(() => new Base44PlatformClient({ apiKey: "", workspaceId: "workspace" }), { code: "invalid_argument" });
  assert.throws(() => new Base44PlatformClient({ apiKey: "secret", workspaceId: "workspace", serverUrl: "https://user:pass@example.com" }), { code: "invalid_argument" });
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  try { assert.throws(() => new Base44PlatformClient({ apiKey: "secret", workspaceId: "workspace" }), { code: "server_only" }); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
