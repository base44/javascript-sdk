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

  // Build the new SDK Reference groups using the new path structure
  const basePath = SDK_DOCS_TARGET_PATH;
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
      sdkFiles.functions.map((file) => `${basePath}/functions/${file}`)
    );
  }

  if (sdkFiles.interfaces?.length > 0 && categoryMap.interfaces) {
    addToGroup(
      categoryMap.interfaces,
      sdkFiles.interfaces.map((file) => `${basePath}/interfaces/${file}`)
    );
  }

  if (sdkFiles.classes?.length > 0 && categoryMap.classes) {
    addToGroup(
      categoryMap.classes,
      sdkFiles.classes.map((file) => `${basePath}/classes/${file}`)
    );
  }

  if (sdkFiles["type-aliases"]?.length > 0 && categoryMap["type-aliases"]) {
    addToGroup(
      categoryMap["type-aliases"],
      sdkFiles["type-aliases"].map((file) => `${basePath}/type-aliases/${file}`)
    );
  }

  // Convert map to array of nested groups for SDK Reference
  const sdkReferencePages = Array.from(groupMap.entries()).map(
    ([groupName, pages]) => ({
      group: groupName,
      expanded: true,
      pages: pages.sort(), // Sort pages alphabetically within each group
    })
  );

  console.debug(
    `SDK Reference pages: ${JSON.stringify(sdkReferencePages, null, 2)}`
  );

  // Navigate to: Developers tab -> SDK section -> groups -> SDK Reference
  // Supports both legacy "anchors" format and current "dropdowns" format.
  const developersTab = docs.navigation.tabs.find(
    (tab) => tab.tab === "Developers"
  );

  if (!developersTab) {
    console.error("Could not find 'Developers' tab in docs.json");
    process.exit(1);
  }

  // Find the SDK section (try dropdowns first, then fall back to anchors)
  const sdkAnchor =
    developersTab.dropdowns?.find((d) => d.dropdown === "SDK") ??
    developersTab.anchors?.find((a) => a.anchor === "SDK");

  if (!sdkAnchor) {
    console.error("Could not find 'SDK' dropdown or anchor in Developers tab");
    process.exit(1);
  }

  // Find SDK Reference within the SDK anchor's groups
  const sdkRefIndex = sdkAnchor.groups.findIndex(
    (g) => g.group === "SDK Reference"
  );

  if (sdkRefIndex === -1) {
    console.error("Could not find 'SDK Reference' group in SDK anchor");
    process.exit(1);
  }

  // Update the SDK Reference pages with our generated groups
  sdkAnchor.groups[sdkRefIndex] = {
    group: "SDK Reference",
    icon: "brackets-curly",
    expanded: true,
    pages: sdkReferencePages,
  };

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
