#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

console.debug = () => {}; // Disable debug logging. Comment this out to enable debug logging.

const DOCS_SOURCE_PATH = path.join(import.meta.dirname, "../../docs/content");
const TARGET_DOCS_REPO_URL = "git@github.com:base44-dev/mintlify-docs.git";
const CATEGORY_MAP_PATH = path.join(import.meta.dirname, "./category-map.json");

function parseArgs() {
  const args = process.argv.slice(2);
  let branch = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--branch" && i + 1 < args.length) {
      branch = args[++i];
    }
  }
  return { branch };
}

function scanSdkDocs(sdkDocsDir) {
  const result = {};
  
  // Get a list of all the subdirectories in the sdkDocsDir
  const subdirectories = fs.readdirSync(sdkDocsDir).filter(file => fs.statSync(path.join(sdkDocsDir, file)).isDirectory());
  console.log(`Subdirectories: ${subdirectories}`);

  for (const subdirectory of subdirectories) {
    const subdirectoryPath = path.join(sdkDocsDir, subdirectory);
    const files = fs.readdirSync(subdirectoryPath).filter(file => file.endsWith(".mdx"));
    result[subdirectory] = files.map(file => path.basename(file, ".mdx"));
  }
  return result;
}

function updateDocsJson(repoDir, sdkFiles) {
    const docsJsonPath = path.join(repoDir, 'docs.json');
    let categoryMap = {};
    try {
      categoryMap = JSON.parse(fs.readFileSync(CATEGORY_MAP_PATH, 'utf8'));
    } catch (e) {
      console.error(`Error: Category map file not found: ${CATEGORY_MAP_PATH}`);
      process.exit(1);
    }
    
    console.log(`Reading docs.json from ${docsJsonPath}...`);
    const docsContent = fs.readFileSync(docsJsonPath, 'utf8');
    const docs = JSON.parse(docsContent);
    
    // Find the "SDK Reference" tab
    let sdkTab = docs.navigation.tabs.find(tab => tab.tab === 'SDK Reference');
    
    if (!sdkTab) {
     console.log("Could not find 'SDK Reference' tab in docs.json. Creating it...");
     sdkTab = {
        tab: 'SDK Reference',
        groups: []
     };
    }
    
    // Update the groups
    const newGroups = [];

    if(sdkFiles.functions.length > 0) {
      newGroups.push({
        group: categoryMap.functions ? categoryMap.functions : 'functions',
        pages: sdkFiles.functions.map(file => `sdk-docs/functions/${file}`)
      });
    }

    if(sdkFiles.interfaces.length > 0) {
      newGroups.push({
        group: categoryMap.interfaces ? categoryMap.interfaces : 'interfaces',
        pages: sdkFiles.interfaces.map(file => `sdk-docs/interfaces/${file}`)
      });
    }

    if(sdkFiles.classes.length > 0) {
      newGroups.push({
        group: categoryMap.classes ? categoryMap.classes : 'classes',
        pages: sdkFiles.classes.map(file => `sdk-docs/classes/${file}`)
      });
    }

    if(sdkFiles['type-aliases'].length > 0) {
      newGroups.push({
        group: categoryMap['type-aliases'] ? categoryMap['type-aliases'] : 'type-aliases',
        pages: sdkFiles['type-aliases'].map(file => `sdk-docs/type-aliases/${file}`)
      });
    }
    
    sdkTab.groups = newGroups;
    docs.navigation.tabs.push(sdkTab);

    console.debug(`New groups for docs.json: ${JSON.stringify(newGroups, null, 2)}`);

    // Write updated docs.json
    console.log(`Writing updated docs.json to ${docsJsonPath}...`);
    fs.writeFileSync(docsJsonPath, JSON.stringify(docs, null, 2) + '\n', 'utf8');
    
    console.log('Successfully updated docs.json');
  }

function main() {
  const { branch } = parseArgs();
  if (!branch) {
    console.error("Error: --branch <branch-name> is required");
    process.exit(1);
  }

  console.log(`Branch: ${branch}`);

  if (
    !fs.existsSync(DOCS_SOURCE_PATH) ||
    !fs.statSync(DOCS_SOURCE_PATH).isDirectory()
  ) {
    console.error(`Error: docs directory does not exist: ${DOCS_SOURCE_PATH}`);
    process.exit(1);
  }

  // Create temporary directory
  const tempRepoDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "mintlify-docs-")
  );
  // Clone the repository
  console.log(`Cloning repository to ${tempRepoDir}...`);
  execSync(`git clone ${TARGET_DOCS_REPO_URL} ${tempRepoDir}`);

  // Check if the specified branch already exists remotely
  const branchExists = execSync(`git ls-remote --heads origin ${branch}`, { 
    cwd: tempRepoDir,
    encoding: 'utf8'
  }).trim().length > 0;

  if (branchExists) {
    console.log(`Branch ${branch} already exists. Checking it out...`);
    execSync(`git checkout -b ${branch} origin/${branch}`, { cwd: tempRepoDir });
  } else {
    console.log(`Branch ${branch} does not exist. Creating it...`);
    execSync(`git checkout -b ${branch}`, { cwd: tempRepoDir });
  }

  // Remove the existing sdk-docs directory
  fs.rmSync(path.join(tempRepoDir, "sdk-docs"), { recursive: true, force: true });

  // Copy the docs directory to the temporary repository
  fs.cpSync(DOCS_SOURCE_PATH, path.join(tempRepoDir, "sdk-docs"), { recursive: true });

  // Scan the sdk-docs directory
  const sdkDocsDir = path.join(tempRepoDir, "sdk-docs");
  const sdkFiles = scanSdkDocs(sdkDocsDir);

  console.debug(`SDK files: ${JSON.stringify(sdkFiles, null, 2)}`);

  // Update the docs.json file
  updateDocsJson(tempRepoDir, sdkFiles);

  // Commit the changes
  execSync(`git add docs.json`, { cwd: tempRepoDir });
  execSync(`git add sdk-docs`, { cwd: tempRepoDir });
  execSync(`git commit -m "Auto-updates to SDK Reference Docs"`, { cwd: tempRepoDir });
  execSync(`git push --set-upstream origin ${branch}`, { cwd: tempRepoDir });

  // Remove the temporary directory
  try {
    fs.rmSync(tempRepoDir, { recursive: true, force: true });
  } catch (e) {
    console.error(`Error: Failed to remove temporary directory: ${tempRepoDir}`);
    process.exit(1);
  }
  

  console.log("Successfully committed and pushed the changes");
}

main();