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
const TYPES_TO_DELETE_PATH = path.join(__dirname, "..", "types-to-delete-after-processing.json");
const APPENDED_ARTICLES_PATH = path.join(
  __dirname,
  "../appended-articles.json"
);

// Controlled via env var so we can re-enable Panel injection when needed.
const PANELS_ENABLED = process.env.MINTLIFY_INCLUDE_PANELS === "true";

/**
 * Converts a PascalCase module name to kebab-case.
 * E.g., "AgentsModule" -> "agents", "AppLogsModule" -> "app-logs"
 *
 * @param {string} name - The PascalCase name (e.g., "AgentsModule")
 * @returns {string | null} - The kebab-case name, or null if not a module name
 */
function deriveModuleRename(name) {
  if (!name.endsWith("Module")) {
    return null;
  }

  // Remove "Module" suffix
  const withoutModule = name.slice(0, -6);

  // Convert PascalCase to kebab-case
  // Insert hyphen before each capital letter (except the first), then lowercase
  const kebabCase = withoutModule
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();

  return kebabCase;
}

/**
 * Checks if a name is a module name (ends with "Module") and returns its renamed version.
 * Uses the derived rename algorithm.
 *
 * @param {string} name - The name to check
 * @returns {string | null} - The renamed version, or null if not a module
 */
function getModuleRename(name) {
  return deriveModuleRename(name);
}

/**
 * Checks if a name is a renamed module (kebab-case) and returns its original name.
 *
 * @param {string} name - The kebab-case name to check
 * @returns {string | null} - The original PascalCase module name, or null if not found
 */
function getReverseModuleRename(name) {
  // Convert kebab-case back to PascalCase and add "Module" suffix
  const pascalCase = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return `${pascalCase}Module`;
}

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

  // Rename "Type Declaration" to "Type Declarations" (TypeDoc outputs singular)
  if (content.includes("## Type Declaration\n")) {
    content = content.replace(
      "## Type Declaration\n",
      "## Type Declarations\n"
    );
    modified = true;
  }

  // Remove undesirable type-alias definition lines like:
  //   > **IntegrationsModule** = `object` & `object`
  //   > **EntitiesModule** = `TypedEntitiesModule` & `DynamicEntitiesModule`
  // These appear in type alias files using intersection types and are not useful in docs.
  const typeDefinitionRegex = /^> \*\*\w+\*\* = `\w+` & `\w+`\s*$/m;
  if (typeDefinitionRegex.test(content)) {
    content = content.replace(typeDefinitionRegex, "");
    modified = true;
  }

  // Manually add Indexable section if missing for IntegrationsModule
  if (
    filePath.includes("integrations.mdx") &&
    !content.includes("## Indexable")
  ) {
    const indexableSection = `
## Indexable

\\[\`packageName\`: \`string\`\\]: [\`IntegrationPackage\`](IntegrationPackage)

Access to additional integration packages.
`;
    // Append it before the "Type Declarations" or "Core" section if possible, or just at the end before methods if any
    // Finding a good insertion point
    const typeDeclarationIndex = content.indexOf("## Type Declarations");
    if (typeDeclarationIndex !== -1) {
      content =
        content.slice(0, typeDeclarationIndex) +
        indexableSection +
        "\n" +
        content.slice(typeDeclarationIndex);
      modified = true;
    } else {
      // If no Type Declarations, maybe append after the main description?
      // Look for the first horizontal rule or similar
      const firstHR = content.indexOf("***", 10); // skip first few chars
      if (firstHR !== -1) {
        content =
          content.slice(0, firstHR) +
          indexableSection +
          "\n" +
          content.slice(firstHR);
        modified = true;
      }
    }
  }

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

      const moduleRename = getModuleRename(nameWithoutExt);
      if (moduleRename) {
        pathParts[pathParts.length - 1] = moduleRename;
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

      const moduleRename = getModuleRename(nameWithoutExt);
      if (moduleRename) {
        targetName = moduleRename;
        needsRename = true;
      } else if (nameWithoutExt.match(/^[a-z]+(-[a-z]+)*$/)) {
        // It's already in kebab-case (e.g. "entities", "app-logs"), might be a renamed module
        // Check if we can derive an original module name from it
        const possibleOriginal = getReverseModuleRename(nameWithoutExt);
        if (possibleOriginal) {
          targetName = nameWithoutExt;
        }
      }

      // Process if it needs renaming OR if it looks like a module file (for title updates)
      const isModuleFile = needsRename || nameWithoutExt.match(/^[a-z]+(-[a-z]+)*$/);
      if (isModuleFile) {
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
      expanded: true,
      pages: docsContent.functions,
    });
  }

  if (docsContent.interfaces.length > 0 && categoryMap.interfaces) {
    groups.push({
      group: getGroupName("interfaces", categoryMap),
      expanded: true,
      pages: docsContent.interfaces,
    });
  }

  if (docsContent.classes.length > 0 && categoryMap.classes) {
    groups.push({
      group: getGroupName("classes", categoryMap),
      expanded: true,
      pages: docsContent.classes,
    });
  }

  if (docsContent.typeAliases.length > 0 && categoryMap["type-aliases"]) {
    // Merge into existing group if name matches
    const groupName = getGroupName("type-aliases", categoryMap);
    // "type-aliases" key in categoryMap is "Modules", so groupName is "Modules".
    const existingGroup = groups.find((g) => g.group === groupName);

    if (existingGroup) {
      existingGroup.pages.push(...docsContent.typeAliases);
      existingGroup.pages.sort(); // Sort combined pages alphabetically
    } else {
      groups.push({
        group: groupName,
        expanded: true,
        pages: docsContent.typeAliases,
      });
    }
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
    normalized.startsWith("content/classes/") ||
    // Also check root level for when fallback processing happens
    normalized.startsWith("interfaces/") ||
    normalized.startsWith("type-aliases/") ||
    normalized.startsWith("classes/")
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

      // Check if exposed. Handle renamed modules by deriving the original name.
      // Use both the raw filename and any potential original name
      // If the filename is kebab-case, it might be a renamed module
      const possibleOriginalModule = fileName.match(/^[a-z]+(-[a-z]+)*$/)
        ? getReverseModuleRename(fileName)
        : null;
      const originalName = possibleOriginalModule || fileName;

      // If it's a renamed module (e.g. "entities"), treat it as exposed if "EntitiesModule" is exposed
      const isRenamedModule = !!possibleOriginalModule;

      const isExposedType =
        !isTypeDoc ||
        exposedTypeNames.has(originalName) ||
        exposedTypeNames.has(fileName) ||
        isRenamedModule;

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
  const baseLevel = 2; // clamp appended content so its top-level headings render as H2
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
  if (!PANELS_ENABLED) {
    return hostContent;
  }
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

    // Check if host was renamed (derives rename automatically for *Module names)
    let effectiveHostKey = hostKey;
    const pathParts = hostKey.split("/");
    const hostName = pathParts[pathParts.length - 1];
    const hostModuleRename = getModuleRename(hostName);
    if (hostModuleRename) {
      pathParts[pathParts.length - 1] = hostModuleRename;
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
    const collectedHeadings = PANELS_ENABLED ? [] : null;

    for (const appendKey of appendList) {
      // Check if appended file was renamed (derives rename automatically for *Module names)
      let effectiveAppendKey = appendKey;
      const appendParts = appendKey.split("/");
      const appendName = appendParts[appendParts.length - 1];
      const appendModuleRename = getModuleRename(appendName);
      if (appendModuleRename) {
        appendParts[appendParts.length - 1] = appendModuleRename;
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
      if (PANELS_ENABLED && collectedHeadings) {
        collectedHeadings.push(...headings);
      }

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
 * Clean up method signatures and type parameter sections:
 * 1. Replace truncated generics (e.g., Pick<..., ...> → Pick<T, K>)
 * 2. Simplify resolved keyof constraints (string | number | symbol → keyof T)
 * 3. Break long signature lines into multi-line blockquote format
 * 4. Remove method-level Type Parameters sections (redundant with signature + param docs)
 * 4b. Remove page-level ## Type Parameters sections (not useful in docs)
 * 5. Clean up broken function-return-type sections (e.g., () => void returns)
 * 7. Simplify field-selection generics: remove \<K\> from signatures, Pick<T,K> → T, K[] → (keyof T)[]
 */
function cleanupSignatures(content) {
  let modified = false;

  // Fix 7: Simplify field-selection generic K out of signatures.
  // K is a TypeScript implementation detail for field selection (Pick<T, K>).
  // In docs it's confusing — replace with clearer types.

  // 7a: Annotate \<`K`\> with its constraint → \<`K extends keyof T`\>
  if (content.includes("\\<`K`\\>")) {
    content = content.replace(/\\<`K`\\>/g, "\\<`K extends keyof T`\\>");
    modified = true;
  }

  // 7b: Expand truncated `Pick`\<..., ...\> to `Pick`\<`T`, `K`\>
  if (content.includes("`Pick`\\<..., ...\\>")) {
    content = content.replace(/`Pick`\\<\.\.\., \.\.\.\\>/g, "`Pick`\\<`T`, `K`\\>");
    modified = true;
  }

  // 7c: Replace type="K[]" with type="(keyof T)[]" in ParamField elements
  if (content.includes('type="K[]"')) {
    content = content.replace(/type="K\[\]"/g, 'type="(keyof T)[]"');
    modified = true;
  }

  // Fix 5: Clean up broken function-return-type patterns.
  // When a method returns a function (e.g., () => void), TypeDoc generates a stray
  // function signature and an empty Accordion in the Returns section. Remove them.
  // Pattern: "> (): `void`" followed by empty Accordion with "Returns" ResponseField.
  content = content.replace(
    /\n> \(\): `void`\n\n<Accordion title="Properties">\n\n<ResponseField name="Returns" type="void" required>\n\n<\/ResponseField>\n<\/Accordion>\n/g,
    () => {
      modified = true;
      return "\n";
    }
  );

  // Fix 6: Clean up truncated EntityRecord mapped type signature.
  // TypeDoc renders `EntityTypeRegistry[K]` as `(...)[(...)]`.
  content = content.replace(
    /\(\.\.\.\)\[\(\.\.\.\)\]\s*&\s*ServerEntityFields/g,
    () => {
      modified = true;
      return "EntityTypeRegistry[K] & ServerEntityFields";
    }
  );

  const lines = content.split("\n");

  // Collect page-level type parameter names from ## Type Parameters section.
  // Before heading demotion, these are ### headings (e.g., ### T).
  const pageTypeParams = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "## Type Parameters") {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith("## ") && lines[j].trim() !== "## Type Parameters")
          break;
        const paramMatch = lines[j].match(/^#{3,5}\s+(\w+)\s*$/);
        if (paramMatch) {
          pageTypeParams.push(paramMatch[1]);
        }
      }
      break;
    }
  }

  const result = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fix 1: Replace `string` | `number` | `symbol` with keyof `T`
    // TypeDoc resolves `keyof T` to `string | number | symbol` when T is unconstrained.
    if (line.includes("`string` | `number` | `symbol`")) {
      const defaultMatch = line.match(/= keyof `(\w+)`/);
      const typeName =
        defaultMatch ? defaultMatch[1] : pageTypeParams[0] || "T";
      line = line.replace(
        /`string` \| `number` \| `symbol`( = keyof `\w+`)?/,
        "keyof `" + typeName + "`"
      );
      modified = true;
    }

    // Fix 4b: Remove page-level ## Type Parameters sections.
    // These are not useful in docs — generic type params are an implementation detail.
    // Skip from "## Type Parameters" until the next "## " heading.
    if (line.trim() === "## Type Parameters") {
      let j = i + 1;
      while (j < lines.length) {
        const upcoming = lines[j].trim();
        if (upcoming.startsWith("## ") && upcoming !== "## Type Parameters") break;
        j++;
      }
      // Skip trailing blank lines
      while (j > i + 1 && lines[j - 1].trim() === "") {
        j--;
      }
      i = j - 1;
      modified = true;
      continue;
    }

    // Fix 4: Remove method-level #### Type Parameters sections.
    // These are redundant — the info is already in the signature and parameter docs.
    // Skip from "#### Type Parameters" until the next "#### " heading.
    if (line.trim() === "#### Type Parameters") {
      // Skip ahead past this section until the next #### heading or ### heading
      let j = i + 1;
      while (j < lines.length) {
        const upcoming = lines[j].trim();
        if (upcoming.startsWith("#### ") && upcoming !== "#### Type Parameters") break;
        if (upcoming.startsWith("### ")) break;
        if (upcoming.startsWith("## ")) break;
        j++;
      }
      // Also skip any trailing blank lines
      while (j > i + 1 && lines[j - 1].trim() === "") {
        j--;
      }
      i = j - 1; // -1 because the loop will increment
      modified = true;
      continue;
    }

    // Fix 2 & 3: Signatures starting with > **methodName**
    if (line.startsWith("> **") && line.includes("(")) {
      // Extract method-level type params from signature (e.g., \<`K`\>)
      const methodTypeParams = [];
      const typeParamMatch = line.match(/\\<`(\w+)`\\>/);
      if (typeParamMatch) {
        methodTypeParams.push(typeParamMatch[1]);
      }

      // Replace truncated generics: \<..., ...\> → \<`T`, `K`\>
      if (line.includes("\\<..., ...\\>")) {
        const allTypeParams = [...pageTypeParams, ...methodTypeParams];
        if (allTypeParams.length >= 2) {
          line = line.replace(
            /\\<\.\.\., \.\.\.\\>/g,
            "\\<`" + allTypeParams[0] + "`, `" + allTypeParams[1] + "`\\>"
          );
          modified = true;
        }
      }

      // Break long signatures into multi-line blockquote format.
      // Each line ends with two trailing spaces to force a hard line break
      // in Mintlify's Markdown renderer (otherwise blockquote lines get joined).
      if (line.length > 85) {
        const openParen = line.indexOf("(");
        const returnMarker = line.lastIndexOf("): ");

        if (openParen > -1 && returnMarker > openParen) {
          const prefix = line.slice(0, openParen);
          const params = line.slice(openParen + 1, returnMarker);
          const returnType = line.slice(returnMarker + 1);

          const paramList = params.split(", ");
          if (paramList.length >= 3) {
            result.push(prefix + "(  ");
            for (let j = 0; j < paramList.length; j++) {
              const comma = j < paramList.length - 1 ? "," : "";
              result.push(">   " + paramList[j] + comma + "  ");
            }
            result.push("> )" + returnType);
            modified = true;
            continue;
          }
        }
      }
    }

    result.push(line);
  }

  // Fix 6: Enrich bare type names in Returns sections with generics from signatures.
  // E.g., `ImportResult` → `ImportResult<T>` when the signature shows ImportResult\<T\>.
  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    // Match a standalone backtick-wrapped type name (only content on the line)
    const bareTypeMatch = line.match(/^`([A-Z]\w+)`$/);
    if (!bareTypeMatch) continue;
    const typeName = bareTypeMatch[1];

    // Verify this follows a Returns heading (scan back past blank lines)
    let isInReturns = false;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      if (result[j].trim() === "") continue;
      if (/^#{2,5} Returns/.test(result[j])) {
        isInReturns = true;
      }
      break;
    }
    if (!isInReturns) continue;

    // Scan backwards for the nearest signature line
    for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
      const sigLine = result[j];
      if (!sigLine.startsWith("> **") && !sigLine.startsWith("> )")) continue;
      // Look for TypeName\<`GenericParam`\> in the signature
      const genericPattern = new RegExp(
        "`" + typeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "`\\\\<`(\\w+)`\\\\>"
      );
      const genMatch = sigLine.match(genericPattern);
      if (genMatch) {
        result[i] = "`" + typeName + "<" + genMatch[1] + ">`";
        modified = true;
      }
      break;
    }
  }

  return { content: result.join("\n"), modified };
}

function applySignatureCleanup(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applySignatureCleanup(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } = cleanupSignatures(content);
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(
          `Cleaned up signatures: ${path.relative(DOCS_DIR, entryPath)}`
        );
      }
    }
  }
}

/**
 * Transforms deprecated method sections:
 * 1. Removes ~~strikethrough~~ and prepends a warning emoji to the heading
 * 2. Extracts the #### Deprecated block, removes it, and re-inserts it as a
 *    <Danger> callout between the heading and the signature blockquote
 */
function processDeprecatedMethods(content) {
  const lines = content.split("\n");
  let modified = false;
  let inFence = false;

  // First pass: find all deprecated sections and collect their info
  const deprecatedSections = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (trimmed === "#### Deprecated") {
      const start = i;
      let end = i + 1;
      let message = "";
      // The first non-empty line after "#### Deprecated" is the deprecation message.
      // Any subsequent lines are description text that TypeDoc misplaced here.
      while (end < lines.length) {
        const t = lines[end].trim();
        if (t.startsWith("#### ") || t.startsWith("### ") || t.startsWith("## ") || t === "***") break;
        if (!message && t) {
          message = t;
        }
        end++;
      }
      deprecatedSections.push({ start, end, message });
    }
  }

  if (deprecatedSections.length === 0) {
    return { content, modified: false };
  }

  // Remove deprecated sections bottom-up so indices stay valid
  for (let s = deprecatedSections.length - 1; s >= 0; s--) {
    const { start, end } = deprecatedSections[s];
    lines.splice(start, end - start);
    modified = true;
  }

  // Second pass: transform headings and insert Danger callouts
  inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Match deprecated heading: ### ~~methodName()~~ (TypeDoc wraps deprecated names in ~~)
    const headingMatch = trimmed.match(/^###\s+~~(.+?)~~\s*$/);
    if (!headingMatch) continue;

    // Remove strikethrough and prepend warning emoji
    lines[i] = lines[i].replace(
      /^(###\s+)~~(.+?)~~\s*$/,
      "$1\u26A0\uFE0F $2"
    );
    modified = true;

    // Find the matching deprecated message by method name
    const methodName = headingMatch[1].replace(/\(\)$/, "");
    const section = deprecatedSections.find((sec) =>
      sec.message.toLowerCase().includes(methodName.toLowerCase()) ||
      deprecatedSections.length === 1
    ) || deprecatedSections.shift();

    if (!section || !section.message) continue;

    // Insert Danger callout right after the heading (before the signature)
    const dangerBlock = [
      "",
      "<Danger>",
      `**Deprecated:** ${section.message}`,
      "</Danger>",
      "",
    ];
    lines.splice(i + 1, 0, ...dangerBlock);
  }

  return { content: lines.join("\n"), modified };
}

function applyDeprecatedMethodProcessing(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applyDeprecatedMethodProcessing(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } = processDeprecatedMethods(content);
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(
          `Processed deprecated methods: ${path.relative(DOCS_DIR, entryPath)}`
        );
      }
    }
  }
}

function demoteNonCallableHeadings(content) {
  const lines = content.split("\n");
  let inFence = false;
  let modified = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    // Demote ### headings that don't have parentheses (not methods) to ####
    if (line.startsWith("### ")) {
      const headingText = line.slice(4).trim();
      if (!headingText.includes("(")) {
        lines[i] = `#### ${headingText}`;
        modified = true;
      }
    }
    // Demote ## Example/Examples headings for type definitions to ####
    // These appear after type definitions (EntityRecord, SortField, etc.)
    // and should not show in TOC
    if (line.startsWith("## Example")) {
      const headingText = line.slice(3).trim();
      if (headingText === "Example" || headingText === "Examples") {
        lines[i] = `#### ${headingText}`;
        modified = true;
      }
    }
  }
  return { content: lines.join("\n"), modified };
}

function applyHeadingDemotion(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applyHeadingDemotion(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } = demoteNonCallableHeadings(content);
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(`Adjusted headings: ${path.relative(DOCS_DIR, entryPath)}`);
      }
    }
  }
}

/**
 * Link type names in the Type Declarations section to their corresponding ## headings on the page
 */
function linkTypeDeclarationToSections(content) {
  // Find all ## headings on the page (these are potential link targets)
  const sectionHeadingRegex = /^## (\w+)\s*$/gm;
  const sectionNames = new Set();
  let match;
  while ((match = sectionHeadingRegex.exec(content)) !== null) {
    sectionNames.add(match[1]);
  }

  if (sectionNames.size === 0) {
    return { content, modified: false };
  }

  // Find the Type Declarations section
  const typeDeclarationStart = content.indexOf("## Type Declarations");
  if (typeDeclarationStart === -1) {
    return { content, modified: false };
  }

  // Find the end of Type Declarations section (next ## heading or end of file)
  const afterTypeDeclaration = content.slice(
    typeDeclarationStart + "## Type Declarations".length
  );
  const nextSectionMatch = afterTypeDeclaration.match(/\n## /);
  const typeDeclarationEnd = nextSectionMatch
    ? typeDeclarationStart +
      "## Type Declarations".length +
      nextSectionMatch.index
    : content.length;

  const beforeSection = content.slice(0, typeDeclarationStart);
  const typeDeclarationSection = content.slice(
    typeDeclarationStart,
    typeDeclarationEnd
  );
  const afterSection = content.slice(typeDeclarationEnd);

  // In the Type Declarations section, find type names in backticks on blockquote lines
  // Pattern: > **propertyName**: `TypeName`
  let modified = false;
  const updatedSection = typeDeclarationSection.replace(
    /^(>\s*\*\*\w+\*\*:\s*)`(\w+)`/gm,
    (match, prefix, typeName) => {
      if (sectionNames.has(typeName)) {
        modified = true;
        const anchor = typeName.toLowerCase();
        return `${prefix}[\`${typeName}\`](#${anchor})`;
      }
      return match;
    }
  );

  if (!modified) {
    return { content, modified: false };
  }

  return {
    content: beforeSection + updatedSection + afterSection,
    modified: true,
  };
}

/**
 * Apply type declarations linking to all files
 */
function applyTypeDeclarationLinking(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applyTypeDeclarationLinking(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } =
        linkTypeDeclarationToSections(content);
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(
          `Linked type declarations: ${path.relative(DOCS_DIR, entryPath)}`
        );
      }
    }
  }
}

/**
 * Group intro sections (like "Built-in User Entity", "Generated Types") under an "Overview" heading
 * The Overview heading goes at the top of the page content, and intro paragraph becomes part of Overview
 */
function groupIntroSections(content) {
  const lines = content.split("\n");
  let modified = false;
  
  // Find where to insert "## Overview" - after the frontmatter and initial separator
  // Look for the line after the closing --- of frontmatter
  let insertIndex = -1;
  let inFrontmatter = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        // Found closing ---, next content line is where we insert
        // Skip any *** separators or blank lines
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() !== "" && lines[j].trim() !== "***") {
            insertIndex = j;
            break;
          }
        }
        break;
      }
    }
  }
  
  if (insertIndex === -1) {
    return { content, modified: false };
  }
  
  // Find the first main section heading (Methods, EntityHandler, Properties, etc.)
  // These mark the end of intro/overview sections
  const mainSectionNames = ["Methods", "EntityHandler", "Properties", "Type Definitions"];
  let mainSectionIndex = -1;
  
  for (let i = insertIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const sectionName of mainSectionNames) {
      if (line === `## ${sectionName}`) {
        mainSectionIndex = i;
        break;
      }
    }
    if (mainSectionIndex !== -1) break;
  }
  
  if (mainSectionIndex === -1) {
    // No main section found, nothing to group
    return { content, modified: false };
  }
  
  // Find all ## headings between insert point and main section (these are intro sections)
  const introHeadingIndices = [];
  for (let i = insertIndex; i < mainSectionIndex; i++) {
    const line = lines[i].trim();
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      introHeadingIndices.push(i);
    }
  }
  
  // Insert "## Overview" at the beginning of content
  lines.splice(insertIndex, 0, "## Overview", "");
  modified = true;
  
  // Demote all intro headings from ## to ### (adjust indices after insertion)
  for (let i = 0; i < introHeadingIndices.length; i++) {
    const adjustedIndex = introHeadingIndices[i] + 2; // +2 because we inserted 2 lines
    const line = lines[adjustedIndex];
    if (line.startsWith("## ")) {
      lines[adjustedIndex] = "###" + line.slice(2);
    }
  }
  
  return { content: lines.join("\n"), modified };
}

/**
 * Apply intro section grouping to module files
 */
function applyIntroSectionGrouping(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applyIntroSectionGrouping(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } = groupIntroSections(content);
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(
          `Grouped intro sections: ${path.relative(DOCS_DIR, entryPath)}`
        );
      }
    }
  }
}

/**
 * Group type definition sections under a parent heading
 * For entities: EntityRecord, EntityTypeRegistry, SortField
 * For functions: FunctionName, FunctionNameRegistry
 * For agents: AgentName, AgentNameRegistry
 */
function groupTypeDefinitions(content) {
  let modified = false;
  
  // Define type definition patterns for different modules
  const typeGroups = [
    // Connectors module
    {
      types: ["ConnectorIntegrationType", "ConnectorIntegrationTypeRegistry"],
      indicator: "ConnectorIntegrationType"
    },
    // Entities module
    {
      types: ["EntityRecord", "EntityTypeRegistry", "SortField"],
      indicator: "EntityRecord"
    },
    // Functions module
    {
      types: ["FunctionName", "FunctionNameRegistry"],
      indicator: "FunctionName"
    },
    // Agents module
    {
      types: ["AgentName", "AgentNameRegistry"],
      indicator: "AgentName"
    }
  ];
  
  // Find which type group exists in this file
  let matchedGroup = null;
  for (const group of typeGroups) {
    if (content.includes(`## ${group.indicator}`)) {
      matchedGroup = group;
      break;
    }
  }
  
  if (!matchedGroup) {
    return { content, modified: false };
  }
  
  // Find the position of the first type definition section
  const firstTypeIndex = content.indexOf(`## ${matchedGroup.indicator}`);
  if (firstTypeIndex === -1) {
    return { content, modified: false };
  }
  
  // Insert "## Type Definitions" heading before the first type
  const beforeTypeDefinitions = content.slice(0, firstTypeIndex);
  const typeDefinitionsSection = content.slice(firstTypeIndex);
  
  // Demote all types in this group from ## to ###
  let demotedSection = typeDefinitionsSection;
  for (const typeName of matchedGroup.types) {
    const regex = new RegExp(`^## ${typeName}$`, "m");
    demotedSection = demotedSection.replace(regex, `### ${typeName}`);
  }
  
  const updatedContent = 
    beforeTypeDefinitions +
    "## Type Definitions\n\n" +
    demotedSection;
  
  return { content: updatedContent, modified: true };
}

/**
 * Rename and merge method sections for better TOC organization
 * - EntityHandler → Entity Handler Methods
 * - First ## Methods in integrations → Core Integrations Methods
 * - custom-integrations → Custom Integrations Methods
 * - Create Type Definitions section with Core, custom, and Indexable
 */
function mergeSectionWithMethods(content, filePath) {
  const lines = content.split("\n");
  let modified = false;
  const isIntegrations = filePath && filePath.includes("integrations.mdx");
  let firstMethodsFound = false;
  
  // Storage for extracted content
  let coreDescription = null;
  let customDescription = null;
  let indexableContent = [];
  let customIntegrationsModuleDescription = [];
  
  // First pass: extract type descriptions and remove sections in integrations
  if (isIntegrations) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Rename ## Type Declaration to ## Type Definitions
      if (line === "## Type Declaration") {
        lines[i] = "## Type Definitions";
        modified = true;
      }
      
      // Remove ## Index Signature section (redundant with Indexable in Type Definitions)
      if (line === "## Index Signature") {
        let endIndex = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("##")) {
            endIndex = j;
            break;
          }
        }
        lines.splice(i, endIndex - i);
        modified = true;
        i--;
        continue;
      }
      
      // Remove ### Type Declarations and ### CoreIntegrations sections in Overview
      if (line === "### Type Declarations" || line === "### CoreIntegrations") {
        // Find the end of this section (next ## heading)
        let endIndex = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("##")) {
            endIndex = j;
            break;
          }
        }
        
        // Extract coreDescription if this is CoreIntegrations
        if (line === "### CoreIntegrations") {
          for (let j = i + 1; j < endIndex && j < i + 10; j++) {
            const descLine = lines[j].trim();
            if (descLine && descLine !== "***" && !descLine.startsWith("#")) {
              coreDescription = descLine;
              break;
            }
          }
        }
        
        // Remove lines from i to endIndex
        lines.splice(i, endIndex - i);
        modified = true;
        i--;
        continue;
      }
      
      // Extract and remove #### Core subsection (from old structure)
      if (line === "#### Core") {
        // Extract description
        for (let j = i + 1; j < lines.length && j < i + 10; j++) {
          const descLine = lines[j].trim();
          if (descLine && descLine !== ">" && !descLine.startsWith(">") && !descLine.startsWith("#")) {
            if (!coreDescription) coreDescription = descLine;
            break;
          }
        }
        
        // Find end of subsection
        let endIndex = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("####") || nextLine.startsWith("##")) {
            endIndex = j;
            break;
          }
        }
        
        lines.splice(i, endIndex - i);
        modified = true;
        i--;
        continue;
      }
      
      // Extract and remove #### custom subsection
      if (line === "#### custom") {
        // Extract description
        for (let j = i + 1; j < lines.length && j < i + 10; j++) {
          const descLine = lines[j].trim();
          if (descLine && descLine !== ">" && !descLine.startsWith(">") && !descLine.startsWith("#")) {
            customDescription = descLine;
            break;
          }
        }
        
        // Find end of subsection
        let endIndex = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("####") || nextLine.startsWith("##")) {
            endIndex = j;
            break;
          }
        }
        
        lines.splice(i, endIndex - i);
        modified = true;
        i--;
        continue;
      }
      
      // Extract and remove first ### Indexable (in Overview)
      if (line === "### Indexable" && indexableContent.length === 0) {
        // Extract the entire Indexable section
        let endIndex = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("##")) {
            endIndex = j;
            break;
          }
        }
        
        // Save the content (excluding the heading)
        indexableContent = lines.slice(i + 1, endIndex);
        
        // Remove this section
        lines.splice(i, endIndex - i);
        modified = true;
        i--;
        continue;
      }
      
      // Extract and remove second ## Indexable (before Custom Integrations Methods)
      if (line === "## Indexable") {
        // Extract the custom integrations module description that follows
        let endIndex = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("###") || nextLine.startsWith("## Methods")) {
            endIndex = j;
            break;
          }
        }
        
        // Extract description lines (skip the duplicate indexable definition)
        let foundSeparator = false;
        for (let j = i + 1; j < endIndex; j++) {
          const descLine = lines[j].trim();
          if (descLine === "***") {
            foundSeparator = true;
            continue;
          }
          if (foundSeparator && descLine && !descLine.startsWith(">") && !descLine.startsWith("[")) {
            customIntegrationsModuleDescription.push(lines[j]);
          }
        }
        
        // Remove this section
        lines.splice(i, endIndex - i);
        modified = true;
        i--;
        continue;
      }
    }
  }
  
  // Second pass: handle method section renaming and add descriptions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle EntityHandler + Methods → Entity Handler Methods
    if (line === "## EntityHandler") {
      // Look ahead to find the next ## Methods heading
      let methodsIndex = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine.startsWith("## ")) {
          if (nextLine === "## Methods") {
            methodsIndex = j;
          }
          break;
        }
      }
      
      if (methodsIndex !== -1) {
        lines[i] = "## Entity Handler Methods";
        lines.splice(methodsIndex, 1);
        modified = true;
      }
    }
    
    // Handle integrations module
    if (isIntegrations) {
      // First ## Methods → Core Integrations Methods
      if (line === "## Methods" && !firstMethodsFound) {
        lines[i] = "## Core Integrations Methods";
        firstMethodsFound = true;
        modified = true;
        
        // Add Core description after the heading
        if (coreDescription) {
          lines.splice(i + 1, 0, "", coreDescription, "");
        }
      }
      // Remove any remaining ## Methods (after Custom Integrations Methods)
      else if (line === "## Methods" && firstMethodsFound) {
        // This is a duplicate Methods heading, remove it
        lines.splice(i, 1);
        modified = true;
        i--;
        continue;
      }
      // custom-integrations section
      else if (line === "## custom-integrations") {
        // Replace with Custom Integrations Methods
        lines[i] = "## Custom Integrations Methods";
        modified = true;
        
        // Add custom integrations module description after the heading
        if (customIntegrationsModuleDescription.length > 0) {
          lines.splice(i + 1, 0, "", ...customIntegrationsModuleDescription, "");
        }
      }
    }
  }
  
  // Third pass: Add Type Definitions section at the end for integrations
  if (isIntegrations && (coreDescription || customDescription)) {
    lines.push("");
    lines.push("## Type Definitions");
    lines.push("");
    
    // Add Core
    if (coreDescription) {
      lines.push("### Core");
      lines.push("");
      lines.push("> **Core**: `CoreIntegrations`");
      lines.push("");
      lines.push(coreDescription);
      lines.push("");
      lines.push("#### Example");
      lines.push("");
      lines.push("<CodeGroup>");
      lines.push("");
      lines.push("```typescript Invoke an LLM");
      lines.push("const response = await base44.integrations.Core.InvokeLLM({");
      lines.push("  prompt: 'Explain quantum computing',");
      lines.push("  model: 'gpt-4'");
      lines.push("});");
      lines.push("```");
      lines.push("");
      lines.push("</CodeGroup>");
      lines.push("");
    }
    
    // Add custom
    if (customDescription) {
      lines.push("### custom");
      lines.push("");
      lines.push("> **custom**: `CustomIntegrationsModule`");
      lines.push("");
      lines.push(customDescription);
      lines.push("");
      lines.push("#### Example");
      lines.push("");
      lines.push("<CodeGroup>");
      lines.push("");
      lines.push("```typescript Call a custom integration");
      lines.push("const result = await base44.integrations.custom.call(");
      lines.push("  'github',");
      lines.push("  'get:/repos/{owner}/{repo}',");
      lines.push("  { pathParams: { owner: 'myorg', repo: 'myrepo' } }");
      lines.push(");");
      lines.push("```");
      lines.push("");
      lines.push("</CodeGroup>");
      lines.push("");
    }
    
    modified = true;
  }
  
  return { content: lines.join("\n"), modified };
}

/**
 * Apply section + methods merging to relevant files
 */
function applySectionMethodsMerging(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applySectionMethodsMerging(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } = mergeSectionWithMethods(content, entryPath);
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(
          `Merged section with methods: ${path.relative(DOCS_DIR, entryPath)}`
        );
      }
    }
  }
}

/**
 * Apply type definition grouping to relevant files
 */
function applyTypeDefinitionGrouping(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applyTypeDefinitionGrouping(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      // Apply to all files - the function checks internally if it has type definitions
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } = groupTypeDefinitions(content);
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(
          `Grouped type definitions: ${path.relative(DOCS_DIR, entryPath)}`
        );
      }
    }
  }
}

/**
 * Remove links to types that are not in the exposed types list.
 * Converts [TypeName](path) or [`TypeName`](path) to just TypeName or `TypeName`.
 */
function removeNonExposedTypeLinks(content, exposedTypeNames) {
  // Match markdown links where the link text is a type name (with or without backticks)
  // Pattern: [TypeName](some/path/TypeName) or [`TypeName`](some/path/TypeName)
  const linkRegex = /\[(`?)([A-Z][A-Za-z0-9]*)\1\]\(([^)]+)\)/g;

  let modified = false;
  const updatedContent = content.replace(
    linkRegex,
    (match, backtick, typeName, linkPath) => {
      // Check if this looks like a type doc link (path ends with the type name)
      const pathEnd = linkPath
        .split("/")
        .pop()
        .replace(/\.mdx?$/, "");

      // If the link path ends with a type name that's NOT exposed, remove the link
      if (pathEnd === typeName && !exposedTypeNames.has(typeName)) {
        modified = true;
        // Keep the type name with backticks if it had them, otherwise plain
        return backtick ? `\`${typeName}\`` : typeName;
      }

      return match;
    }
  );

  return { content: updatedContent, modified };
}

/**
 * Apply non-exposed type link removal to all files
 */
function applyNonExposedTypeLinkRemoval(dir, exposedTypeNames) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      applyNonExposedTypeLinkRemoval(entryPath, exposedTypeNames);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      const content = fs.readFileSync(entryPath, "utf-8");
      const { content: updated, modified } = removeNonExposedTypeLinks(
        content,
        exposedTypeNames
      );
      if (modified) {
        fs.writeFileSync(entryPath, updated, "utf-8");
        console.log(
          `Removed non-exposed type links: ${path.relative(
            DOCS_DIR,
            entryPath
          )}`
        );
      }
    }
  }
}

/**
 * Add clickable links for types in ParamFields that reference types on the same page
 */
function addTypeLinksToParamFields(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      addTypeLinksToParamFields(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      let content = fs.readFileSync(entryPath, "utf-8");
      let modified = false;

      // Integrate clickable link into the description for SortField type
      // Pattern: <ParamField ... type="SortField<T>">\n\nSort parameter, ...
      // Replace with: <ParamField ... type="SortField<T>">\n\nA [`SortField<T>`](#sortfield) specifying sort order, ...
      const paramFieldPattern = /(<ParamField [^>]*type=")(SortField<([^>]*)>)("[^>]*>\n\n)Sort parameter,/g;
      
      content = content.replace(paramFieldPattern, (match, prefix, fullType, generic, suffix) => {
        modified = true;
        return `${prefix}${fullType}${suffix}A [\`${fullType}\`](#sortfield) specifying sort order,`;
      });

      if (modified) {
        fs.writeFileSync(entryPath, content, "utf-8");
        console.log(`Added type links to ParamFields: ${path.relative(DOCS_DIR, entryPath)}`);
      }
    }
  }
}

/**
 * Clean up SortField type signature to be more readable
 */
function cleanupSortFieldSignature(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanupSortFieldSignature(entryPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))
    ) {
      let content = fs.readFileSync(entryPath, "utf-8");
      let modified = false;

      // Replace the complex SortField signature with a cleaner version
      // Match: > **SortField**\<`T`\> = ... & ... | `` `+${(...) & (...)}` `` | `` `-${(...) & (...)}` ``
      // Replace with: > **SortField**\<`T`\> = `string` | `` `+${string}` `` | `` `-${string}` ``
      const sortFieldSignaturePattern = /> \*\*SortField\*\*\\<`T`\\> = \.\.\. & \.\.\. \| `` `\+\$\{\(\.\.\.\) & \(\.\.\.\)\}` `` \| `` `-\$\{\(\.\.\.\) & \(\.\.\.\)\}` ``/;
      
      if (sortFieldSignaturePattern.test(content)) {
        content = content.replace(
          sortFieldSignaturePattern,
          "> **SortField**\\<`T`\\> = `keyof T` | `` `+${keyof T}` `` | `` `-${keyof T}` ``"
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(entryPath, content, "utf-8");
        console.log(`Cleaned SortField signature: ${path.relative(DOCS_DIR, entryPath)}`);
      }
    }
  }
}

/**
 * Main function
 */
/**
 * Delete types that should not appear in navigation but were needed for inline rendering.
 * These types are listed in types-to-delete-after-processing.json
 */
function deleteTypesAfterProcessing(docsDir) {
  let typesToDelete = new Set();
  try {
    const content = fs.readFileSync(TYPES_TO_DELETE_PATH, "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      typesToDelete = new Set(parsed);
    }
  } catch (e) {
    // No types to delete, that's fine
    return;
  }

  if (typesToDelete.size === 0) {
    return;
  }

  const contentDir = path.join(docsDir, "content");
  const sections = ["functions", "interfaces", "classes", "type-aliases"];

  for (const section of sections) {
    const sectionDir = path.join(contentDir, section);
    if (!fs.existsSync(sectionDir)) continue;

    const files = fs.readdirSync(sectionDir);
    for (const file of files) {
      if (!file.endsWith(".mdx") && !file.endsWith(".md")) continue;
      
      const fileName = path.basename(file, path.extname(file));
      if (typesToDelete.has(fileName)) {
        const filePath = path.join(sectionDir, file);
        fs.unlinkSync(filePath);
        console.log(`Removed (after processing): content/${section}/${file}`);
      }
    }
  }
}

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

  // Add clickable links for types in ParamFields
  addTypeLinksToParamFields(DOCS_DIR);

  // Clean up SortField signature specifically (before general signature cleanup)
  cleanupSortFieldSignature(DOCS_DIR);

  // Clean up signatures: fix truncated generics, simplify keyof constraints, break long lines
  applySignatureCleanup(DOCS_DIR);

  // Transform deprecated methods: add badge to heading, move deprecation notice to Warning callout
  applyDeprecatedMethodProcessing(DOCS_DIR);

  applyHeadingDemotion(DOCS_DIR);

  // Group intro sections (Built-in User Entity, Generated Types, etc.) under Overview
  applyIntroSectionGrouping(DOCS_DIR);

  // Merge section headings with immediately following ## Methods
  applySectionMethodsMerging(DOCS_DIR);

  // Group type definitions under a parent heading
  applyTypeDefinitionGrouping(DOCS_DIR);

  // Link type names in Type Declarations sections to their corresponding headings
  applyTypeDeclarationLinking(DOCS_DIR);

  // Remove links to types that aren't exposed (would 404)
  applyNonExposedTypeLinkRemoval(DOCS_DIR, exposedTypeNames);

  // Delete types that should not appear in navigation but were needed for inline rendering
  deleteTypesAfterProcessing(DOCS_DIR);

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
