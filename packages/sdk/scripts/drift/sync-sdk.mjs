#!/usr/bin/env node
/**
 * Drift checks 1, 2 and 3: brings the SDK's copies of apper values up to date from the
 * JSON that extract_apper.py prints.
 *
 *   models       `InvokeLLMParams.model` union and its `Options:` JSDoc line
 *   tool-status  `AgentMessageToolCall.status` union
 *   connectors   the "Available connectors" JSDoc table in connectors.types.ts
 *
 * The two unions only ever gain values: removing one breaks TypeScript code that uses it,
 * so values apper dropped are listed in the summary for a person to decide. The Options
 * line, which readers see in the docs, lists exactly what apper offers.
 *
 * Usage:
 *   node sync-sdk.mjs --check <models|tool-status|connectors> --source <extract.json> --summary <out.md>
 *
 * Writes the target file in place. Exit codes: 0 done (in sync or synced), 1 failure.
 * When GITHUB_OUTPUT is set, emits `changed`.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/modules");
// Safe to embed unescaped in a TS string literal and a Markdown code span.
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const UNION_RE = /^([ \t]*)model\?: ('[^']*'(?: \| '[^']*')*);$/;
const OPTIONS_RE = /^([ \t]*\* Options: )(`"[^"]*"`(?:, `"[^"]*"`)*)$/;
const MAX_OPTIONS_DISTANCE = 20;
const STATUS_RE = /^([ \t]*)status: ("[^"]*"(?: \| "[^"]*")*);$/;
const CONNECTOR_ROW_RE = /^ \* \| (.+?) \| `([^`]+)` \|$/;
// Names that differ from the seed catalog's display_name, used for new rows only.
const DISPLAY_NAMES = { github: "GitHub", one_drive: "Microsoft OneDrive" };
// Connector PRs aren't auto-merged: the seed catalog can't show whether a connector is
// visible to every user, and connectors added through the admin API exist only in the
// database. With a readable live catalog, PRs that only add connectors could auto-merge.

export class SyncError extends Error {}

function singleLine(lines, re, what, from = 0, to = lines.length) {
  const hits = [];
  for (let i = from; i < to; i++) if (re.test(lines[i])) hits.push(i);
  if (hits.length !== 1) throw new SyncError(`Expected one ${what}, found ${hits.length}`);
  return hits[0];
}

function checkValues(values, what) {
  const bad = values.filter((v) => !SAFE_VALUE.test(v));
  if (bad.length) throw new SyncError(`Unexpected characters in ${what}: ${bad.join(", ")}`);
}

/** Union gains apper's new values; the Options line becomes exactly what apper offers. */
export function syncModels(ts, offered) {
  checkValues(offered, "models");
  if (offered.length < 3) throw new SyncError(`Only ${offered.length} offered models; the extractor probably broke`);
  const lines = ts.split("\n");
  const u = singleLine(lines, UNION_RE, "`model?:` union");
  const o = singleLine(lines, OPTIONS_RE, "`* Options:` line", Math.max(0, u - MAX_OPTIONS_DISTANCE), u);
  const [, indent, unionText] = UNION_RE.exec(lines[u]);
  const prefix = OPTIONS_RE.exec(lines[o])[1];
  const current = [...unionText.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const union = [...offered, ...current.filter((m) => !offered.includes(m))];
  lines[u] = `${indent}model?: ${union.map((m) => `'${m}'`).join(" | ")};`;
  lines[o] = `${prefix}${offered.map((m) => `\`"${m}"\``).join(", ")}`;
  return {
    text: lines.join("\n"),
    added: offered.filter((m) => !current.includes(m)),
    retired: current.filter((m) => !offered.includes(m)),
  };
}

/** `AgentMessageToolCall.status` gains apper's new values, appended. */
export function syncToolStatus(ts, values) {
  checkValues(values, "statuses");
  const lines = ts.split("\n");
  const start = singleLine(lines, /^export interface AgentMessageToolCall \{$/, "AgentMessageToolCall interface");
  const end = lines.indexOf("}", start);
  const s = singleLine(lines, STATUS_RE, "`status:` union in AgentMessageToolCall", start, end);
  const [, indent, unionText] = STATUS_RE.exec(lines[s]);
  const current = [...unionText.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const added = values.filter((v) => !current.includes(v));
  lines[s] = `${indent}status: ${[...current, ...added].map((v) => `"${v}"`).join(" | ")};`;
  return { text: lines.join("\n"), added, retired: current.filter((v) => !values.includes(v)) };
}

/** Rows for new public connectors at their alphabetical place; rows apper no longer lists removed. */
export function syncConnectors(ts, connectors) {
  const lines = ts.split("\n");
  const heading = singleLine(lines, /^ \* ## Available connectors$/, "Available connectors heading");
  const header = lines.indexOf(" * | Service | Type identifier |", heading);
  if (header < 0 || lines[header + 1] !== " * |---|---|") throw new SyncError("The Available connectors table header moved");
  let end = header + 2;
  while (CONNECTOR_ROW_RE.test(lines[end])) end++;
  const rows = lines.slice(header + 2, end).map((l) => {
    const [, name, type] = CONNECTOR_ROW_RE.exec(l);
    return { name, type };
  });
  if (connectors.length < 0.7 * rows.length) {
    throw new SyncError(`apper lists ${connectors.length} public connectors but the table has ${rows.length}; the extractor probably broke`);
  }
  const publicTypes = new Set(connectors.map((c) => c.type));
  const documented = new Set(rows.map((r) => r.type));
  const removed = rows.filter((r) => !publicTypes.has(r.type)).map((r) => r.type);
  const kept = rows.filter((r) => publicTypes.has(r.type));
  const added = [];
  for (const c of connectors.filter((c) => !documented.has(c.type))) {
    checkValues([c.type], "connector types");
    const name = DISPLAY_NAMES[c.type] ?? c.name;
    if (!name || name.includes("|")) throw new SyncError(`Unusable display name for ${c.type}`);
    const at = kept.findIndex((r) => r.name.localeCompare(name, "en", { sensitivity: "base" }) > 0);
    kept.splice(at < 0 ? kept.length : at, 0, { name, type: c.type });
    added.push({ name, type: c.type });
  }
  lines.splice(header + 2, end - header - 2, ...kept.map((r) => ` * | ${r.name} | \`${r.type}\` |`));
  return { text: lines.join("\n"), added, removed };
}

const CHECKS = {
  models: {
    file: "integrations.types.ts",
    run: (ts, src) => syncModels(ts, src.offered),
    summary: ({ added, retired }) => [
      added.length ? `**Added to the \`InvokeLLMParams.model\` union:** ${added.map(code).join(", ")}` : null,
      "The `Options:` line now lists exactly the models apper offers.",
      retired.length ? `**No longer offered by apper, kept in the union** so existing code keeps compiling: ${retired.map(code).join(", ")}. Removing them is a breaking change for a person to decide.` : null,
    ],
  },
  "tool-status": {
    file: "agents.types.ts",
    run: (ts, src) => syncToolStatus(ts, src.values),
    summary: ({ added, retired }) => [
      added.length ? `**Added to the \`AgentMessageToolCall.status\` union:** ${added.map(code).join(", ")}` : null,
      retired.length ? `**No longer in apper, kept in the union** so existing code keeps compiling: ${retired.map(code).join(", ")}. Removing them is a breaking change for a person to decide.` : null,
    ],
  },
  connectors: {
    file: "connectors.types.ts",
    run: (ts, src) => syncConnectors(ts, src.connectors),
    summary: ({ added, removed }, src) => [
      added.length ? `**Added to the Available connectors table:** ${added.map((c) => `${c.name} (${code(c.type)})`).join(", ")}. Check each display name.` : null,
      removed.length ? `**Removed from the table** (no longer in apper's catalog, or now behind a flag): ${removed.map(code).join(", ")}` : null,
      src.gated ? `${src.gated} connectors in apper's catalog are behind a feature flag or in beta, so they're left out.` : null,
    ],
  },
};

function code(v) {
  return `\`${v}\``;
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
  );
  const check = CHECKS[args.check];
  if (!check || !args.source || !args.summary) throw new SyncError("Usage: sync-sdk.mjs --check <name> --source <json> --summary <md>");
  const source = JSON.parse(readFileSync(args.source, "utf8"));
  const path = join(MODULES, check.file);
  const before = readFileSync(path, "utf8");
  const result = check.run(before, source);
  const changed = result.text !== before;
  if (changed) writeFileSync(path, result.text);
  const lines = changed ? check.summary(result, source).filter(Boolean) : ["Already in sync with apper."];
  writeFileSync(args.summary, lines.join("\n\n") + "\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  process.stdout.write(lines.join("\n\n") + "\n");
  return 0;
}

// Only run as a CLI when executed directly, so tests can import the functions.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err) {
    if (err instanceof SyncError) {
      console.error(`error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
