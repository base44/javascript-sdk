import { test } from "vitest";
import assert from "node:assert/strict";
import { harness, mint } from "./helpers.js";

test("timeouts abort the request without retrying or leaking fetch errors", async () => {
  const { client, calls } = harness(c => {
    if (c.url.pathname.includes("user-tokens")) return mint("u");
    return new Promise<Response>((_, reject) => c.init.signal!.addEventListener("abort", () => reject(Error("secret-bearing transport error"))));
  });
  await assert.rejects(client.asUser("u").apps.deploy("app1", { timeoutMs: 5 }), { code: "timeout", status: 0 });
  assert.equal(calls.length, 2);
});

test("cancellation stops one caller while another completes shared acquisition", async () => {
  let complete: (value: Response) => void = () => {};
  const { client, calls } = harness(() => new Promise<Response>(resolve => { complete = resolve; }));
  const controller = new AbortController();
  const first = client.asUser("u").getAccessToken({ signal: controller.signal });
  const second = client.asUser("u").getAccessToken();
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(first, { code: "aborted" });
  complete(mint("u"));
  assert.equal(await second, "access-u");
  assert.equal(calls.length, 1);
});

test("pre-aborted calls do not acquire credentials", async () => {
  const { client, calls } = harness(() => mint("u"));
  const signal = AbortSignal.abort();
  await assert.rejects(client.asUser("u").apps.get("app1", { signal }), { code: "aborted" });
  assert.equal(calls.length, 0);
});

test("invalid JSON and network errors are sanitized", async () => {
  const malformed = harness(() => new Response("secret non-json response"));
  await assert.rejects(malformed.client.asUser("u").getAccessToken(), { code: "invalid_response" });
  const network = harness(() => { throw Error("request contains apiKey=secret"); });
  await assert.rejects(network.client.asUser("u").getAccessToken(), { code: "network_error", message: "The platform request could not be completed." });
});
