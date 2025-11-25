#!/usr/bin/env node

/**
 * Post-processing script for TypeDoc-generated MDX files
 * 
 * TypeDoc now emits .mdx files directly, so this script:
 * 1. Processes links to make them Mintlify-compatible
 * 2. Removes files for linked types that should be suppressed
 * 3. Cleans up the temporary linked types tracking file
 * 4. Generates docs.json with navigation structure
 * 5. Copies styling.css to docs directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, '..', '..', '..', 'docs');
const CONTENT_DIR = path.join(DOCS_DIR, 'content');
const LINKED_TYPES_FILE = path.join(CONTENT_DIR, '.linked-types.json');
const TEMPLATE_PATH = path.join(__dirname, 'docs-json-template.json');
const STYLING_CSS_PATH = path.join(__dirname, 'styling.css');
const CATEGORY_MAP_PATH = path.join(__dirname, '../category-map.json');
const TYPES_TO_EXPOSE_PATH = path.join(__dirname, '..', 'types-to-expose.json');

/**
 * Get list of linked type names that should be suppressed
 */
function getLinkedTypeNames() {
  try {
    if (fs.existsSync(LINKED_TYPES_FILE)) {
      const content = fs.readFileSync(LINKED_TYPES_FILE, 'utf-8');
      return new Set(JSON.parse(content));
    }
  } catch (e) {
    // If file doesn't exist or can't be read, return empty set
  }
  return new Set();
}

/**
 * Load allow-listed type names that should remain in the docs output
 */
function getTypesToExpose() {
  try {
    const content = fs.readFileSync(TYPES_TO_EXPOSE_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('types-to-expose.json must be an array of strings');
    }
    return new Set(parsed);
  } catch (e) {
    console.error(`Error: Unable to read types-to-expose file: ${TYPES_TO_EXPOSE_PATH}`);
    console.error(e.message);
    process.exit(1);
  }
}

/**
 * Process links in a file to make them Mintlify-compatible
 */
function processLinksInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Remove .md and .mdx extensions from markdown links
  // This handles both relative and absolute paths
  const linkRegex = /\[([^\]]+)\]\(([^)]+)(\.mdx?)\)/g;
  const newContent = content.replace(linkRegex, (match, linkText, linkPath, ext) => {
    modified = true;
    return `[${linkText}](${linkPath})`;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return true;
  }
  
  return false;
}

/**
 * Scan docs content directory and build navigation structure
 */
function scanDocsContent() {
  const result = {
    functions: [],
    interfaces: [],
    classes: [],
    typeAliases: [],
  };

  const sections = ['functions', 'interfaces', 'classes', 'type-aliases'];
  
  for (const section of sections) {
    const sectionDir = path.join(CONTENT_DIR, section);
    if (!fs.existsSync(sectionDir)) continue;
    
    const files = fs.readdirSync(sectionDir);
    const mdxFiles = files
      .filter((file) => file.endsWith('.mdx'))
      .map((file) => path.basename(file, '.mdx'))
      .sort()
      .map((fileName) => `content/${section}/${fileName}`);
    
    const key = section === 'type-aliases' ? 'typeAliases' : section;
    result[key] = mdxFiles;
  }

  return result;
}


/**
 * Get group name for a section, using category map or default
 */
function getGroupName(section, categoryMap) {
  if (categoryMap[section]) {
    return categoryMap[section];
  }
  
  return section;
}

/**
 * Generate docs.json from template and scanned content
 */
function generateDocsJson(docsContent) {
  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf-8'));
  let categoryMap = {};
  try {
    categoryMap = JSON.parse(fs.readFileSync(CATEGORY_MAP_PATH, 'utf-8'));
  } catch (e) {
    // If file doesn't exist or can't be read, return empty object
    console.error(`Error: Category map file not found: ${CATEGORY_MAP_PATH}`);
  }
  
  const groups = [];
  
  if (docsContent.functions.length > 0 && categoryMap.functions) {
    groups.push({
      group: getGroupName('functions', categoryMap),
      pages: docsContent.functions,
    });
  }
  
  if (docsContent.interfaces.length > 0 && categoryMap.interfaces) {
    groups.push({
      group: getGroupName('interfaces', categoryMap),
      pages: docsContent.interfaces,
    });
  }
  
  if (docsContent.classes.length > 0 && categoryMap.classes) {
    groups.push({
      group: getGroupName('classes', categoryMap),
      pages: docsContent.classes,
    });
  }
  
  if (docsContent.typeAliases.length > 0 && categoryMap['type-aliases']) {
    groups.push({
      group: getGroupName('typeAliases', categoryMap),
      pages: docsContent.typeAliases,
    });
  }
  
  // Find or create SDK Reference tab
  let sdkTab = template.navigation.tabs.find(tab => tab.tab === 'SDK Reference');
  if (!sdkTab) {
    sdkTab = { tab: 'SDK Reference', groups: [] };
    template.navigation.tabs.push(sdkTab);
  }
  
  sdkTab.groups = groups;
  
  const docsJsonPath = path.join(DOCS_DIR, 'docs.json');
  fs.writeFileSync(docsJsonPath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
  console.log(`Generated docs.json`);
}

/**
 * Copy styling.css to docs directory
 */
function copyStylingCss() {
  const targetPath = path.join(DOCS_DIR, 'styling.css');
  fs.copyFileSync(STYLING_CSS_PATH, targetPath);
  console.log(`Copied styling.css`);
}

/**
 * Recursively process all MDX files
 */
function isTypeDocPath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return normalized.startsWith('content/interfaces/') ||
         normalized.startsWith('content/type-aliases/') ||
         normalized.startsWith('content/classes/');
}

/**
 * Recursively process all MDX files
 */
function processAllFiles(dir, linkedTypeNames, exposedTypeNames) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processAllFiles(entryPath, linkedTypeNames, exposedTypeNames);
    } else if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))) {
      // Extract the type name from the file path
      // e.g., "docs/interfaces/LoginViaEmailPasswordResponse.mdx" -> "LoginViaEmailPasswordResponse"
      const fileName = path.basename(entryPath, path.extname(entryPath));
      const relativePath = path.relative(DOCS_DIR, entryPath);
      const isTypeDoc = isTypeDocPath(relativePath);
      const isExposedType = !isTypeDoc || exposedTypeNames.has(fileName);
      
      // Remove any type doc files that are not explicitly exposed
      if (isTypeDoc && !isExposedType) {
        fs.unlinkSync(entryPath);
        console.log(`Removed (not exposed): ${relativePath}`);
        continue;
      }

      // Remove suppressed linked type files (legacy behavior) as long as they aren't exposed
      if (linkedTypeNames.has(fileName) && !exposedTypeNames.has(fileName)) {
        fs.unlinkSync(entryPath);
        console.log(`Removed (suppressed): ${relativePath}`);
      } else {
        // Process links in the file
        if (processLinksInFile(entryPath)) {
          console.log(`Processed links: ${relativePath}`);
        }
      }
    }
  }
}

/**
 * Main function
 */
function main() {
  console.log('Processing TypeDoc MDX files for Mintlify...\n');
  
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Error: Documentation directory not found: ${DOCS_DIR}`);
    console.error('Please run "npm run docs:generate" first.');
    process.exit(1);
  }
  
  // Get list of linked types to suppress
  const linkedTypeNames = getLinkedTypeNames();
  const exposedTypeNames = getTypesToExpose();
  
  // Process all files (remove suppressed ones and fix links)
  // Process content directory specifically
  if (fs.existsSync(CONTENT_DIR)) {
    processAllFiles(CONTENT_DIR, linkedTypeNames, exposedTypeNames);
  } else {
    // Fallback to processing entire docs directory
    processAllFiles(DOCS_DIR, linkedTypeNames, exposedTypeNames);
  }
  
  // Clean up the linked types file
  try {
    if (fs.existsSync(LINKED_TYPES_FILE)) {
      fs.unlinkSync(LINKED_TYPES_FILE);
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Scan content and generate docs.json
  const docsContent = scanDocsContent();
  generateDocsJson(docsContent);
  
  // Copy styling.css
  copyStylingCss();
  
  console.log(`\n✓ Post-processing complete!`);
  console.log(`  Documentation directory: ${DOCS_DIR}`);
}

main();
