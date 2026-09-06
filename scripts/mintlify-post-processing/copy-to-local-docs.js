#!/usr/bin/env node

/**
 * Local docs copy script - copies SDK docs to a local mintlify-docs repo.
 * 
 * Usage:
 *   node copy-to-local-docs.js [--target <path-to-mintlify-docs>]
 * 
 * Options:
 *   --target <path>  Path to the mintlify-docs repo. Defaults to ../mintlify-docs
 *                    (assumes both repos are in the same parent folder)
 * 
 * Examples:
 *   node copy-to-local-docs.js
 *   node copy-to-local-docs.js --target ~/Projects/mintlify-docs
 *   npm run copy-docs-local
 *   npm run copy-docs-local -- --target ~/Projects/mintlify-docs
 */

import fs from "fs";
import path from "path";

console.debug = () => {}; // Disable debug logging. Comment this out to enable debug logging.

const DOCS_SOURCE_PATH = path.join(import.meta.dirname, "../../docs/content");
const CATEGORY_MAP_PATH = path.join(import.meta.dirname, "./category-map.json");

// Default: assume mintlify-docs is a sibling directory to javascript-sdk
const SDK_ROOT = path.join(import.meta.dirname, "../..");
const DEFAULT_TARGET = path.join(SDK_ROOT, "../mintlify-docs");

function parseArgs() {
  const args = process.argv.slice(2);
  let target = DEFAULT_TARGET;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === "--target" || arg === "-t") && i + 1 < args.length) {
      target = args[++i];
      // Expand ~ to home directory
      if (target.startsWith("~")) {
        target = path.join(process.env.HOME, target.slice(1));
      }
      // Resolve to absolute path
      target = path.resolve(target);
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`
Local docs copy script - copies SDK docs to a local mintlify-docs repo.

Usage:
  node copy-to-local-docs.js [--target <path-to-mintlify-docs>]

Options:
  --target, -t <path>  Path to the mintlify-docs repo. 
                       Defaults to ../mintlify-docs (sibling directory)
  --help, -h           Show this help message

Examples:
  node copy-to-local-docs.js
  node copy-to-local-docs.js --target ~/Projects/mintlify-docs
  npm run copy-docs-local
  npm run copy-docs-local -- --target ~/Projects/mintlify-docs
`);
      process.exit(0);
    }
  }

  return { target };
}

// Target location within mintlify-docs for SDK reference docs
const SDK_DOCS_TARGET_PATH = "developers/references/sdk/docs";

/** Compare two nav page paths by the page name a reader actually sees. */
function byPageName(a, b) {
  return a
    .split("/")
    .pop()
    .localeCompare(b.split("/").pop(), "en", { sensitivity: "base" });
}

function scanSdkDocs(sdkDocsDir) {
  const result = {};

  // Get a list of all the subdirectories in the sdkDocsDir
  const subdirectories = fs
    .readdirSync(sdkDocsDir)
    .filter((file) => fs.statSync(path.join(sdkDocsDir, file)).isDirectory());
  console.log(`Subdirectories: ${subdirectories}`);

  for (const subdirectory of subdirectories) {
    const subdirectoryPath = path.join(sdkDocsDir, subdirectory);
    const files = fs
      .readdirSync(subdirectoryPath)
      .filter((file) => file.endsWith(".mdx"));
    result[subdirectory] = files.map((file) => path.basename(file, ".mdx"));
  }
  return result;
}

function updateDocsJson(repoDir, sdkFiles) {
  const docsJsonPath = path.join(repoDir, "docs.json");
  let categoryMap = {};
  try {
    categoryMap = JSON.parse(fs.readFileSync(CATEGORY_MAP_PATH, "utf8"));
  } catch (e) {
    console.error(`Error: Category map file not found: ${CATEGORY_MAP_PATH}`);
    process.exit(1);
  }

  console.log(`Reading docs.json from ${docsJsonPath}...`);
  const docsContent = fs.readFileSync(docsJsonPath, "utf8");
  const docs = JSON.parse(docsContent);

  // Build the SDK Reference groups. `prefix` is "" for the default (English)
  // language and "<locale>/" for every other locale. The generated reference
  // mdx is English-only, but each locale gets its OWN prefixed page paths
  // (e.g. es/developers/references/sdk/docs/...) pointing at English-content
  // copies written into that locale's directory. UNIQUE per-locale paths are
  // essential: pointing multiple locales at the same un-prefixed English path
  // creates duplicate page records and makes Mintlify emit each SDK page N times
  // in llms-full.txt. They also make the language switcher resolve to the
  // in-locale SDK page instead of falling back to the Documentation tab.
  const basePath = SDK_DOCS_TARGET_PATH;

  const buildSdkReferencePages = (prefix) => {
    const groupMap = new Map(); // group name -> pages array
    const addToGroup = (groupName, pages) => {
      if (!groupName || pages.length === 0) return;
      if (!groupMap.has(groupName)) groupMap.set(groupName, []);
      groupMap.get(groupName).push(...pages);
    };
    const p = (kind, file) => `${prefix}${basePath}/${kind}/${file}`;

    if (sdkFiles.functions?.length > 0 && categoryMap.functions)
      addToGroup(categoryMap.functions, sdkFiles.functions.map((f) => p("functions", f)));
    if (sdkFiles.interfaces?.length > 0 && categoryMap.interfaces)
      addToGroup(categoryMap.interfaces, sdkFiles.interfaces.map((f) => p("interfaces", f)));
    if (sdkFiles.classes?.length > 0 && categoryMap.classes)
      addToGroup(categoryMap.classes, sdkFiles.classes.map((f) => p("classes", f)));
    if (sdkFiles["type-aliases"]?.length > 0 && categoryMap["type-aliases"])
      addToGroup(categoryMap["type-aliases"], sdkFiles["type-aliases"].map((f) => p("type-aliases", f)));

    return Array.from(groupMap.entries()).map(([group, pages]) => ({
      group,
      expanded: true,
      // Sort on the page name, not the full path. A module lands in
      // interfaces/ or type-aliases/ depending on how it is declared, which is
      // invisible to the reader, and sorting on the path groups by that
      // instead: every interfaces/ module first, then the alphabet restarting
      // for the type-aliases/ ones.
      pages: pages.sort((a, b) => byPageName(a, b)),
    }));
  };

  // docs.json supports three navigation shapes we've seen in the wild:
  //   1. top-level tabs (legacy)                navigation.tabs
  //   2. top-level tabs with dropdowns/anchors  navigation.tabs[].dropdowns | .anchors
  //   3. i18n layout (current)                  navigation.languages[].tabs[]...
  // We iterate per language so we know each one's locale prefix, and only touch
  // the SDK Reference group WITHIN that language (matched by its own prefixed
  // sdk/docs paths). The translated group/subgroup labels are preserved.
  const languageEntries = docs.navigation.languages
    ? docs.navigation.languages.map((l) => ({
        prefix: l.default ? "" : `${l.language}/`,
        tabs: l.tabs,
      }))
    : [{ prefix: "", tabs: docs.navigation.tabs }];

  if (languageEntries.every((e) => !e.tabs)) {
    console.error("Could not find navigation.tabs or navigation.languages in docs.json");
    process.exit(1);
  }

  let updatedCount = 0;
  for (const { prefix, tabs } of languageEntries) {
    if (!Array.isArray(tabs)) continue;
    const localePathPrefix = `${prefix}${basePath}/`;
    const groupReferencesSdkDocs = (group) =>
      JSON.stringify(group).includes(localePathPrefix);
    const sdkReferencePages = buildSdkReferencePages(prefix);

    for (const tab of tabs) {
      const sdkAnchor =
        tab.dropdowns?.find((d) => d.dropdown === "SDK") ??
        tab.anchors?.find((a) => a.anchor === "SDK");
      if (!sdkAnchor?.groups) continue;

      const sdkRefIndex = sdkAnchor.groups.findIndex(groupReferencesSdkDocs);
      if (sdkRefIndex === -1) continue;

      const existing = sdkAnchor.groups[sdkRefIndex];

      // Preserve existing subgroup labels (translated per locale) by position.
      // Falls back to the English category-map label when no existing subgroup
      // sits at that index (e.g. a locale that gains a new subgroup).
      const existingSubgroups = Array.isArray(existing.pages) ? existing.pages : [];
      const localizedPages = sdkReferencePages.map((g, i) => ({
        ...g,
        group: existingSubgroups[i]?.group ?? g.group,
      }));

      sdkAnchor.groups[sdkRefIndex] = {
        ...existing,
        group: existing.group,
        icon: existing.icon ?? "brackets-curly",
        expanded: true,
        pages: localizedPages,
      };
      updatedCount++;
    }
  }

  if (updatedCount === 0) {
    console.error(
      "Could not find any SDK Reference navigation group to update (looked for groups whose pages reference '/sdk/docs/')"
    );
    process.exit(1);
  }

  // Write updated docs.json
  console.log(`Writing updated docs.json to ${docsJsonPath} (${updatedCount} locale(s))...`);
  fs.writeFileSync(docsJsonPath, JSON.stringify(docs, null, 2) + "\n", "utf8");

  console.log("Successfully updated docs.json");
}

function main() {
  const { target } = parseArgs();

  console.log(`Source: ${DOCS_SOURCE_PATH}`);
  console.log(`Target: ${target}`);

  // Validate source exists
  if (
    !fs.existsSync(DOCS_SOURCE_PATH) ||
    !fs.statSync(DOCS_SOURCE_PATH).isDirectory()
  ) {
    console.error(`Error: docs directory does not exist: ${DOCS_SOURCE_PATH}`);
    console.error("Have you run 'npm run create-docs' first?");
    process.exit(1);
  }

  // Validate target exists and looks like a mintlify-docs repo
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }

  const docsJsonPath = path.join(target, "docs.json");
  if (!fs.existsSync(docsJsonPath)) {
    console.error(
      `Error: docs.json not found in ${target}. Is this a mintlify-docs repo?`
    );
    process.exit(1);
  }

  try {
    // Remove the existing SDK docs directory at the new location
    const sdkDocsTarget = path.join(target, SDK_DOCS_TARGET_PATH);
    if (fs.existsSync(sdkDocsTarget)) {
      console.log(`Removing existing SDK docs directory at ${SDK_DOCS_TARGET_PATH}...`);
      fs.rmSync(sdkDocsTarget, { recursive: true, force: true });
    }

    // Ensure parent directories exist
    fs.mkdirSync(sdkDocsTarget, { recursive: true });

    // Copy the docs directory to the target
    console.log(`Copying docs to ${sdkDocsTarget}...`);
    fs.cpSync(DOCS_SOURCE_PATH, sdkDocsTarget, { recursive: true });

    // Remove README.mdx - it's not used in the docs navigation
    const readmePath = path.join(sdkDocsTarget, "README.mdx");
    if (fs.existsSync(readmePath)) {
      fs.rmSync(readmePath, { force: true });
    }

    // Mirror the English reference into every non-default locale directory as
    // English-content copies (see reference-i18n.json, mode "english-copy").
    // The switcher needs a real page at each locale-prefixed path; the content
    // stays English so there is no translation drift on regeneration. Mintlify
    // translation must be disabled for these paths (dashboard exclusion).
    const docsForLocales = JSON.parse(fs.readFileSync(docsJsonPath, "utf8"));
    const locales = (docsForLocales.navigation?.languages ?? [])
      .filter((l) => !l.default)
      .map((l) => l.language);
    for (const locale of locales) {
      const localeTarget = path.join(target, locale, SDK_DOCS_TARGET_PATH);
      fs.rmSync(localeTarget, { recursive: true, force: true });
      fs.mkdirSync(localeTarget, { recursive: true });
      fs.cpSync(DOCS_SOURCE_PATH, localeTarget, { recursive: true });
      const localeReadme = path.join(localeTarget, "README.mdx");
      if (fs.existsSync(localeReadme)) fs.rmSync(localeReadme, { force: true });
    }
    if (locales.length > 0) {
      console.log(`Mirrored SDK reference into ${locales.length} locale(s): ${locales.join(", ")}`);
    }

    // Scan the sdk-docs directory
    const sdkFiles = scanSdkDocs(sdkDocsTarget);
    console.debug(`SDK files: ${JSON.stringify(sdkFiles, null, 2)}`);

    // Update the docs.json file
    updateDocsJson(target, sdkFiles);

    // Also remove the old sdk-docs location if it exists (migration cleanup)
    const oldSdkDocsLocation = path.join(target, "sdk-docs");
    if (fs.existsSync(oldSdkDocsLocation)) {
      console.log(`Removing old sdk-docs directory at root level...`);
      fs.rmSync(oldSdkDocsLocation, { recursive: true, force: true });
    }

    console.log("\n✅ Successfully copied SDK docs to local mintlify-docs repo");
    console.log(`   Target: ${SDK_DOCS_TARGET_PATH}`);
    console.log(`\nTo preview the docs, run 'mintlify dev' in ${target}`);
  } catch (e) {
    console.error(`Error: Failed to copy docs: ${e}`);
    process.exit(1);
  }
}

main();
