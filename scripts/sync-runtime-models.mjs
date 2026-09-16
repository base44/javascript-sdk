#!/usr/bin/env node
/**
 * Sync the `InvokeLLMParams.model` union with apper's `RuntimeModel` enum.
 *
 * apper (backend/app/integrations/core/runtime_model_config.py) is the source
 * of truth for which model presets `InvokeLLM` accepts. This script reads that
 * Python file, extracts the enum's string values (minus `automatic`, which is
 * the server-side default and is not a selectable preset), and rewrites the two
 * places in `src/modules/integrations.types.ts` that list them:
 *
 *   1. the `model?: 'a' | 'b' | ...;` union on `InvokeLLMParams`
 *   2. the JSDoc line above it: ` * Options: `"a"`, `"b"`, ...`
 *
 * Both are rewritten in apper's declaration order, so the output is a pure
 * function of the Python file and running twice is a no-op.
 *
 * It is deliberately strict. A regex that silently stops matching would turn a
 * drift checker into a machine that reports "in sync" forever, so every anchor
 * this script depends on is asserted and the run fails loudly if any is missing.
 * No dependencies: it runs before `npm ci` in CI and from a plain checkout locally.
 *
 * Usage:
 *   node scripts/sync-runtime-models.mjs --source <runtime_model_config.py> [options]
 *
 *   --source <path>    apper's runtime_model_config.py (required)
 *   --target <path>    the .types.ts to rewrite (default: src/modules/integrations.types.ts)
 *   --write            apply the change (default: report only)
 *   --check            exit 2 if drift exists (for CI gates; implies no write)
 *   --summary <path>   write a Markdown summary (used as the PR body)
 *
 * Exit codes: 0 in sync or synced, 1 parse/validation failure, 2 drift (--check only).
 * When GITHUB_OUTPUT is set, also emits `changed`, `added`, `removed`.
 */

import { readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = join(REPO_ROOT, "src/modules/integrations.types.ts");

// The enum member that is intentionally NOT part of the SDK union. Its presence
// is also asserted: if apper renames or removes it, the enum's shape changed in
// a way a human should look at before this script keeps going.
const EXCLUDED_MEMBER = "automatic";
// The union must contain at least this many presets. A smaller result almost
// certainly means the parser matched the wrong block, not that apper shipped
// with one model.
const MIN_MODELS = 3;
// Model presets are used as TypeScript string literals and in Markdown code
// spans, so restrict them to characters that need no escaping in either.
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
// How far above the `model?:` line the `Options:` JSDoc line may sit and still
// be treated as its documentation.
const MAX_OPTIONS_DISTANCE = 20;

class SyncError extends Error {}

function parseArgs(argv) {
  const opts = { source: null, target: DEFAULT_TARGET, write: false, check: false, summary: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new SyncError(`${arg} requires a value`);
      return argv[++i];
    };
    switch (arg) {
      case "--source": opts.source = resolve(next()); break;
      case "--target": opts.target = resolve(next()); break;
      case "--summary": opts.summary = resolve(next()); break;
      case "--write": opts.write = true; break;
      case "--check": opts.check = true; break;
      case "--help": case "-h":
        console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
        process.exit(0);
        break;
      default: throw new SyncError(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.source) throw new SyncError("--source is required");
  if (opts.check && opts.write) throw new SyncError("--check and --write are mutually exclusive");
  return opts;
}

/**
 * Extract the string values of `class RuntimeModel(...)` from apper's Python
 * source, in declaration order.
 */
export function parseRuntimeModels(pySource) {
  const lines = pySource.split(/\r?\n/);
  const headerRe = /^class RuntimeModel\b.*:\s*(#.*)?$/;
  const headers = lines.map((l, i) => (headerRe.test(l) ? i : -1)).filter((i) => i >= 0);
  if (headers.length !== 1) {
    throw new SyncError(
      `Expected exactly one 'class RuntimeModel' definition, found ${headers.length}`,
    );
  }

  const members = [];
  const unrecognized = [];
  let inDocstring = false;
  for (let i = headers[0] + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    // A non-indented line ends the class body.
    if (!/^\s/.test(line)) break;

    const trimmed = line.trim();
    const tripleQuotes = (trimmed.match(/"""|'''/g) || []).length;
    if (inDocstring) {
      if (tripleQuotes % 2 === 1) inDocstring = false;
      continue;
    }
    if (tripleQuotes > 0) {
      if (tripleQuotes % 2 === 1) inDocstring = true;
      continue;
    }
    if (trimmed.startsWith("#")) continue;

    const m = /^\s+([A-Z][A-Z0-9_]*)\s*=\s*(?:"([^"\\]*)"|'([^'\\]*)')\s*(?:#.*)?$/.exec(line);
    if (m) {
      members.push({ name: m[1], value: m[2] ?? m[3] });
    } else {
      unrecognized.push(`${i + 1}: ${trimmed}`);
    }
  }

  if (unrecognized.length > 0) {
    throw new SyncError(
      "RuntimeModel body contains lines this script does not understand; " +
        "update parseRuntimeModels() rather than trusting a partial result:\n  " +
        unrecognized.join("\n  "),
    );
  }

  const values = members.map((m) => m.value);
  if (!values.includes(EXCLUDED_MEMBER)) {
    throw new SyncError(
      `RuntimeModel no longer has a "${EXCLUDED_MEMBER}" member; its shape changed, review manually`,
    );
  }
  const seen = new Set();
  for (const v of values) {
    if (!SAFE_VALUE.test(v)) throw new SyncError(`RuntimeModel value ${JSON.stringify(v)} has unexpected characters`);
    if (seen.has(v)) throw new SyncError(`RuntimeModel value ${JSON.stringify(v)} is declared twice`);
    seen.add(v);
  }

  const models = values.filter((v) => v !== EXCLUDED_MEMBER);
  if (models.length < MIN_MODELS) {
    throw new SyncError(`Only ${models.length} model(s) parsed; expected at least ${MIN_MODELS}`);
  }
  return models;
}

const UNION_RE = /^([ \t]*)model\?: ('[^'\n]*'(?: \| '[^'\n]*')*);[ \t]*$/;
const OPTIONS_RE = /^([ \t]*\* Options: )(`"[^"\n]*"`(?:, `"[^"\n]*"`)*)[ \t]*$/;

function findSingleLine(lines, re, what) {
  const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) {
    throw new SyncError(`Expected exactly one ${what} line in the target, found ${hits.length}`);
  }
  return hits[0];
}

/**
 * Locate the union and its Options JSDoc line in the TypeScript source and
 * return the current model list plus enough context to rewrite both.
 */
export function parseTarget(tsSource) {
  const lines = tsSource.split("\n");
  const unionIdx = findSingleLine(lines, UNION_RE, "`model?:` union");
  const optionsIdx = findSingleLine(lines, OPTIONS_RE, "`* Options:` JSDoc");
  if (optionsIdx >= unionIdx || unionIdx - optionsIdx > MAX_OPTIONS_DISTANCE) {
    throw new SyncError(
      `The Options line (${optionsIdx + 1}) must sit within ${MAX_OPTIONS_DISTANCE} lines above the union (${unionIdx + 1})`,
    );
  }
  const unionMatch = UNION_RE.exec(lines[unionIdx]);
  const optionsMatch = OPTIONS_RE.exec(lines[optionsIdx]);
  const unionModels = [...unionMatch[2].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const optionModels = [...optionsMatch[2].matchAll(/`"([^"]*)"`/g)].map((m) => m[1]);
  return {
    lines,
    unionIdx,
    optionsIdx,
    unionIndent: unionMatch[1],
    optionsPrefix: optionsMatch[1],
    unionModels,
    optionModels,
  };
}

export function renderUnion(indent, models) {
  return `${indent}model?: ${models.map((m) => `'${m}'`).join(" | ")};`;
}

export function renderOptions(prefix, models) {
  return `${prefix}${models.map((m) => `\`"${m}"\``).join(", ")}`;
}

/** Other `src/` mentions of removed models, for the human reading the PR. */
function findMentions(models, targetPath) {
  if (models.length === 0) return [];
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|mts|cts|js|mjs)$/.test(entry) && resolve(full) !== resolve(targetPath)) {
        readFileSync(full, "utf8").split("\n").forEach((line, i) => {
          for (const m of models) {
            if (new RegExp(`['"\`]${m.replace(/[.-]/g, "\\$&")}['"\`]`).test(line)) {
              hits.push({ file: relative(REPO_ROOT, full), line: i + 1, model: m });
            }
          }
        });
      }
    }
  };
  walk(join(REPO_ROOT, "src"));
  return hits;
}

function renderSummary({ models, target, added, removed, orderChanged, mentions, changed }) {
  const code = (v) => `\`${v}\``;
  const out = [];
  if (!changed) {
    out.push(`\`${relative(REPO_ROOT, target.path)}\` already matches apper's \`RuntimeModel\` enum (${models.length} presets).`);
    return out.join("\n") + "\n";
  }
  out.push(`Syncs the \`InvokeLLMParams.model\` union in \`${relative(REPO_ROOT, target.path)}\` with apper's \`RuntimeModel\` enum.`);
  out.push("");
  if (added.length) out.push(`**Added:** ${added.map(code).join(", ")}`);
  if (removed.length) out.push(`**Removed:** ${removed.map(code).join(", ")}`);
  if (!added.length && !removed.length && orderChanged) out.push("**Reordered** to match apper's declaration order (same set of models).");
  out.push("");
  out.push(`**Union after sync (${models.length}):** ${models.map(code).join(", ")}`);
  if (removed.length) {
    out.push("");
    out.push("> **Removing a preset is a breaking change for SDK users** who pass it. Confirm apper still accepts the old value (aliases in `_LEGACY_MODEL_ALIASES`) before merging, and consider a changelog entry.");
  }
  if (mentions.length) {
    out.push("");
    out.push("**Other mentions of removed models in `src/` (not rewritten, review by hand):**");
    for (const h of mentions) out.push(`- \`${h.file}:${h.line}\` mentions ${code(h.model)}`);
  }
  out.push("");
  out.push("After this merges, the Publish SDK Change to Docs workflow opens a mintlify-docs PR containing only the docs impact of this change.");
  return out.join("\n") + "\n";
}

function emitGithubOutput(kv) {
  if (!process.env.GITHUB_OUTPUT) return;
  const body = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  appendFileSync(process.env.GITHUB_OUTPUT, body);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const models = parseRuntimeModels(readFileSync(opts.source, "utf8"));
  const tsSource = readFileSync(opts.target, "utf8");
  const target = { path: opts.target, ...parseTarget(tsSource) };

  const current = target.unionModels;
  if (JSON.stringify(target.optionModels) !== JSON.stringify(current)) {
    console.warn(
      "warning: the Options JSDoc line and the union currently disagree; both will be rewritten from apper",
    );
  }

  const currentSet = new Set(current);
  const nextSet = new Set(models);
  const added = models.filter((m) => !currentSet.has(m));
  const removed = current.filter((m) => !nextSet.has(m));
  const orderChanged = added.length === 0 && removed.length === 0 && JSON.stringify(models) !== JSON.stringify(current);

  const newUnion = renderUnion(target.unionIndent, models);
  const newOptions = renderOptions(target.optionsPrefix, models);
  const changed =
    newUnion !== target.lines[target.unionIdx] || newOptions !== target.lines[target.optionsIdx];

  const mentions = findMentions(removed, opts.target);
  const summary = renderSummary({ models, target, added, removed, orderChanged, mentions, changed });

  if (opts.summary) writeFileSync(opts.summary, summary);
  emitGithubOutput({ changed: String(changed), added: added.join(","), removed: removed.join(",") });

  process.stdout.write(summary);

  if (!changed) return 0;
  if (opts.check) {
    console.error("drift detected (--check)");
    return 2;
  }
  if (opts.write) {
    const lines = [...target.lines];
    lines[target.unionIdx] = newUnion;
    lines[target.optionsIdx] = newOptions;
    writeFileSync(opts.target, lines.join("\n"));
    console.error(`wrote ${relative(REPO_ROOT, opts.target)}`);
  } else {
    console.error("dry run: pass --write to apply");
  }
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
