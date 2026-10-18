#!/usr/bin/env node
// Adds the webhook event types production publishes to scripts/webhook-event-types.json:
//   npm run sync:webhooks [-- <openapi url>]
// Then run `npm run generate:webhooks`. The hourly sync-webhook-events workflow does both.
//
// Only adds. A retired type leaves the published spec, but endpoints that selected it keep
// receiving it, so the SDK keeps its type.
import { readFile, writeFile } from "node:fs/promises";

const url =
  process.argv[2] ?? process.env.WEBHOOKS_OPENAPI_URL ?? "https://app.base44.com/api/v1/outbound-webhooks/openapi.json";
const target = new URL("./webhook-event-types.json", import.meta.url);

const response = await fetch(url);
if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
const published = Object.keys((await response.json()).webhooks ?? {});
if (!published.length) throw new Error(`${url} has no webhooks section. Kept the committed list.`);

const known = JSON.parse(await readFile(target, "utf8"));
const added = published.filter(type => !known.includes(type));
await writeFile(target, JSON.stringify([...known, ...added], null, 2) + "\n");
console.log(added.length ? `Added ${added.join(", ")} from ${url}.` : `No new event types at ${url}.`);
