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

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "..", "..", "docs");
const CONTENT_DIR = path.join(DOCS_DIR, "content");
const LINKED_TYPES_FILE = path.join(CONTENT_DIR, ".linked-types.json");
const TEMPLATE_PATH = path.join(__dirname, "docs-json-template.json");
const STYLING_CSS_PATH = path.join(__dirname, "styling.css");
const CATEGORY_MAP_PATH = path.join(__dirname, "../category-map.json");
const TYPES_TO_EXPOSE_PATH = path.join(__dirname, "..", "types-to-expose.json");
const APPENDED_ARTICLES_PATH = path.join(
  __dirname,
  "../appended-articles.json"
);

const MODULE_RENAMES = {
  AgentsModule: "agents",
  AppLogsModule: "app-logs",
  AuthModule: "auth",
  ConnectorsModule: "connectors",
  EntitiesModule: "entities",
  FunctionsModule: "functions",
  IntegrationsModule: "integrations",
  SsoModule: "sso",
};

const REVERSE_MODULE_RENAMES = Object.entries(MODULE_RENAMES).reduce(
  (acc, [k, v]) => {
    acc[v] = k;
    return acc;
  },
  {}
);

/**
 * Get list of linked type names that should be suppressed
 */
function getLinkedTypeNames() {
  try {
    if (fs.existsSync(LINKED_TYPES_FILE)) {
      const content = fs.readFileSync(LINKED_TYPES_FILE, "utf-8");
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
    const content = fs.readFileSync(TYPES_TO_EXPOSE_PATH, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("types-to-expose.json must be an array of strings");
    }
    return new Set(parsed);
  } catch (e) {
    console.error(
      `Error: Unable to read types-to-expose file: ${TYPES_TO_EXPOSE_PATH}`
    );
    console.error(e.message);
    process.exit(1);
  }
}

/**
 * Process links in a file to make them Mintlify-compatible
 */
function processLinksInFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;

  // Remove .md and .mdx extensions from markdown links
  // This handles both relative and absolute paths
  // Regex breakdown:
  // \[([^\]]+)\] : Match [LinkText]
  // \( : Match opening (
  // ([^)]+) : Match path (Group 2)
  // (\.mdx?)? : Optionally match .md or .mdx extension (Group 3), making it optional to catch links that might have already lost extension or never had it if inconsistent
  // \) : Match closing )
  const linkRegex = /\[([^\]]+)\]\(([^)]+?)(\.mdx?)?\)/g;
  let newContent = content.replace(
    linkRegex,
    (match, linkText, linkPath, ext) => {
      modified = true;

      // Check if the link points to a renamed module
      const pathParts = linkPath.split("/");
      const filename = pathParts[pathParts.length - 1];

      // If filename has extension, strip it for checking map
      const nameWithoutExt = filename.replace(/\.mdx?$/, "");

      if (MODULE_RENAMES[nameWithoutExt]) {
        pathParts[pathParts.length - 1] = MODULE_RENAMES[nameWithoutExt];
        linkPath = pathParts.join("/");
      }

      // Handle relative links that might be missing context (basic cleanup)
      // e.g. if linkPath is just "entities" but it should be relative

      return `[${linkText}](${linkPath})`;
    }
  );

  // Also check for links that might have already been processed (no extension)
  // or if the above regex missed them (though it matches .mdx?)
  // The regex requires .md or .mdx extension. If links are already extensionless, this won't run.
  // But TypeDoc usually outputs links with extensions.

  if (modified) {
    fs.writeFileSync(filePath, newContent, "utf-8");
    return true;
  }

  return false;
}

/**
 * Renames module files and updates their titles
 */
function performModuleRenames(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      performModuleRenames(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const nameWithoutExt = path.basename(
        entry.name,
        path.extname(entry.name)
      );

      // Check if it's a renamed file or one that needs renaming
      // e.g. "EntitiesModule" needs renaming. "entities" might need title update.

      let targetName = nameWithoutExt;
      let needsRename = false;

      if (MODULE_RENAMES[nameWithoutExt]) {
        targetName = MODULE_RENAMES[nameWithoutExt];
        needsRename = true;
      } else if (REVERSE_MODULE_RENAMES[nameWithoutExt]) {
        // It's already renamed (e.g. "entities"), but we should ensure title is correct
        targetName = nameWithoutExt;
      }

      if (needsRename || REVERSE_MODULE_RENAMES[targetName]) {
        const newPath = path.join(dir, `${targetName}.mdx`); // Always use .mdx

        let content = fs.readFileSync(entryPath, "utf-8");

        // Update title in frontmatter
        const titleRegex = /^title:\s*["']?([^"'\n]+)["']?/m;
        if (titleRegex.test(content)) {
          // Force the title to be the target name
          content = content.replace(titleRegex, `title: "${targetName}"`);
        }

        // Write to new path (if renaming) or overwrite (if just updating title)
        fs.writeFileSync(newPath, content, "utf-8");

        // Delete old file if name is different
        if (entryPath !== newPath) {
          fs.unlinkSync(entryPath);
          console.log(`Renamed module: ${entry.name} -> ${targetName}.mdx`);
        } else {
          // If we just updated the title in place
          // console.log(`Updated title for: ${targetName}`);
        }
      }
    }
  }
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

  const sections = ["functions", "interfaces", "classes", "type-aliases"];

  for (const section of sections) {
    const sectionDir = path.join(CONTENT_DIR, section);
    if (!fs.existsSync(sectionDir)) continue;

    const files = fs.readdirSync(sectionDir);
    const mdxFiles = files
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => path.basename(file, ".mdx"))
      .sort()
      .map((fileName) => `content/${section}/${fileName}`);

    const key = section === "type-aliases" ? "typeAliases" : section;
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
  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf-8"));
  let categoryMap = {};
  try {
    categoryMap = JSON.parse(fs.readFileSync(CATEGORY_MAP_PATH, "utf-8"));
  } catch (e) {
    // If file doesn't exist or can't be read, return empty object
    console.error(`Error: Category map file not found: ${CATEGORY_MAP_PATH}`);
  }

  const groups = [];

  if (docsContent.functions.length > 0 && categoryMap.functions) {
    groups.push({
      group: getGroupName("functions", categoryMap),
      pages: docsContent.functions,
    });
  }

  if (docsContent.interfaces.length > 0 && categoryMap.interfaces) {
    groups.push({
      group: getGroupName("interfaces", categoryMap),
      pages: docsContent.interfaces,
    });
  }

  if (docsContent.classes.length > 0 && categoryMap.classes) {
    groups.push({
      group: getGroupName("classes", categoryMap),
      pages: docsContent.classes,
    });
  }

  if (docsContent.typeAliases.length > 0 && categoryMap["type-aliases"]) {
    groups.push({
      group: getGroupName("typeAliases", categoryMap),
      pages: docsContent.typeAliases,
    });
  }

  // Find or create SDK Reference tab
  let sdkTab = template.navigation.tabs.find(
    (tab) => tab.tab === "SDK Reference"
  );
  if (!sdkTab) {
    sdkTab = { tab: "SDK Reference", groups: [] };
    template.navigation.tabs.push(sdkTab);
  }

  sdkTab.groups = groups;

  const docsJsonPath = path.join(DOCS_DIR, "docs.json");
  fs.writeFileSync(
    docsJsonPath,
    JSON.stringify(template, null, 2) + "\n",
    "utf-8"
  );
  console.log(`Generated docs.json`);
}

/**
 * Copy styling.css to docs directory
 */
function copyStylingCss() {
  const targetPath = path.join(DOCS_DIR, "styling.css");
  fs.copyFileSync(STYLING_CSS_PATH, targetPath);
  console.log(`Copied styling.css`);
}

/**
 * Recursively process all MDX files
 */
function isTypeDocPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  return (
    normalized.startsWith("content/interfaces/") ||
    normalized.startsWith("content/type-aliases/") ||
    normalized.startsWith("content/classes/")
  );
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
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      // Extract the type name from the file path
      // e.g., "docs/interfaces/LoginViaEmailPasswordResponse.mdx" -> "LoginViaEmailPasswordResponse"
      const fileName = path.basename(entryPath, path.extname(entryPath));
      const relativePath = path.relative(DOCS_DIR, entryPath);
      const isTypeDoc = isTypeDocPath(relativePath);

      // Check if exposed. Handle renamed modules by checking reverse map.
      const originalName = REVERSE_MODULE_RENAMES[fileName] || fileName;
      const isExposedType = !isTypeDoc || exposedTypeNames.has(originalName);

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

function loadAppendedArticlesConfig() {
  try {
    const content = fs.readFileSync(APPENDED_ARTICLES_PATH, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      const normalized = {};
      for (const [host, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) {
          normalized[host] = value;
        } else if (typeof value === "string" && value.trim()) {
          normalized[host] = [value];
        }
      }
      return normalized;
    }
  } catch (e) {
    // Missing or invalid config is not fatal; simply skip appends
  }
  return {};
}

function stripFrontMatter(content) {
  if (!content.startsWith("---")) {
    return { title: null, content: content.trimStart() };
  }
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { title: null, content: content.trimStart() };
  }
  const frontMatter = content.slice(0, endIndex + 4);
  const rest = content.slice(endIndex + 4).trimStart();
  const titleMatch = frontMatter.match(/title:\s*["']?([^"'\n]+)["']?/i);
  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    content: rest,
  };
}

function removeFirstPanelBlock(content) {
  const panelStart = content.indexOf("<Panel>");
  const panelEnd = content.indexOf("</Panel>");
  if (panelStart === -1 || panelEnd === -1 || panelEnd < panelStart) {
    return content;
  }
  const before = content.slice(0, panelStart);
  const after = content.slice(panelEnd + "</Panel>".length);
  return (before + after).trimStart();
}

function normalizeHeadings(content) {
  const lines = content.split("\n");
  const headingRegex = /^(#{1,6})\s+(.*)$/;
  let minLevel = Infinity;
  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      minLevel = Math.min(minLevel, match[1].length);
    }
  }
  if (minLevel === Infinity) {
    return { content: content.trim(), headings: [] };
  }
  const baseLevel = 3; // appended section starts at H2, so nested headings start at H3+
  const headings = [];
  const adjusted = lines.map((line) => {
    const match = line.match(headingRegex);
    if (!match) {
      return line;
    }
    const originalLevel = match[1].length;
    let newLevel = originalLevel - minLevel + baseLevel;
    newLevel = Math.max(baseLevel, Math.min(6, newLevel));
    const text = match[2].trim();
    headings.push({ text, level: newLevel });
    return `${"#".repeat(newLevel)} ${text}`;
  });
  return { content: adjusted.join("\n").trim(), headings };
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+={}\[\]|\\:;"'<>,.?]/g, "")
    .replace(/\s+/g, "-");
}

function ensurePanelSpacing(content) {
  const panelRegex = /(<Panel>[\s\S]*?)(\n*)(<\/Panel>)/;
  return content.replace(panelRegex, (match, body, newlineSection, closing) => {
    const trimmedBody = body.replace(/\s+$/, "");
    return `${trimmedBody}\n\n${closing}`;
  });
}

function updatePanelWithHeadings(hostContent, headings) {
  if (!headings || headings.length === 0) {
    return ensurePanelSpacing(hostContent);
  }
  const panelStart = hostContent.indexOf("<Panel>");
  if (panelStart === -1) {
    return ensurePanelSpacing(hostContent);
  }
  const panelEnd = hostContent.indexOf("</Panel>", panelStart);
  if (panelEnd === -1) {
    return ensurePanelSpacing(hostContent);
  }
  const beforePanel = hostContent.slice(0, panelStart);
  const panelBlock = hostContent.slice(panelStart, panelEnd);
  const afterPanel = hostContent.slice(panelEnd);

  const panelLines = panelBlock.split("\n");
  const existingSlugs = new Set();
  const slugMatchRegex = /- \[[^\]]+\]\(#([^)]+)\)/;
  for (const line of panelLines) {
    const match = line.match(slugMatchRegex);
    if (match) {
      existingSlugs.add(match[1]);
    }
  }

  const newEntries = [];
  for (const heading of headings) {
    const text = heading.text.trim();
    if (!text) continue;
    const slug = slugifyHeading(text);
    if (existingSlugs.has(slug)) {
      continue;
    }
    existingSlugs.add(slug);
    newEntries.push(`- [${text}](#${slug})`);
  }

  if (newEntries.length === 0) {
    return ensurePanelSpacing(hostContent);
  }

  const insertion =
    (panelBlock.endsWith("\n") ? "" : "\n") + newEntries.join("\n");
  const updatedPanelBlock = panelBlock + insertion;
  const updatedContent = beforePanel + updatedPanelBlock + afterPanel;
  return ensurePanelSpacing(updatedContent);
}

function prepareAppendedSection(appendPath) {
  const rawContent = fs.readFileSync(appendPath, "utf-8");
  const { title, content: withoutFrontMatter } = stripFrontMatter(rawContent);
  const withoutPanel = removeFirstPanelBlock(withoutFrontMatter);
  const { content: normalizedContent, headings } =
    normalizeHeadings(withoutPanel);
  const fileTitle =
    title || path.basename(appendPath, path.extname(appendPath));
  const sectionHeading = `## ${fileTitle.trim()}`;
  const trimmedContent = normalizedContent ? `\n\n${normalizedContent}` : "";
  const section = `${sectionHeading}${trimmedContent}\n`;
  const headingList = [{ text: fileTitle.trim(), level: 2 }, ...headings];
  return { section, headings: headingList };
}

function applyAppendedArticles(appendedArticles) {
  const hosts = Object.keys(appendedArticles);
  if (hosts.length === 0) {
    return;
  }

  for (const hostKey of hosts) {
    const appendList = appendedArticles[hostKey];
    if (!Array.isArray(appendList) || appendList.length === 0) {
      continue;
    }

    // Check if host was renamed
    let effectiveHostKey = hostKey;
    const pathParts = hostKey.split("/");
    const hostName = pathParts[pathParts.length - 1];
    if (MODULE_RENAMES[hostName]) {
      pathParts[pathParts.length - 1] = MODULE_RENAMES[hostName];
      effectiveHostKey = pathParts.join("/");
    }

    const hostPath = path.join(CONTENT_DIR, `${effectiveHostKey}.mdx`);
    if (!fs.existsSync(hostPath)) {
      // Try checking if it exists as .md just in case, though we standardized on .mdx
      console.warn(
        `Warning: Host article not found for append: ${hostKey} (checked ${effectiveHostKey}.mdx)`
      );
      continue;
    }

    let hostContent = fs.readFileSync(hostPath, "utf-8");
    let combinedSections = "";
    const collectedHeadings = [];

    for (const appendKey of appendList) {
      // Check if appended file was renamed (unlikely for EntityHandler but good for consistency)
      let effectiveAppendKey = appendKey;
      const appendParts = appendKey.split("/");
      const appendName = appendParts[appendParts.length - 1];
      if (MODULE_RENAMES[appendName]) {
        appendParts[appendParts.length - 1] = MODULE_RENAMES[appendName];
        effectiveAppendKey = appendParts.join("/");
      }

      // Try looking in CONTENT_DIR with .mdx (default)
      let appendPath = path.join(CONTENT_DIR, `${effectiveAppendKey}.mdx`);
      let foundExtension = ".mdx";

      if (!fs.existsSync(appendPath)) {
        // Try .md in CONTENT_DIR
        appendPath = path.join(CONTENT_DIR, `${effectiveAppendKey}.md`);
        foundExtension = ".md";

        if (!fs.existsSync(appendPath)) {
          // Try looking in DOCS_DIR directly (for un-moved files)
          // Assuming the key (e.g. interfaces/EntityHandler) is relative to DOCS_DIR too
          appendPath = path.join(DOCS_DIR, `${effectiveAppendKey}.mdx`);
          foundExtension = ".mdx";

          if (!fs.existsSync(appendPath)) {
            appendPath = path.join(DOCS_DIR, `${effectiveAppendKey}.md`);
            foundExtension = ".md";

            if (!fs.existsSync(appendPath)) {
              console.warn(
                `Warning: Appended article not found: ${appendKey} (checked content/ and docs/ roots)`
              );
              continue;
            }
          }
        }
      }

      const { section, headings } = prepareAppendedSection(appendPath);
      combinedSections += `\n\n${section}`;
      collectedHeadings.push(...headings);

      try {
        fs.unlinkSync(appendPath);
        console.log(
          `Appended ${effectiveAppendKey}${foundExtension} -> ${effectiveHostKey}.mdx`
        );
      } catch (e) {
        console.warn(
          `Warning: Unable to remove appended article ${effectiveAppendKey}${foundExtension}`
        );
      }
    }

    if (!combinedSections) {
      continue;
    }

    hostContent = hostContent.trimEnd() + combinedSections + "\n";
    hostContent = updatePanelWithHeadings(hostContent, collectedHeadings);
    fs.writeFileSync(hostPath, hostContent, "utf-8");
  }
}

/**
 * Main function
 */
function main() {
  console.log("Processing TypeDoc MDX files for Mintlify...\n");

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Error: Documentation directory not found: ${DOCS_DIR}`);
    console.error('Please run "npm run docs:generate" first.');
    process.exit(1);
  }

  // Get list of linked types to suppress
  const linkedTypeNames = getLinkedTypeNames();
  const exposedTypeNames = getTypesToExpose();

  // First, perform module renames (EntitiesModule -> entities, etc.)
  performModuleRenames(DOCS_DIR);

  // Process all files (remove suppressed ones and fix links)
  processAllFiles(DOCS_DIR, linkedTypeNames, exposedTypeNames);

  // Append configured articles
  const appendedArticles = loadAppendedArticlesConfig();
  applyAppendedArticles(appendedArticles);

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
