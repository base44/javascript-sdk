#!/usr/bin/env node
// Renders protocol/socket-messages from the committed asyncapi.json: every message on the
// connection, both directions, as it travels, with the ResponseField / Expandable components the
// rest of the reference uses. It is the one catalog of events; how the client delivers them is
// documented on its callbacks.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MAX_DEPTH = 8;
const source = new URL("../asyncapi.json", import.meta.url);
const doc = JSON.parse(readFileSync(source, "utf8"));

function resolvePointer(ref) {
  if (!ref.startsWith("#/")) throw new Error(`Only local $refs are supported: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, key) => node?.[key], doc);
}

/** Follow $refs; sibling keys on the referring node win. Returns [schema, refNames]. */
function deref(schema) {
  const names = [];
  let s = schema ?? {};
  while (s && typeof s === "object" && s.$ref) {
    names.push(s.$ref);
    const { $ref, ...rest } = s;
    s = { ...resolvePointer($ref), ...rest };
  }
  return [s, names];
}

const isNull = (s) => deref(s)[0].type === "null";

/** Union members, without null, plus whether null was one of them. */
function unionOf(s) {
  const members = s.anyOf ?? s.oneOf;
  if (!Array.isArray(members)) return null;
  const flat = members.flatMap((m) => {
    const inner = unionOf(deref(m)[0]);
    return inner ? [...inner.members, ...(inner.nullable ? [{ type: "null" }] : [])] : [m];
  });
  return { members: flat.filter((m) => !isNull(m)), nullable: flat.some(isNull) };
}

function typesOf(s) {
  const t = s.type;
  const list = Array.isArray(t) ? t : t ? [t] : [];
  return { list: list.filter((x) => x !== "null"), nullable: list.includes("null") };
}

const isObject = (s) => {
  const [d] = deref(s);
  return d.type === "object" || (Array.isArray(d.type) && d.type.includes("object")) || !!d.properties;
};

const quote = (v) => (typeof v === "string" ? `'${v}'` : JSON.stringify(v));

/** The type label, e.g. `string | null`, `'a' | 'b'`, `object[]`. */
function typeLabel(schema) {
  const [s] = deref(schema);
  const union = unionOf(s);
  if (union) {
    const parts = [...new Set(union.members.map(typeLabel))];
    return [...parts, ...(union.nullable ? ["null"] : [])].join(" | ") || "null";
  }
  const { list, nullable } = typesOf(s);
  let label;
  if ("const" in s) label = quote(s.const);
  else if (Array.isArray(s.enum)) label = s.enum.map(quote).join(" | ");
  else if (list.includes("array")) {
    const inner = typeLabel(s.items ?? {});
    label = `${inner.includes(" | ") ? `(${inner})` : inner}[]`;
  } else if (list.length) label = list.map((t) => (t === "string" && s.format ? `string<${s.format}>` : t)).join(" | ");
  else label = s.properties ? "object" : "any";
  return nullable && !label.endsWith("| null") ? `${label} | null` : label;
}

/** Escape MDX-significant characters outside inline code spans. */
function prose(text) {
  return String(text ?? "")
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/[{}]/g, (c) => `\\${c}`).replace(/</g, "&lt;")))
    .join("")
    .trim();
}

const attr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Notes beyond the description: allowed values and constraints. */
function constraints(s) {
  const notes = [];
  if (s.not && Array.isArray(s.not.enum)) notes.push("Any value not matched by the other shapes.");
  if (s.pattern) notes.push(`Pattern: \`${s.pattern}\``);
  for (const [k, word] of [["minimum", "Minimum"], ["maximum", "Maximum"], ["minLength", "Minimum length"], ["maxLength", "Maximum length"], ["maxItems", "Maximum items"]]) {
    if (k in s) notes.push(`${word}: \`${s[k]}\``);
  }
  return notes;
}

/** The object schema whose fields a value shows: itself, or an array's item. */
function containerOf(schema) {
  const [s] = deref(schema);
  if (typesOf(s).list.includes("array")) return containerOf(s.items ?? {});
  const union = unionOf(s);
  if (union) {
    const objects = union.members.filter(isObject);
    if (objects.length === 1) return containerOf(objects[0]);
    if (objects.length > 1) return { variants: objects };
    return null;
  }
  return isObject(s) ? { object: schema } : null;
}

/** The property every variant pins with a distinct `const`, if any. */
function discriminator(variants) {
  const resolved = variants.map((v) => deref(v)[0]);
  const keys = Object.keys(resolved[0].properties ?? {});
  return keys.find((k) => {
    const consts = resolved.map((v) => deref(v.properties?.[k])[0]).filter((p) => p && "const" in p).map((p) => p.const);
    return consts.length >= resolved.length - 1 && new Set(consts).size === consts.length && consts.length > 1;
  });
}

const humanize = (title) => title.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

function variantTitle(variant, key) {
  const [v, refs] = deref(variant);
  const pinned = key && deref(v.properties?.[key])[0];
  if (pinned && "const" in pinned) return String(pinned.const);
  const title = v.title ?? refs.at(-1)?.split("/").pop() ?? "variant";
  const words = humanize(title);
  return words.startsWith("other ") ? `any ${words}` : words;
}

function fieldsOf(objectSchema, depth, path) {
  const [s] = deref(objectSchema);
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {}).map(([name, p]) => field(name, p, required.has(name), depth, path));
}

function children(schema, depth, path) {
  const [, refs] = deref(schema);
  if (depth >= MAX_DEPTH || refs.some((r) => path.includes(r))) return "";
  const next = [...path, ...refs];
  const container = containerOf(schema);
  if (!container) return "";
  if (container.object) {
    const innerRefs = deref(container.object)[1].filter((r) => !refs.includes(r));
    if (innerRefs.some((r) => next.includes(r))) return "";
    const inner = fieldsOf(container.object, depth + 1, [...next, ...innerRefs]);
    return inner.length ? `<Expandable title="child attributes">\n${inner.join("\n\n")}\n</Expandable>` : "";
  }
  const key = discriminator(container.variants);
  const shared = sharedFields(container.variants, key);
  const out = [];
  if (shared.length) {
    const [first] = deref(container.variants[0]);
    const required = new Set(first.required ?? []);
    const inner = shared.map((name) => field(name, first.properties[name], required.has(name), depth + 1, next));
    out.push("Every shape has these fields:", `<Expandable title="child attributes">\n${inner.join("\n\n")}\n</Expandable>`);
  }
  const which = key ? `, told apart by \`${key}\`` : "";
  out.push(shared.length ? `Each shape adds its own fields${which}:` : `One of these shapes${which}:`);
  for (const variant of container.variants) {
    const [v, innerRefs] = deref(variant);
    const body = [prose(v.description)];
    if (!innerRefs.some((r) => next.includes(r))) {
      const required = new Set(v.required ?? []);
      const own = Object.entries(v.properties ?? {}).filter(([name]) => !shared.includes(name));
      body.push(...own.map(([name, p]) => field(name, p, required.has(name), depth + 1, [...next, ...innerRefs])));
    }
    out.push(`<Expandable title="${attr(variantTitle(variant, key))}">\n${body.filter(Boolean).join("\n\n")}\n</Expandable>`);
  }
  return out.join("\n\n");
}

/** Fields every variant declares identically (same schema, same required-ness), so they're listed once. */
function sharedFields(variants, key) {
  const resolved = variants.map((v) => deref(v)[0]);
  const sig = (v, name) => JSON.stringify([v.properties?.[name], (v.required ?? []).includes(name)]);
  return Object.keys(resolved[0].properties ?? {}).filter(
    (name) => name !== key && resolved.every((v) => v.properties && name in v.properties && sig(v, name) === sig(resolved[0], name)),
  );
}

function field(name, schema, required, depth, path) {
  const [s] = deref(schema);
  const attrs = [`name="${attr(name)}"`, `type="${attr(typeLabel(schema))}"`];
  if (s.default !== undefined && s.default !== null) attrs.push(`default="${attr(JSON.stringify(s.default))}"`);
  if (required) attrs.push("required");
  if (s.deprecated) attrs.push("deprecated");
  const body = [prose(s.description), ...constraints(s).map(prose), children(schema, depth, path)].filter(Boolean);
  if (!body.length) return `<ResponseField ${attrs.join(" ")} />`;
  return `<ResponseField ${attrs.join(" ")}>\n\n${body.join("\n\n")}\n\n</ResponseField>`;
}

const byDirection = (action) =>
  Object.values(doc.operations).filter((op) => op.action === action).map((op) => deref(op.messages[0])[0]);

function write(path, lines) {
  const target = new URL(`../docs/content/${path}`, import.meta.url);
  mkdirSync(new URL(".", target), { recursive: true });
  writeFileSync(target, lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
}

function frontmatter(title, description) {
  return [
    "---", `title: "${title}"`, `description: "${description}"`, `sidebarTitle: "${title}"`, "---", "",
    "{/* Generated from packages/platform/asyncapi.json by scripts/events-to-mdx.mjs in base44/javascript-sdk. */}", "",
  ];
}

function dataFields(message) {
  const data = deref(message.payload)[0].properties.data;
  const fields = deref(data)[0].properties ? fieldsOf(data, 0, deref(data)[1]) : [];
  return fields.length ? fields.join("\n\n") : "`data` is empty.";
}

// The beta notice rides on every message; the page shows it once, above the messages.
const NOTICE = /<Info>[\s\S]*?<\/Info>\s*/;
const notice = Object.values(doc.components.messages).map((m) => m.description?.match(NOTICE)?.[0].trim()).find(Boolean);
const describe = (message) => prose((message.description ?? message.summary ?? "").replace(NOTICE, ""));
const serverMessages = byDirection("send");
const clientMessages = byDirection("receive");
const [envelope] = deref(serverMessages[0].payload);
const envelopeRequired = new Set(envelope.required ?? []);
// The envelope's own fields only: what `data` holds is listed under each event.
const envelopeFields = Object.entries(envelope.properties).map(([name, schema]) => field(name, schema, envelopeRequired.has(name), MAX_DEPTH, []));
// A short event, so the format section shows the envelope rather than a payload.
const FORMAT_EXAMPLE = "preview.navigation_requested";
const example = (message) =>
  (message.examples ?? []).slice(0, 1).flatMap((e) => ["```json Example", JSON.stringify(e.payload, null, 2), "```", ""]);

const protocol = [
  ...frontmatter("Socket messages", "Every message on a socket session's connection, in both directions, and its payload."),
  ...(notice ? [notice, ""] : []),
  prose(doc.info.description), "",
  prose(doc.servers.platform.description), "",
  prose(doc.channels.platform.description), "",
  "## Event format", "",
  "Every event the server sends is an object with two fields:", "",
  envelopeFields.join("\n\n"), "",
  ...example(serverMessages.find((m) => m.name === FORMAT_EXAMPLE) ?? serverMessages[0]),
  "## Events from the server", "",
];
for (const message of serverMessages) {
  protocol.push(`### \`${message.name}\``, "", describe(message), "", "**`data` fields**", "", dataFields(message), "", ...example(message));
}
protocol.push("## Messages from the browser", "");
for (const message of clientMessages) {
  const [payload] = deref(message.payload);
  protocol.push(`### \`${message.name}\``, "", describe(message), "");
  protocol.push(`The payload is a \`${typeLabel(message.payload)}\`, not an object. ${constraints(payload).map(prose).join(" ")}`.trim(), "", ...example(message));
}
write("protocol/socket-messages.mdx", protocol);

console.log(`Wrote ${serverMessages.length + clientMessages.length} messages to protocol/socket-messages.mdx`);
