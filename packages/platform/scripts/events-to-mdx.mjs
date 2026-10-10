#!/usr/bin/env node
// Renders the events that reach onEvent as an MDX page beside the TypeDoc pages, from the committed
// asyncapi.json, with the ResponseField / Expandable components the rest of the reference uses.
// The event list is the SDK's own (eventNames), so the page and the types come from one copy.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { eventNames } from "../dist/modules/builder-protocol.js";

const MAX_DEPTH = 8;
const source = new URL("../asyncapi.json", import.meta.url);
const target = new URL("../docs/content/events/builder-events.mdx", import.meta.url);
const doc = JSON.parse(readFileSync(source, "utf8"));
const PLATFORM_EVENT = "/developers/references/platform-sdk/docs/interfaces/builder#platformevent";

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

const messages = Object.fromEntries(Object.values(doc.components.messages).map((m) => [m.name, m]));
const lines = [
  "---",
  'title: "Builder events"',
  'description: "Every live event a builder subscription delivers to onEvent, and its payload."',
  'sidebarTitle: "Builder events"',
  "---",
  "",
  "{/* Generated from packages/platform/asyncapi.json by scripts/events-to-mdx.mjs in base44/javascript-sdk. */}",
  "",
  `Each event reaches your \`onEvent\` callback as a [\`PlatformEvent\`](${PLATFORM_EVENT}): \`{ type, appId, data }\`. ` +
    "Check `type` to narrow `data` to that event's payload, listed below. A key missing from `data` means " +
    "the value is unchanged, and an explicit `null` clears it.",
  "",
];
for (const name of eventNames) {
  const message = messages[name];
  const [frame] = deref(message.payload);
  const data = frame.properties.data;
  lines.push(`## \`${name}\``, "", prose(message.description ?? message.summary), "");
  const fields = deref(data)[0].properties ? fieldsOf(data, 0, deref(data)[1]) : [];
  lines.push(fields.length ? fields.join("\n\n") : "`data` is empty.", "");
}
mkdirSync(new URL(".", target), { recursive: true });
writeFileSync(target, lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
console.log(`Wrote ${eventNames.length} events to docs/content/events/builder-events.mdx`);
