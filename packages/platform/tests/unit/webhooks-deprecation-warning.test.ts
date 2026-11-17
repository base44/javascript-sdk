import { expect, test, vi } from "vitest";

vi.mock("../../src/server/modules/webhooks.events.generated.js", async importOriginal => ({
  ...(await importOriginal<object>()),
  WEBHOOK_DEPRECATIONS: { "app.created.v1": "Deprecated from 2027-01-01; use `app.created.v2`." },
}));

const { createPlatformServer } = await import("../../src/server/index.js");

const base64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");
const { publicKey, privateKey } = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
const wire = `whpk_${base64(await crypto.subtle.exportKey("raw", publicKey))}`;

async function delivery(type: string) {
  const body = JSON.stringify({ specversion: "1.0", id: "evt_1", type, data: {} });
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = base64(await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(`evt_1.${ts}.${body}`)));
  return { body, headers: new Headers({ "webhook-id": "evt_1", "webhook-timestamp": ts, "webhook-signature": `v1a,${signature}` }) };
}

test("the first delivery of a deprecated event warns once, with its notice", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { webhooks } = createPlatformServer();
  for (const type of ["app.created.v1", "app.created.v1", "app.published.v1"]) {
    const { body, headers } = await delivery(type);
    await webhooks.verifyEvent(body, headers, { publicKeys: wire });
  }
  expect(warn.mock.calls).toEqual([["Base44 webhook event app.created.v1: Deprecated from 2027-01-01; use `app.created.v2`."]]);
});
