import { afterEach, describe, expect, test, vi } from "vitest";
import { createPlatformServer, WebhookConfigurationError, WebhookVerificationError } from "../../src/server/index.js";

const base64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as Uint8Array).toString("base64");

async function mint() {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  return { privateKey, wire: `whpk_${base64(await crypto.subtle.exportKey("raw", publicKey))}` };
}
type Signer = Awaited<ReturnType<typeof mint>>;

const known = await mint();
const rotated = await mint();
const stranger = await mint();

const envelope = (type = "app.created.v1", data: unknown = { app_id: "a".repeat(24), workspace_id: "w", owner_id: "o", app_type: "user_app", created_at: "2026-09-01T10:15:30.123Z" }) => ({
  specversion: "1.0", id: "evt_1", source: "https://base44.com/workspaces/w", type, subject: `apps/${"a".repeat(24)}`,
  time: "2026-09-01T10:15:30.123Z", datacontenttype: "application/json", dataschema: `https://base44.com/webhooks/schemas/${type}.json`,
  authtype: "system", authid: "base44", data,
});
const BODY = JSON.stringify(envelope());

async function sign(signer: Signer, id: string, ts: string, body: string) {
  return base64(await crypto.subtle.sign("Ed25519", signer.privateKey, new TextEncoder().encode(`${id}.${ts}.${body}`)));
}
async function delivery({ body = BODY, id = "evt_1", ts = String(Math.floor(Date.now() / 1000)), signers = [known], scheme = "v1a" } = {}) {
  const signatures = await Promise.all(signers.map(async s => `${scheme},${await sign(s, id, ts, body)}`));
  return { body, headers: new Headers({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": signatures.join(" ") }) };
}
const server = (publicKeys?: string | string[]) =>
  createPlatformServer({ serverUrl: "https://api.example.test", apiKey: "key", webhooks: { publicKeys } });
const failure = async (promise: Promise<unknown>) => promise.then(() => null, (error: WebhookVerificationError | WebhookConfigurationError) => error);

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("webhooks.verifyEvent", () => {
  test("returns the parsed event for a genuine delivery", async () => {
    const { body, headers } = await delivery();
    const event = await server(known.wire).webhooks.verifyEvent(body, headers);
    expect(event.type).toBe("app.created.v1");
    expect(event.id).toBe("evt_1");
  });

  test("accepts a byte body and a Node-style header object", async () => {
    const { body, headers } = await delivery();
    const plain = Object.fromEntries([...headers].map(([k, v]) => [k.toUpperCase(), [v]]));
    const event = await server(known.wire).webhooks.verifyEvent(new TextEncoder().encode(body), plain);
    expect(event.id).toBe("evt_1");
  });

  test("accepts keys with or without the whpk_ prefix, as a list or a delimited string", async () => {
    const { body, headers } = await delivery();
    for (const keys of [known.wire.slice(5), [known.wire], `${stranger.wire}, ${known.wire}`, `${stranger.wire}\n${known.wire}`]) {
      expect((await server(keys).webhooks.verifyEvent(body, headers)).id).toBe("evt_1");
    }
  });

  test("verifies during a key rotation, whichever key the receiver has pinned", async () => {
    const { body, headers } = await delivery({ signers: [known, rotated] });
    for (const keys of [known.wire, rotated.wire, [known.wire, rotated.wire]]) {
      expect((await server(keys).webhooks.verifyEvent(body, headers)).id).toBe("evt_1");
    }
  });

  test("per-call keys override the configured ones", async () => {
    const { body, headers } = await delivery({ signers: [rotated] });
    expect((await server(known.wire).webhooks.verifyEvent(body, headers, { publicKeys: rotated.wire })).id).toBe("evt_1");
  });

  test.each([
    ["a tampered body", async () => ({ ...(await delivery()), body: BODY.replace("user_app", "user_game") }), "signature_mismatch"],
    ["a re-serialized body", async () => ({ ...(await delivery()), body: JSON.stringify(JSON.parse(BODY), null, 1) }), "signature_mismatch"],
    ["a relabelled id", async () => {
      const real = await delivery();
      real.headers.set("webhook-id", "evt_2");
      return real;
    }, "signature_mismatch"],
    ["an unknown signing key", async () => delivery({ signers: [stranger] }), "signature_mismatch"],
    ["a stale timestamp", async () => delivery({ ts: String(Math.floor(Date.now() / 1000) - 301) }), "timestamp_outside_tolerance"],
    ["a future timestamp", async () => delivery({ ts: String(Math.floor(Date.now() / 1000) + 301) }), "timestamp_outside_tolerance"],
    ["a non-numeric timestamp", async () => delivery({ ts: "soon" }), "timestamp_outside_tolerance"],
    ["an unsupported scheme", async () => delivery({ scheme: "v1" }), "no_signature_entries"],
    ["malformed signature base64", async () => {
      const real = await delivery();
      real.headers.set("webhook-signature", "v1a,%%%");
      return real;
    }, "no_signature_entries"],
  ])("refuses %s", async (_name, build, code) => {
    const { body, headers } = await build();
    const error = await failure(server(known.wire).webhooks.verifyEvent(body, headers));
    expect(error).toBeInstanceOf(WebhookVerificationError);
    expect(error).toMatchObject({ code });
  });

  test.each(["webhook-id", "webhook-timestamp", "webhook-signature"])("refuses a delivery missing %s", async name => {
    const { body, headers } = await delivery();
    headers.delete(name);
    expect(await failure(server(known.wire).webhooks.verifyEvent(body, headers))).toMatchObject({ code: "missing_headers" });
  });

  test("honors toleranceSeconds", async () => {
    const { body, headers } = await delivery({ ts: String(Math.floor(Date.now() / 1000) - 400) });
    expect((await server(known.wire).webhooks.verifyEvent(body, headers, { toleranceSeconds: 600 })).id).toBe("evt_1");
  });

  test("refuses a signed body that is not an event, after verifying it", async () => {
    for (const body of ["not json", "null", JSON.stringify({ type: "app.created.v1" })]) {
      const { headers } = await delivery({ body });
      expect(await failure(server(known.wire).webhooks.verifyEvent(body, headers))).toMatchObject({ code: "invalid_payload" });
    }
  });

  test("never parses an unverified body", async () => {
    const parse = vi.spyOn(JSON, "parse");
    const { headers } = await delivery({ signers: [stranger] });
    await failure(server(known.wire).webhooks.verifyEvent(BODY, headers));
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  test("makes no network call", async () => {
    const fetch = vi.fn(() => { throw new Error("verification made a network call"); });
    vi.stubGlobal("fetch", fetch);
    const { body, headers } = await delivery();
    await server(known.wire).webhooks.verifyEvent(body, headers);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("reports configuration problems as configuration errors, whatever the request", async () => {
    const { body, headers } = await delivery();
    const truncated = `whpk_${Buffer.alloc(31, 1).toString("base64")}`;
    for (const [keys, code] of [[undefined, "missing_public_keys"], [" , ", "missing_public_keys"], [[], "missing_public_keys"], [truncated, "invalid_public_key"], ["whpk_%%%", "invalid_public_key"]] as const) {
      const error = await failure(server(keys as string | string[] | undefined).webhooks.verifyEvent(body, headers));
      expect(error).toBeInstanceOf(WebhookConfigurationError);
      expect(error).toMatchObject({ code });
    }
    expect(await failure(server().webhooks.verifyEvent(body, new Headers()))).toBeInstanceOf(WebhookConfigurationError);
  });
});

describe("webhooks.createHandler", () => {
  const request = async (type = "app.created.v1", data?: unknown, overrides: { signers?: Signer[] } = {}) => {
    const body = JSON.stringify(data === undefined ? envelope(type) : envelope(type, data));
    const { headers } = await delivery({ body, ...overrides });
    return new Request("https://receiver.example.test/webhooks", { method: "POST", body, headers });
  };
  const probe = { endpoint_id: "e", workspace_id: "w", sent_at: "2026-09-01T10:15:30.123Z", challenge: "abc123" };

  test("answers the activation probe without calling any callback", async () => {
    const onEvent = vi.fn(), onSuccess = vi.fn();
    const response = await server(known.wire).webhooks.createHandler({ onEvent, onSuccess })(await request("webhook.test.v1", probe));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: "abc123" });
    expect(onEvent).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test("runs onEvent, then the type's handler, then onSuccess, and answers 204", async () => {
    const calls: string[] = [];
    const handler = server(known.wire).webhooks.createHandler({
      on: { "app.created.v1": async event => { calls.push(`on:${event.data.app_type}`); }, "app.deleted.v1": () => { calls.push("wrong"); } },
      onEvent: event => { calls.push(`event:${event.type}`); },
      onSuccess: event => { calls.push(`success:${event.id}`); },
    });
    const response = await handler(await request());
    expect(response.status).toBe(204);
    expect(calls).toEqual(["event:app.created.v1", "on:user_app", "success:evt_1"]);
  });

  test("answers 2xx for event types without a handler", async () => {
    expect((await server(known.wire).webhooks.createHandler()(await request("app.restored.v1", {}))).status).toBe(204);
  });

  test("onSuccess may replace the response", async () => {
    const handler = server(known.wire).webhooks.createHandler({ onSuccess: () => Response.json({ ok: true }) });
    const response = await handler(await request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("refuses an unverified delivery with 400 and never calls handlers", async () => {
    const onEvent = vi.fn(), onError = vi.fn();
    const response = await server(known.wire).webhooks.createHandler({ onEvent, onError })(await request(undefined, undefined, { signers: [stranger] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "signature_mismatch" });
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(WebhookVerificationError), undefined);
  });

  test("answers 500 for a configuration problem, so Base44 retries", async () => {
    const response = await server().webhooks.createHandler()(await request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "receiver_misconfigured" });
  });

  test.each(["onEvent", "on", "onSuccess"] as const)("answers 500 and reports the event when %s throws", async name => {
    const failure = new Error("boom");
    const throws = () => { throw failure; };
    const onError = vi.fn();
    const options = name === "on" ? { on: { "app.created.v1": throws } } : { [name]: throws };
    const response = await server(known.wire).webhooks.createHandler({ ...options, onError })(await request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "handler_failed" });
    expect(onError).toHaveBeenCalledWith(failure, expect.objectContaining({ id: "evt_1" }));
  });

  test("onError may replace the response", async () => {
    const handler = server(known.wire).webhooks.createHandler({ onError: () => new Response("nope", { status: 401 }) });
    expect((await handler(await request(undefined, undefined, { signers: [stranger] }))).status).toBe(401);
  });

  test("accepts per-handler verify options", async () => {
    const handler = server(known.wire).webhooks.createHandler({ publicKeys: rotated.wire });
    expect((await handler(await request(undefined, undefined, { signers: [rotated] }))).status).toBe(204);
  });
});
