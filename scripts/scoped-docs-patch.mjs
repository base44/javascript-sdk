#!/usr/bin/env node
/**
 * Apply ONLY the docs impact of one SDK change to a mintlify-docs checkout.
 *
 * `npm run create-docs-local` republishes the whole generated reference, which
 * drags every unpublished JSDoc change into the same PR. This script isolates a
 * single change instead: given the generated `docs/content` trees from BEFORE
 * and AFTER that change, it diffs them and applies that diff (and nothing else)
 * to the published English pages and every locale mirror in mintlify-docs.
 *
 * Deliberately narrow:
 *   - Only modified pages are handled. An added or removed page also needs a
 *     `docs.json` nav update, which is the full pipeline's job, so that case
 *     fails with instructions instead of shipping a broken nav.
 *   - `git apply --check` runs for every locale before anything is written. If
 *     the published page has unpublished drift in the same lines, the patch
 *     will not apply and this fails loudly rather than guessing.
 *
 * Usage:
 *   node scripts/scoped-docs-patch.mjs --base <content-dir> --head <content-dir> \
 *     --target <mintlify-docs root> [--apply] [--summary <path>]
 *
 * Exit codes: 0 applied or nothing to apply, 1 validation/apply failure.
 * When GITHUB_OUTPUT is set, emits `changed` and `files`.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SDK_DOCS_PATH = "developers/references/sdk/docs";
// Excluded from the diff: the copy pipeline drops it, so it is never published.
const IGNORED = new Set(["README.mdx"]);
const MAX_PATCH_IN_SUMMARY = 20_000;

class PatchError extends Error {}

function parseArgs(argv) {
  const opts = { base: null, head: null, target: null, apply: false, summary: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new PatchError(`${arg} requires a value`);
      return resolve(argv[++i]);
    };
    switch (arg) {
      case "--base": opts.base = next(); break;
      case "--head": opts.head = next(); break;
      case "--target": opts.target = next(); break;
      case "--summary": opts.summary = next(); break;
      case "--apply": opts.apply = true; break;
      default: throw new PatchError(`Unknown argument: ${arg}`);
    }
  }
  for (const k of ["base", "head", "target"]) {
    if (!opts[k]) throw new PatchError(`--${k} is required`);
    if (!existsSync(opts[k]) || !statSync(opts[k]).isDirectory()) throw new PatchError(`--${k} is not a directory: ${opts[k]}`);
  }
  if (!existsSync(join(opts.target, "docs.json"))) throw new PatchError(`${opts.target} has no docs.json; is it a mintlify-docs checkout?`);
  return opts;
}

/** Run git; `okCodes` lists exit codes that are not failures (diff exits 1 on differences). */
function git(args, { cwd, okCodes = [0] } = {}) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    if (okCodes.includes(err.status)) return err.stdout ?? "";
    throw new PatchError(`git ${args.join(" ")} failed (exit ${err.status}):\n${(err.stderr || "").trim()}`);
  }
}

/**
 * Copy both generated trees into one scratch dir as `base/` and `head/` so git
 * sees short relative paths. That fixes the patch headers to `a/base/<file>`
 * and `b/head/<file>`, which `git apply -p2` reduces to `<file>`.
 */
function stageTrees(base, head) {
  const work = mkdtempSync(join(tmpdir(), "scoped-docs-"));
  cpSync(base, join(work, "base"), { recursive: true });
  cpSync(head, join(work, "head"), { recursive: true });
  return work;
}

/** Files that differ between `base/` and `head/` in the scratch dir, as {status, path}. */
function diffTrees(work) {
  const out = git(["diff", "--no-index", "--name-status", "--", "base", "head"], { cwd: work, okCodes: [0, 1] });
  const entries = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    const rel = paths[paths.length - 1].replace(/^(head|base)\//, "");
    if (IGNORED.has(rel)) continue;
    entries.push({ status: status[0], path: rel });
  }
  return entries;
}

function localePrefixes(target) {
  const docs = JSON.parse(readFileSync(join(target, "docs.json"), "utf8"));
  const languages = docs.navigation?.languages;
  if (!Array.isArray(languages) || languages.length === 0) {
    throw new PatchError("docs.json has no navigation.languages; the locale layout this script expects is gone");
  }
  const locales = languages.filter((l) => !l.default).map((l) => l.language);
  if (locales.length === 0) throw new PatchError("docs.json lists no non-default locales; expected mirrors like de/, es/");
  return ["", ...locales.map((l) => `${l}/`)];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const work = stageTrees(opts.base, opts.head);
  const entries = diffTrees(work);
  const summaryLines = [];
  const emit = (kv) => {
    if (!process.env.GITHUB_OUTPUT) return;
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(kv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  };
  const finish = (text) => {
    if (opts.summary) writeFileSync(opts.summary, text);
    process.stdout.write(text);
  };

  if (entries.length === 0) {
    emit({ changed: "false", files: "" });
    finish("No generated reference page differs between the two SDK states, so there is nothing to publish.\n");
    return 0;
  }

  const notModified = entries.filter((e) => e.status !== "M");
  if (notModified.length > 0) {
    throw new PatchError(
      "This change adds or removes reference pages, which also needs a docs.json nav update. " +
        "Run `npm run create-docs-local` and open that PR by hand instead:\n  " +
        notModified.map((e) => `${e.status} ${e.path}`).join("\n  "),
    );
  }

  // One patch, built per file so the ignored files never enter it. Headers are
  // `a/base/<file>` and `b/head/<file>`; `git apply -p2 --directory=...` strips
  // the two leading components and re-roots each file under the docs tree.
  const relPatch = entries
    .map((e) => git(["diff", "--no-index", "--", `base/${e.path}`, `head/${e.path}`], { cwd: work, okCodes: [0, 1] }))
    .join("");
  const patchPath = join(work, "changes.patch");
  writeFileSync(patchPath, relPatch);

  const prefixes = localePrefixes(opts.target);
  const failures = [];
  for (const prefix of prefixes) {
    try {
      git(["apply", "--check", "-p2", `--directory=${prefix}${SDK_DOCS_PATH}`, patchPath], { cwd: opts.target });
    } catch (err) {
      failures.push(`${prefix || "(en)"}: ${err.message.split("\n").slice(1).join(" ").trim()}`);
    }
  }
  if (failures.length > 0) {
    throw new PatchError(
      "The change does not apply cleanly to the published docs. The published page probably has " +
        "unpublished drift in the same lines. Regenerate with `npm run create-docs-local` and open that PR by hand.\n  " +
        failures.join("\n  "),
    );
  }

  if (opts.apply) {
    for (const prefix of prefixes) {
      git(["apply", "-p2", `--directory=${prefix}${SDK_DOCS_PATH}`, patchPath], { cwd: opts.target });
    }
    const touched = git(["status", "--porcelain", "--", SDK_DOCS_PATH, `*/${SDK_DOCS_PATH}/*`], { cwd: opts.target })
      .split("\n").filter(Boolean).length;
    const expected = entries.length * prefixes.length;
    if (touched !== expected) {
      throw new PatchError(`Expected ${expected} modified files after applying (${entries.length} page(s) x ${prefixes.length} locale dirs), found ${touched}`);
    }
  }

  emit({ changed: "true", files: entries.map((e) => e.path).join(",") });
  summaryLines.push(`**Pages changed (${entries.length}):**`);
  for (const e of entries) summaryLines.push(`- \`${SDK_DOCS_PATH}/${e.path}\``);
  summaryLines.push("");
  summaryLines.push(`Applied to the English pages and ${prefixes.length - 1} locale mirrors (${prefixes.slice(1).map((p) => `\`${p.slice(0, -1)}\``).join(", ")}). Only the lines this SDK change produced are included; other unpublished reference drift is left alone.`);
  summaryLines.push("");
  summaryLines.push("<details><summary>Change applied to each copy</summary>");
  summaryLines.push("");
  summaryLines.push("```diff");
  summaryLines.push(relPatch.length > MAX_PATCH_IN_SUMMARY ? relPatch.slice(0, MAX_PATCH_IN_SUMMARY) + "\n... (truncated)" : relPatch.trimEnd());
  summaryLines.push("```");
  summaryLines.push("");
  summaryLines.push("</details>");
  finish(summaryLines.join("\n") + "\n");
  if (!opts.apply) console.error("dry run: pass --apply to write into the target");
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  if (err instanceof PatchError) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
