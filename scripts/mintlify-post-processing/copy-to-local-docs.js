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

  // Build the new SDK Reference groups
  const groupMap = new Map(); // group name -> pages array

  const addToGroup = (groupName, pages) => {
    if (!groupName || pages.length === 0) return;
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, []);
    }
    groupMap.get(groupName).push(...pages);
  };

  if (sdkFiles.functions?.length > 0 && categoryMap.functions) {
    addToGroup(
      categoryMap.functions,
      sdkFiles.functions.map((file) => `sdk-docs/functions/${file}`)
    );
  }

  if (sdkFiles.interfaces?.length > 0 && categoryMap.interfaces) {
    addToGroup(
      categoryMap.interfaces,
      sdkFiles.interfaces.map((file) => `sdk-docs/interfaces/${file}`)
    );
  }

  if (sdkFiles.classes?.length > 0 && categoryMap.classes) {
    addToGroup(
      categoryMap.classes,
      sdkFiles.classes.map((file) => `sdk-docs/classes/${file}`)
    );
  }

  if (sdkFiles["type-aliases"]?.length > 0 && categoryMap["type-aliases"]) {
    addToGroup(
      categoryMap["type-aliases"],
      sdkFiles["type-aliases"].map((file) => `sdk-docs/type-aliases/${file}`)
    );
  }

  // Convert map to array of nested groups for SDK Reference
  const sdkReferencePages = Array.from(groupMap.entries()).map(
    ([groupName, pages]) => ({
      group: groupName,
      pages: pages.sort(), // Sort pages alphabetically within each group
    })
  );

  console.debug(
    `SDK Reference pages: ${JSON.stringify(sdkReferencePages, null, 2)}`
  );

  // Navigate to: Developers tab -> SDK group -> SDK Reference group
  const developersTab = docs.navigation.tabs.find(
    (tab) => tab.tab === "Developers"
  );

  if (!developersTab) {
    console.error("Could not find 'Developers' tab in docs.json");
    process.exit(1);
  }

  // Find the SDK group (it's a top-level group in the Developers tab)
  const sdkGroup = developersTab.groups.find((g) => g.group === "SDK");

  if (!sdkGroup) {
    console.error("Could not find 'SDK' group in Developers tab");
    process.exit(1);
  }

  // Find SDK Reference within SDK's pages (it's a nested group object)
  const sdkRefIndex = sdkGroup.pages.findIndex(
    (page) => typeof page === "object" && page.group === "SDK Reference"
  );

  if (sdkRefIndex === -1) {
    console.error("Could not find 'SDK Reference' group in SDK");
    process.exit(1);
  }

  // Update the SDK Reference pages with our generated groups
  sdkGroup.pages[sdkRefIndex] = {
    group: "SDK Reference",
    icon: "brackets-curly",
    pages: sdkReferencePages,
  };

  // Remove the old standalone "SDK Reference" tab if it exists
  const oldSdkTabIndex = docs.navigation.tabs.findIndex(
    (tab) => tab.tab === "SDK Reference"
  );
  if (oldSdkTabIndex !== -1) {
    console.log("Removing old standalone 'SDK Reference' tab...");
    docs.navigation.tabs.splice(oldSdkTabIndex, 1);
  }

  // Write updated docs.json
  console.log(`Writing updated docs.json to ${docsJsonPath}...`);
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
    // Remove the existing sdk-docs directory
    const sdkDocsTarget = path.join(target, "sdk-docs");
    if (fs.existsSync(sdkDocsTarget)) {
      console.log(`Removing existing sdk-docs directory...`);
      fs.rmSync(sdkDocsTarget, { recursive: true, force: true });
    }

    // Copy the docs directory to the target
    console.log(`Copying docs to ${sdkDocsTarget}...`);
    fs.cpSync(DOCS_SOURCE_PATH, sdkDocsTarget, { recursive: true });

    // Scan the sdk-docs directory
    const sdkFiles = scanSdkDocs(sdkDocsTarget);
    console.debug(`SDK files: ${JSON.stringify(sdkFiles, null, 2)}`);

    // Update the docs.json file
    updateDocsJson(target, sdkFiles);

    console.log("\n✅ Successfully copied SDK docs to local mintlify-docs repo");
    console.log(`\nTo preview the docs, run 'mintlify dev' in ${target}`);
  } catch (e) {
    console.error(`Error: Failed to copy docs: ${e}`);
    process.exit(1);
  }
}

main();
