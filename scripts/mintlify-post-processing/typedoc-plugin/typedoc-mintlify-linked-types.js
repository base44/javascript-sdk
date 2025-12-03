/**
 * Linked type extraction and property parsing functions
 */

import * as fs from "fs";
import * as path from "path";
import { ReflectionKind } from "typedoc";

const TYPES_TO_EXPOSE_PATH = path.resolve(
  process.cwd(),
  "scripts/mintlify-post-processing/types-to-expose.json"
);
let exposedTypeNames = null;
try {
  const raw = fs.readFileSync(TYPES_TO_EXPOSE_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    exposedTypeNames = new Set(parsed);
  }
} catch (err) {
  // Ignore; fall back to linking based on path existence
  exposedTypeNames = null;
}

const PROPERTY_KINDS = new Set([
  ReflectionKind.Property,
  ReflectionKind.PropertySignature,
]);

const PRIMITIVE_REFERENCES = new Set([
  "any",
  "string",
  "number",
  "boolean",
  "void",
  "null",
  "undefined",
  "object",
  "Array",
  "Promise",
  "Record",
  "Map",
  "Set",
  "Date",
]);

const KIND_DIRECTORY_MAP = {
  [ReflectionKind.Class]: "classes",
  [ReflectionKind.Interface]: "interfaces",
  [ReflectionKind.TypeAlias]: "type-aliases",
};

function resolveTypePath(typeName, context, targetKind = null) {
  if (!context?.app || !typeName) {
    return null;
  }

  if (exposedTypeNames && !exposedTypeNames.has(typeName)) {
    return null;
  }

  const { app, currentPagePath } = context;
  const outputDir = app.options.getValue("out") || "docs";

  const directory = KIND_DIRECTORY_MAP[targetKind] || "interfaces";
  const filePath = path.join(outputDir, directory, `${typeName}.mdx`);

  if (currentPagePath) {
    const currentDir = path.dirname(path.join(outputDir, currentPagePath));
    const relativePath = path
      .relative(currentDir, filePath)
      .replace(/\\/g, "/");
    return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  }

  return path.relative(outputDir, filePath).replace(/\\/g, "/");
}

/**
 * Extract properties from a linked type using TypeDoc's reflection API
 * Returns { properties: [], indexSignature: null } or just properties array for backward compatibility
 */
export function extractPropertiesFromLinkedType(
  linkedTypeInfo,
  context,
  visited = new Set(),
  options = {}
) {
  const emptyResult = options.includeIndexSignature
    ? { properties: [], indexSignature: null }
    : [];

  if (!linkedTypeInfo || !context) {
    return emptyResult;
  }

  const { typeName } = linkedTypeInfo;
  const visitKey = typeName;

  if (!typeName || visited.has(visitKey)) {
    return emptyResult;
  }

  visited.add(visitKey);

  try {
    // First, try to get the type from TypeDoc's reflection API
    const {
      properties: reflectionProps,
      description: reflectionDescription,
      indexSignature,
    } = extractPropertiesFromReflection(typeName, context, visited);
    if (reflectionProps.length > 0 || indexSignature) {
      if (reflectionDescription && linkedTypeInfo) {
        linkedTypeInfo.description = reflectionDescription;
      }
      if (options.includeIndexSignature) {
        return { properties: reflectionProps, indexSignature };
      }
      return reflectionProps;
    }

    // Fallback: try to read from generated markdown file
    const {
      properties: markdownProps,
      description: markdownDescription,
      indexSignature: mdIndexSig,
    } = extractPropertiesFromMarkdownFile(linkedTypeInfo, context);
    if (markdownDescription && linkedTypeInfo) {
      linkedTypeInfo.description = markdownDescription;
    }
    if (options.includeIndexSignature) {
      return { properties: markdownProps, indexSignature: mdIndexSig || null };
    }
    return markdownProps;
  } catch (error) {
    console.warn(
      `Error extracting properties for type ${typeName}:`,
      error.message
    );
    return emptyResult;
  } finally {
    visited.delete(visitKey);
  }
}

export function getLinkedTypeDescription(linkedTypeInfo, context) {
  if (!linkedTypeInfo || !context) {
    return "";
  }
  if (linkedTypeInfo.description) {
    return linkedTypeInfo.description;
  }

  const { typeName } = linkedTypeInfo;
  if (!typeName) {
    return "";
  }

  try {
    const project =
      context.page?.model?.project || context.app?.converter?.project;
    if (project) {
      const reflection = findReflectionByName(project, typeName);
      if (reflection) {
        const description = getCommentSummary(reflection, context);
        if (description) {
          linkedTypeInfo.description = description;
          return description;
        }
      }
    }
  } catch {
    // ignore reflection lookup issues
  }

  try {
    const { description } = extractPropertiesFromMarkdownFile(
      linkedTypeInfo,
      context
    );
    if (description) {
      linkedTypeInfo.description = description;
      return description;
    }
  } catch {
    // ignore markdown fallback issues
  }

  return "";
}

/**
 * Extract properties from TypeDoc's reflection API (preferred method)
 */
function extractPropertiesFromReflection(typeName, context, visited) {
  if (!context) {
    return { properties: [], description: "", indexSignature: null };
  }

  const { app, page } = context;

  try {
    // Access the project through the page's model
    const project = page?.model?.project || app?.converter?.project;
    if (!project) {
      return { properties: [], description: "", indexSignature: null };
    }

    // Find the type reflection in the project
    const typeReflection = findReflectionByName(project, typeName);
    if (!typeReflection) {
      return { properties: [], description: "", indexSignature: null };
    }

    // Extract properties from the reflection
    const properties = [];
    const propertyNodes = getPropertyNodesFromReflection(typeReflection);

    for (const child of propertyNodes) {
      const property = buildPropertyFromReflection(child, context, visited);
      if (property) {
        properties.push(property);
      }
    }

    // Extract index signature if present
    const indexSignature = extractIndexSignature(typeReflection, context);

    const description = getCommentSummary(typeReflection, context);
    return { properties, description, indexSignature };
  } catch (error) {
    console.warn(
      `Error extracting properties from reflection for ${typeName}:`,
      error.message
    );
    return { properties: [], description: "", indexSignature: null };
  }
}

/**
 * Extract index signature from a reflection (e.g., [key: string]: any)
 */
function extractIndexSignature(reflection, context) {
  if (!reflection) {
    return null;
  }

  // Check for indexSignatures array on the reflection
  const indexSigs = reflection.indexSignatures || reflection.indexSignature;
  if (!indexSigs) {
    return null;
  }

  const sigArray = Array.isArray(indexSigs) ? indexSigs : [indexSigs];
  if (sigArray.length === 0) {
    return null;
  }

  // Get the first index signature
  const sig = sigArray[0];
  if (!sig) {
    return null;
  }

  // Extract key type (usually string)
  let keyType = "string";
  if (sig.parameters && sig.parameters.length > 0) {
    const keyParam = sig.parameters[0];
    keyType = getTypeString(keyParam.type) || "string";
  }

  // Extract value type
  const valueType = getTypeString(sig.type) || "any";

  // Extract description from comment
  const description = getCommentSummary(sig, context) || "";

  return {
    keyType,
    valueType,
    description,
  };
}

/**
 * Find a reflection by name in the project
 */
function findReflectionByName(reflection, name) {
  if (reflection.name === name) {
    return reflection;
  }

  if (reflection.children) {
    for (const child of reflection.children) {
      const found = findReflectionByName(child, name);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Get a string representation of a type
 */
function getTypeString(type) {
  if (!type) return "any";

  switch (type.type) {
    case "intrinsic":
      return type.name;
    case "reference":
      return formatReferenceType(type);
    case "array":
      return `${getTypeString(type.elementType)}[]`;
    case "union":
      return type.types?.map((t) => getTypeString(t)).join(" | ") || "any";
    case "intersection":
      return type.types?.map((t) => getTypeString(t)).join(" & ") || "any";
    case "literal":
      return JSON.stringify(type.value);
    case "reflection":
      return "object";
    default:
      return type.name || "any";
  }
}

/**
 * Check if a property is optional
 */
function isOptional(child) {
  return child.flags?.isOptional || false;
}

/**
 * Check if a type is object-like (has properties)
 */
function isObjectLikeType(type) {
  return type?.type === "reflection" && type.declaration?.children;
}

/**
 * Extract nested properties from an object type
 */
function extractNestedPropertiesFromReflectionType(type, context, visited) {
  if (!isObjectLikeType(type)) {
    return [];
  }

  const nested = [];
  if (type.declaration?.children) {
    for (const child of type.declaration.children) {
      const property = buildPropertyFromReflection(child, context, visited);
      if (property) {
        nested.push(property);
      }
    }
  }

  return nested;
}

/**
 * Fallback: Extract properties from a linked type's markdown file
 */
function extractPropertiesFromMarkdownFile(linkedTypeInfo, context) {
  const { typePath, typeName } = linkedTypeInfo;
  const { currentPagePath, app } = context;

  if (!app || !app.options) {
    return { properties: [], description: "" };
  }

  try {
    // Get the output directory from TypeDoc (usually 'docs')
    const outputDir = app.options.getValue("out") || "docs";

    // Convert relative link to file path
    // Links can be:
    // - Just the type name: "LoginViaEmailPasswordResponse"
    // - Relative path: "../interfaces/LoginViaEmailPasswordResponse" or "./interfaces/LoginViaEmailPasswordResponse"
    // - Absolute-looking: "interfaces/LoginViaEmailPasswordResponse"
    let filePath;

    // Remove .md or .mdx extension if present
    let cleanTypePath = typePath.replace(/\.(md|mdx)$/, "");

    if (cleanTypePath.startsWith("../") || cleanTypePath.startsWith("./")) {
      // Relative path - resolve from current page's directory
      const currentDir = path.dirname(
        path.join(outputDir, currentPagePath || "")
      );
      const basePath = path.resolve(currentDir, cleanTypePath);

      // Try .mdx first, then .md
      if (!basePath.endsWith(".md") && !basePath.endsWith(".mdx")) {
        const mdxPath = basePath + ".mdx";
        const mdPath = basePath + ".md";
        filePath = fs.existsSync(mdxPath) ? mdxPath : mdPath;
      } else {
        filePath = basePath;
      }
    } else if (cleanTypePath.includes("/")) {
      // Path with directory separator
      filePath = path.join(outputDir, cleanTypePath);

      // Try .mdx first, then .md
      if (!filePath.endsWith(".md") && !filePath.endsWith(".mdx")) {
        const mdxPath = filePath + ".mdx";
        const mdPath = filePath + ".md";
        filePath = fs.existsSync(mdxPath) ? mdxPath : mdPath;
      }
    } else {
      // Just the type name - try interfaces/ first, then type-aliases/
      // Try .mdx first, then .md
      filePath = path.join(outputDir, "interfaces", cleanTypePath + ".mdx");
      if (!fs.existsSync(filePath)) {
        filePath = path.join(outputDir, "interfaces", cleanTypePath + ".md");
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(outputDir, "type-aliases", cleanTypePath + ".mdx");
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(outputDir, "type-aliases", cleanTypePath + ".md");
      }
    }

    // Normalize the path
    filePath = path.normalize(filePath);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Don't warn during generation - the file might not exist yet
      return { properties: [], description: "" };
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return parsePropertiesFromTypeFile(content);
  } catch (error) {
    // Silent failure during generation
    return { properties: [], description: "" };
  }
}

/**
 * Parse properties from a type file's markdown content
 */
function parsePropertiesFromTypeFile(content) {
  const properties = [];
  const lines = content.split("\n");

  // Collect intro description until Properties section
  const introLines = [];
  let descriptionCaptured = false;

  // Extract Indexable section if present
  const indexSignature = parseIndexableSection(content);

  // Find the Properties section
  let inPropertiesSection = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Start of Properties section
    if (line.match(/^##\s+Properties\s*$/)) {
      inPropertiesSection = true;
      i++;
      continue;
    }

    if (!inPropertiesSection) {
      if (line.trim()) {
        introLines.push(line);
        descriptionCaptured = true;
      } else if (descriptionCaptured) {
        introLines.push("");
      }
    }

    // Stop at next top-level heading (##)
    if (
      inPropertiesSection &&
      line.match(/^##\s+/) &&
      !line.match(/^##\s+Properties\s*$/)
    ) {
      break;
    }

    // Parse property: ### propertyName or ### propertyName?
    if (inPropertiesSection && line.match(/^###\s+/)) {
      const propMatch = line.match(/^###\s+(.+)$/);
      if (propMatch) {
        const rawName = propMatch[1].trim();
        const optional = rawName.endsWith("?");
        // Unescape markdown escapes (e.g., access\_token -> access_token)
        let name = optional ? rawName.slice(0, -1).trim() : rawName.trim();
        name = name
          .replace(/\\_/g, "_")
          .replace(/\\\*/g, "*")
          .replace(/\\`/g, "`");

        i++;
        // Skip blank lines
        while (i < lines.length && lines[i].trim() === "") {
          i++;
        }

        // Get type from next line: > **name**: `type` or > `optional` **name**: `type`
        let type = "any";
        if (i < lines.length && lines[i].includes("`")) {
          const typeMatch = lines[i].match(/`([^`]+)`/);
          if (typeMatch) {
            type = typeMatch[1].trim();
          }
          i++;
        }

        // Skip blank lines
        while (i < lines.length && lines[i].trim() === "") {
          i++;
        }

        // Collect description and nested properties
        const descriptionLines = [];
        const nested = [];

        // Look for nested properties (#### heading)
        while (i < lines.length) {
          const nextLine = lines[i];
          // Stop at next property (###) or section end (## or ***)
          if (
            nextLine.match(/^###\s+/) ||
            nextLine.match(/^##\s+/) ||
            nextLine === "***"
          ) {
            break;
          }

          // Check for nested property (####)
          if (nextLine.match(/^####\s+/)) {
            const nestedMatch = nextLine.match(/^####\s+(.+)$/);
            if (nestedMatch) {
              const nestedRawName = nestedMatch[1].trim();
              const nestedOptional = nestedRawName.endsWith("?");
              // Unescape markdown escapes
              let nestedName = nestedOptional
                ? nestedRawName.slice(0, -1).trim()
                : nestedRawName.trim();
              nestedName = nestedName
                .replace(/\\_/g, "_")
                .replace(/\\\*/g, "*")
                .replace(/\\`/g, "`");

              i++;
              while (i < lines.length && lines[i].trim() === "") {
                i++;
              }

              let nestedType = "any";
              if (i < lines.length && lines[i].includes("`")) {
                const nestedTypeMatch = lines[i].match(/`([^`]+)`/);
                if (nestedTypeMatch) {
                  nestedType = nestedTypeMatch[1].trim();
                }
                i++;
              }

              while (i < lines.length && lines[i].trim() === "") {
                i++;
              }

              const nestedDescLines = [];
              while (
                i < lines.length &&
                !lines[i].match(/^####\s+/) &&
                !lines[i].match(/^###\s+/) &&
                !lines[i].match(/^##\s+/) &&
                lines[i] !== "***"
              ) {
                nestedDescLines.push(lines[i]);
                i++;
              }

              nested.push({
                name: nestedName,
                type: nestedType,
                description: nestedDescLines.join("\n").trim(),
                optional: nestedOptional,
              });
              continue;
            }
          }

          descriptionLines.push(nextLine);
          i++;
        }

        properties.push({
          name,
          type,
          description: descriptionLines.join("\n").trim(),
          optional,
          nested,
        });
        continue;
      }
    }

    i++;
  }

  const description = introLines.join("\n").trim();
  return { properties, description, indexSignature };
}

/**
 * Parse the Indexable section from markdown content
 * TypeDoc generates: ## Indexable\n\n\\[`key`: `string`\\]: `valueType`\n\nDescription
 */
function parseIndexableSection(content) {
  const indexableMatch = content.match(
    /##\s+Indexable\s*\n+([^\n]+)\n*([\s\S]*?)(?=\n##|\n\*\*\*|$)/i
  );
  if (!indexableMatch) {
    return null;
  }

  // Parse the signature line: \[`key`: `string`\]: `valueType` or [`key`: `string`]: `valueType`
  const signatureLine = indexableMatch[1].trim();
  const description = (indexableMatch[2] || "").trim();

  // Extract key type and value type from the signature
  // Pattern: \[`keyName`: `keyType`\]: `valueType` or similar
  const sigMatch = signatureLine.match(
    /\[`?(\w+)`?\s*:\s*`?(\w+)`?\s*\]\s*:\s*`?([^`\n]+)`?/
  );
  if (!sigMatch) {
    // Try simpler pattern
    const simpleMatch = signatureLine.match(/`(\w+)`/g);
    if (simpleMatch && simpleMatch.length >= 2) {
      return {
        keyType: simpleMatch[0].replace(/`/g, ""),
        valueType: simpleMatch[simpleMatch.length - 1].replace(/`/g, ""),
        description,
      };
    }
    return null;
  }

  return {
    keyType: sigMatch[2] || "string",
    valueType: sigMatch[3] || "any",
    description,
  };
}

function buildPropertyFromReflection(child, context, visited) {
  if (!child || !PROPERTY_KINDS.has(child.kind)) {
    return null;
  }

  const property = {
    name: child.name,
    type: getTypeString(child.type),
    description: getCommentSummary(child, context),
    optional: isOptional(child),
    nested: [],
  };

  const nestedFromType = extractNestedPropertiesFromType(
    child.type,
    context,
    visited
  );
  if (nestedFromType.length > 0) {
    property.nested = nestedFromType;
  }

  return property;
}

function getPropertyNodesFromReflection(reflection) {
  if (!reflection) {
    return [];
  }

  if (Array.isArray(reflection.children) && reflection.children.length > 0) {
    return reflection.children;
  }

  if (reflection.type?.declaration?.children?.length) {
    return reflection.type.declaration.children;
  }

  if (reflection.declaration?.children?.length) {
    return reflection.declaration.children;
  }

  return [];
}

function extractNestedPropertiesFromType(type, context, visited) {
  if (!type) {
    return [];
  }

  switch (type.type) {
    case "reference": {
      const referencedName = getReferenceTypeName(type);
      if (!referencedName || PRIMITIVE_REFERENCES.has(referencedName)) {
        return [];
      }
      return extractPropertiesFromLinkedType(
        { typeName: referencedName, typePath: referencedName },
        context,
        visited
      );
    }
    case "array":
      return extractNestedPropertiesFromType(
        type.elementType,
        context,
        visited
      );
    case "union":
    case "intersection": {
      if (!Array.isArray(type.types)) {
        return [];
      }
      for (const subType of type.types) {
        const nested = extractNestedPropertiesFromType(
          subType,
          context,
          visited
        );
        if (nested.length > 0) {
          return nested;
        }
      }
      return [];
    }
    case "reflection":
      return extractNestedPropertiesFromReflectionType(type, context, visited);
    default:
      return [];
  }
}

function getReferenceTypeName(type) {
  if (!type) {
    return null;
  }

  if (typeof type.name === "string" && type.name) {
    return type.name;
  }

  if (typeof type.qualifiedName === "string" && type.qualifiedName) {
    const segments = type.qualifiedName.split(".");
    return segments[segments.length - 1];
  }

  if (type.reflection?.name) {
    return type.reflection.name;
  }

  return null;
}

function getCommentSummary(reflection, context) {
  if (!reflection?.comment) {
    return "";
  }

  const parts = [];
  if (Array.isArray(reflection.comment.summary)) {
    parts.push(...reflection.comment.summary);
  }
  if (reflection.comment.blockTags) {
    for (const tag of reflection.comment.blockTags) {
      if (tag.tag === "@remarks" && Array.isArray(tag.content)) {
        parts.push(...tag.content);
      }
      if (
        (tag.tag === "@see" ||
          tag.tag === "@link" ||
          tag.tag === "@linkcode" ||
          tag.tag === "@returns") &&
        Array.isArray(tag.content)
      ) {
        parts.push(...tag.content);
      }
    }
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.map((part) => renderCommentPart(part, context)).join("") || "";
}

function renderCommentPart(part, context) {
  if (!part) {
    return "";
  }

  switch (part.kind) {
    case "text":
      return part.text || "";
    case "code":
      return part.text ? `\`${part.text}\`` : "";
    case "inline-tag":
      if (part.tag === "@link") {
        const linkText = (part.text || part.target?.name || "").trim();
        const typeName = part.target?.name || null;
        const linkTarget = typeName
          ? resolveTypePath(typeName, context, part.target?.kind)
          : null;
        if (linkTarget && linkText) {
          return `[${linkText}](${linkTarget})`;
        }
        if (linkText) {
          return linkText;
        }
        return typeName || "";
      }
      return part.text || "";
    default:
      return part.text || "";
  }
}

function formatReferenceType(type) {
  if (!type) {
    return "any";
  }

  let typeName = type.name || "any";
  if (type.typeArguments && type.typeArguments.length > 0) {
    const args = type.typeArguments.map((arg) => getTypeString(arg)).join(", ");
    typeName += `<${args}>`;
  }
  return typeName;
}
