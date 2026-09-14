import { test } from "vitest";
import assert from "node:assert/strict";
import { harness, json, mint, app } from "./helpers.js";
import { Base44PlatformError } from "../../../platform-src/server/index.js";

test("all app methods use user credentials and project responses", async () => {
  const { client, calls } = harness((c) => {
    if (c.url.pathname === "/api/service/user-tokens") return mint("user1");
    if (c.url.pathname === "/api/app-folders/folder1/items") return new Response(null, { status: 204 });
    if (c.url.pathname.endsWith("preview-url")) return json({ preview_url: "https://preview.example", preview_token: "preview-secret", sandbox_info: { internal: true } });
    if (c.url.pathname.endsWith("deploy")) return json({ app_id: "app1", checkpoint_id: null, git_commit_hash: "revision1", deployed_at: "2026-01-01T00:00:00Z", internal: true });
    return json(c.method === "GET" && c.url.pathname === "/api/apps" ? [app] : app);
  });
  const user = client.asUser("USER1");
  const list = await user.apps.list({ folderId: "folder1", limit: 7, skip: 2 });
  assert.deepEqual(list[0], { id: "app1", name: "Tracker", slug: null, state: "ready", updatedAt: null, previewScreenshotUrl: null, logoUrl: null, lastDeployedAt: null, currentRevision: null, deployedRevision: null, hasCustomInstructions: true });
  assert.deepEqual(Object.fromEntries(calls[1].url.searchParams), { q: '{"app_type":{"$nin":["user_agent"]}}', sort: "-updated_date", limit: "7", skip: "2", filter_mode: "all_apps_workspace", folder_id: "folder1" });
  assert.equal((await user.apps.get("app1")).id, "app1");
  await user.apps.create({ prompt: "Make a tracker", name: "Tracker", customInstructions: "Use our API", secrets: { CUSTOM: "value-secret" }, publicSettings: "public_without_login", preventIframeEmbedding: false });
  const creation = calls.find(c => c.url.pathname === "/api/apps" && c.method === "POST")!;
  assert.deepEqual(creation.body, { name: "Tracker", user_description: "Make a tracker", organization_id: "workspace1", public_settings: "public_without_login", prevent_iframe_embedding: false, custom_instructions: "Use our API", secrets: { CUSTOM: { type: "value", value: "value-secret" } }, initial_message: { content: "Make a tracker" } });
  await user.apps.rename("app1", "  New name  ");
  assert.deepEqual(calls.at(-1)?.body, { name: "New name" });
  assert.equal(calls.at(-1)?.method, "PUT");
  assert.equal(await user.apps.addToFolder("folder1", ["app1"]), undefined);
  assert.deepEqual(calls.at(-1)?.body, { app_ids: ["app1"] });
  assert.deepEqual(await user.apps.getPreviewUrl("app1"), { url: "https://preview.example", token: "preview-secret" });
  await user.apps.getPreviewUrl("app1");
  assert.equal(calls.filter(c => c.url.pathname.endsWith("preview-url")).length, 2);
  assert.deepEqual(await user.apps.deploy("app1"), { appId: "app1", checkpointId: null, revision: "revision1", deployedAt: "2026-01-01T00:00:00Z" });
  for (const c of calls.slice(1)) {
    assert.equal(c.headers.get("Authorization"), "Bearer access-user1");
    assert.equal(c.headers.get("X-Active-Workspace-Id"), "workspace1");
    assert.equal(c.init.redirect, "error");
    assert.equal(c.init.cache, "no-store");
  }
  assert.equal(calls.filter(c => c.url.pathname.includes("user-tokens")).length, 1);
});

test("new/missing states become unknown; optional fields are null; unknown fields never pass through", async () => {
  const { client } = harness(c => c.url.pathname.includes("user-tokens") ? mint("u") : json({ id: "app1", status: { state: "future", details: "private" }, metadata: { email: "private" } }));
  const result = await client.asUser("u").apps.get("app1");
  assert.equal(result.state, "unknown");
  assert.equal(result.name, null);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("invalid IDs and pagination fail before minting; no path escape", async () => {
  const { client, calls } = harness(() => { throw Error("Unexpected request"); });
  for (const id of ["..", "../other", "//evil.example", "app?x=1", "app#fragment", ""]) await assert.rejects(client.asUser("u").apps.get(id), { code: "invalid_argument" });
  await assert.rejects(client.asUser("u").apps.list({ skip: -1 }), { code: "invalid_argument" });
  await assert.rejects(client.asUser("u").apps.list({ limit: 1.2 }), { code: "invalid_argument" });
  await assert.rejects(client.asUser("u").apps.create({ prompt: " " }), { code: "invalid_argument" });
  assert.equal(calls.length, 0);
});

test("malformed successful payloads fail as invalid_response", async () => {
  for (const body of [null, { pages: "private" }, { id: 123 }]) {
    const { client } = harness(c => c.url.pathname.includes("user-tokens") ? mint("u") : json(body));
    await assert.rejects(client.asUser("u").apps.get("app1"), { code: "invalid_response" });
  }
});

test("mutation failures do not retry or disclose response bodies", async () => {
  const { client, calls } = harness(c => c.url.pathname.includes("user-tokens") ? mint("u") : new Response("private payload access-secret", { status: 503 }));
  await assert.rejects(client.asUser("u").apps.create({ prompt: "Build" }), (error: unknown) => {
    assert.ok(error instanceof Base44PlatformError);
    assert.deepEqual(error.toJSON(), { name: "Base44PlatformError", message: "Platform request failed (HTTP 503).", status: 503, code: "http_error" });
    return true;
  });
  assert.equal(calls.length, 2);
});
