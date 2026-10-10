#!/usr/bin/env node
// Replaces asyncapi.json with the document a backend serves, production by default. Production
// publishes only beta and GA messages; for alpha ones point this at a dev backend, e.g. a local apper:
//   npm run sync:asyncapi -- http://localhost:8000/api/asyncapi.json
// or set ASYNCAPI_URL. Then run `npm run gen:events`. The weekly sync-asyncapi workflow does both.
import { writeFile } from "node:fs/promises";

const url = process.argv[2] ?? process.env.ASYNCAPI_URL ?? "https://app.base44.com/api/asyncapi.json";
const target = new URL("../asyncapi.json", import.meta.url);

const response = await fetch(url);
if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
const document = await response.json();
const messages = Object.keys(document.components?.messages ?? {}).length;
if (!messages) {
  console.error(`${url} has no messages (production omits alpha events). Kept the committed copy.`);
  console.error("Pass a dev backend URL instead, e.g. http://localhost:8000/api/asyncapi.json");
  process.exit(1);
}
await writeFile(target, JSON.stringify(document, null, 2) + "\n");
console.log(`Wrote ${messages} messages from ${url}. Run npm run gen:events next.`);
