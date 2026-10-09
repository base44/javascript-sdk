#!/usr/bin/env node
// Generates src/modules/builder.events.generated.ts from asyncapi.json. `--check` fails on drift instead.
import { readFile, writeFile } from "node:fs/promises";
import { compile } from "json-schema-to-typescript";

const source = new URL("../asyncapi.json", import.meta.url);
const target = new URL("../src/modules/builder.events.generated.ts", import.meta.url);
const doc = JSON.parse(await readFile(source, "utf8"));
const schemas = doc.components.schemas;
const refName = (ref) => ref.split("/").pop();

// Pydantic titles every property; only component names should become TypeScript names.
function prepare(node, top) {
  if (Array.isArray(node)) return node.map((item) => prepare(item, false));
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref") out.$ref = `#/definitions/${refName(value)}`;
    else if (key === "properties") {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, property]) => {
        const prepared = prepare(property, false);
        // TypeDoc requires every public property documented; fall back to the field title.
        prepared.description ??= property.title ? `${sentence(property.title)}.` : `The \`${name}\` field.`;
        // A description beside a bare $ref would document the referenced type instead of this property.
        if (prepared.$ref) return [name, { anyOf: [{ $ref: prepared.$ref }], description: prepared.description }];
        return [name, prepared];
      }));
    } else if (key === "title" && !top) continue;
    else out[key] = prepare(value, false);
  }
  return out;
}
const sentence = (title) => title.charAt(0) + title.slice(1).toLowerCase().replace(/\b(id|url)\b/g, (w) => w.toUpperCase());

const definitions = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => {
  const prepared = prepare(schema, true);
  prepared.title = name;
  prepared.description ??= `The \`${name}\` schema.`;
  return [name, prepared];
}));

const body = await compile(
  { title: "AsyncApiDocument", type: "object", properties: {}, definitions },
  "AsyncApiDocument",
  { additionalProperties: false, unreachableDefinitions: true, bannerComment: "", format: true, strictIndexSignatures: true },
);
// The root exists only to carry the definitions.
const types = body
  .replace("export interface AsyncApiDocument {}\n", "")
  .replace(/^ \*\n \* This (?:interface|type) was referenced by `AsyncApiDocument`'s JSON-Schema\n \* via the `definition` "\w+"\.\n/gm, "")
  .replace(/^\/\*\*\n \* This (?:interface|type) was referenced by `AsyncApiDocument`'s JSON-Schema\n \* via the `definition` "\w+"\.\n \*\/\n/gm, "");
if (types.includes("AsyncApiDocument")) throw new Error("Could not strip the root type");

const messageEntries = (action) => Object.values(doc.operations)
  .filter((operation) => operation.action === action)
  .flatMap((operation) => operation.messages.map((ref) => doc.components.messages[refName(ref.$ref)]));
// The service sends `send` operations; every server event is a `{room, data}` frame.
const serverEvents = messageEntries("send").map((message) => {
  const frame = schemas[refName(message.payload.$ref)];
  return { name: message.name, summary: message.summary, type: refName(frame.properties.data.$ref) };
});
const clientMessages = messageEntries("receive").map((message) => ({
  name: message.name, summary: message.summary, type: refName(message.payload.$ref),
}));
const mapEntries = (entries) => entries.map((entry) => `  /** ${entry.summary} */\n  ${JSON.stringify(entry.name)}: ${entry.type};`).join("\n");

const output = `// Generated from asyncapi.json by scripts/gen-events.mjs. Do not edit; run \`npm run gen:events\`.

${types.trim()}

/** Every event the service sends, by name, mapped to its \`data\` payload. */
export interface ServerEventMap {
${mapEntries(serverEvents)}
}

/** Every message a client sends, by name, mapped to its payload. */
export interface ClientMessageMap {
${mapEntries(clientMessages)}
}

/** @internal */
export const serverEventNames = ${JSON.stringify(serverEvents.map((event) => event.name))} as const;
`;

if (process.argv.includes("--check")) {
  const committed = await readFile(target, "utf8").catch(() => "");
  if (committed !== output) {
    console.error("builder.events.generated.ts is out of date with asyncapi.json. Run `npm run gen:events -w @base44/platform` and commit the result.");
    process.exit(1);
  }
  console.log("builder.events.generated.ts is up to date.");
} else {
  await writeFile(target, output);
  console.log(`Wrote ${Object.keys(schemas).length} schemas and ${serverEvents.length} server events.`);
}
