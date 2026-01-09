/**
 * Parameter conversion functions for TypeDoc Mintlify plugin
 */

import { escapeAttribute } from "./typedoc-mintlify-utils.js";
import { extractPropertiesFromLinkedType } from "./typedoc-mintlify-linked-types.js";
import * as fs from "fs";
import * as path from "path";

const PRIMITIVE_TYPES = [
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
];
const WRAPPER_TYPE_NAMES = new Set([
  "Partial",
  "Required",
  "Readonly",
  "Omit",
  "Pick",
]);

// Helper function to resolve type paths (similar to returns file)
function resolveTypePath(typeName, app, currentPagePath = null) {
  // Skip primitive types
  if (PRIMITIVE_TYPES.includes(typeName)) {
    return null;
  }

  if (!app || !app.options) {
    return null;
  }

  const outputDir = app.options.getValue("out") || "docs";

  // Try interfaces/ first, then type-aliases/
  let filePath = path.join(outputDir, "interfaces", typeName + ".mdx");
  if (!fs.existsSync(filePath)) {
    filePath = path.join(outputDir, "interfaces", typeName + ".md");
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(outputDir, "type-aliases", typeName + ".mdx");
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(outputDir, "type-aliases", typeName + ".md");
  }

  if (fs.existsSync(filePath)) {
    // Convert to relative path from current page if possible
    if (currentPagePath) {
      const currentDir = path.dirname(path.join(outputDir, currentPagePath));
      const relativePath = path
        .relative(currentDir, filePath)
        .replace(/\\/g, "/");
      return relativePath.startsWith(".") ? relativePath : "./" + relativePath;
    }
    // Otherwise return path relative to outputDir
    return path.relative(outputDir, filePath).replace(/\\/g, "/");
  }

  return null;
}

/**
 * Convert top-level function parameters (## Parameters with ### param names)
 */
export function convertFunctionParameters(
  content,
  app = null,
  page = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  // Split content by ## headings to isolate the Parameters section
  const sections = content.split(/\n(?=##\s+\w)/);

  return sections
    .map((section) => {
      // Only process ## Parameters sections (must start with exactly ##, not ###)
      if (!section.match(/^##\s+Parameters\s*$/m)) {
        return section;
      }

      // Extract the content after "## Parameters"
      const lines = section.split("\n");
      const paramStartIdx = lines.findIndex((l) =>
        l.match(/^##\s+Parameters\s*$/)
      );

      if (paramStartIdx === -1) return section;

      // Get everything after "## Parameters" line
      const paramLines = lines.slice(paramStartIdx + 1);
      const paramContent = paramLines.join("\n");

      // Parse parameters with context for linked type resolution
      const context =
        app && page ? { app, page, currentPagePath: page.url } : null;
      const params = parseParametersWithExpansion(
        paramContent,
        "###",
        "####",
        context,
        linkedTypeNames,
        writeLinkedTypesFile
      );

      if (params.length === 0) return section;

      // Rebuild section with ParamFields
      const beforeParams = lines.slice(0, paramStartIdx + 1).join("\n");
      return (
        beforeParams +
        "\n\n" +
        buildParamFieldsSection(params, linkedTypeNames, writeLinkedTypesFile)
      );
    })
    .join("\n");
}

/**
 * Convert interface method parameters (#### Parameters with ##### param names)
 */
export function convertInterfaceMethodParameters(
  content,
  app = null,
  page = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  const context = app && page ? { app, page, currentPagePath: page.url } : null;
  return rewriteParameterSections(
    content,
    "#### Parameters",
    "#####",
    "######",
    context,
    linkedTypeNames,
    writeLinkedTypesFile
  );
}

/**
 * Convert class method parameters (#### Parameters with ##### param names)
 */
export function convertClassMethodParameters(
  content,
  app = null,
  page = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  const context = app && page ? { app, page, currentPagePath: page.url } : null;
  return rewriteParameterSections(
    content,
    "#### Parameters",
    "#####",
    "######",
    context,
    linkedTypeNames,
    writeLinkedTypesFile
  );
}

function rewriteParameterSections(
  content,
  sectionHeading,
  paramLevel,
  nestedLevel,
  context = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  const lines = content.split("\n");
  const result = [];
  let i = 0;

  const isTerminatorLine = (line) => {
    return (
      line.startsWith("#### Returns") ||
      line.startsWith("#### Example") ||
      line === "***" ||
      line.startsWith("### ") ||
      line.startsWith("## ")
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(sectionHeading)) {
      result.push(line);
      i++;
      const sectionStart = i;
      while (i < lines.length && !isTerminatorLine(lines[i])) {
        i++;
      }
      const sectionContentLines = lines.slice(sectionStart, i);
      const sectionContent = sectionContentLines.join("\n").trim();
      // Use parseParametersWithExpansion if context is available, otherwise use parseParameters
      const params = context
        ? parseParametersWithExpansion(
            sectionContent,
            paramLevel,
            nestedLevel,
            context,
            linkedTypeNames,
            writeLinkedTypesFile
          )
        : parseParameters(
            sectionContent,
            paramLevel,
            nestedLevel,
            context,
            linkedTypeNames,
            writeLinkedTypesFile
          );
      if (params.length > 0) {
        const block = buildParamFieldsSection(
          params,
          linkedTypeNames,
          writeLinkedTypesFile
        ).trim();
        if (block) {
          result.push("");
          result.push(...block.split("\n"));
          result.push("");
        }
      } else {
        result.push(...sectionContentLines);
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

/**
 * Parse parameters with type expansion (for functions)
 */
function parseParametersWithExpansion(
  paramContent,
  paramLevel,
  nestedLevel,
  context = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  const lines = paramContent.split("\n");
  const params = [];

  const isParamHeading = (line) => line.startsWith(paramLevel + " ");
  const isNestedHeading = nestedLevel
    ? (line) => line.startsWith(nestedLevel + " ")
    : () => false;
  const isTerminator = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (
      trimmed.startsWith("#### Returns") ||
      trimmed.startsWith("#### Example") ||
      trimmed === "***"
    ) {
      return true;
    }
    const nestedPrefix = nestedLevel ? nestedLevel + " " : null;
    if (/^#{1,3}\s+/.test(trimmed)) {
      if (
        !trimmed.startsWith(paramLevel + " ") &&
        !(nestedPrefix && trimmed.startsWith(nestedPrefix))
      ) {
        return true;
      }
    }
    return false;
  };

  const extractType = (line) => {
    if (!line) return null;
    const trimmed = line.trim();

    // Handle [`TypeName`](link) format first (backticks inside the link)
    const linkWithBackticksMatch = trimmed.match(/^\[`([^`]+)`\]\(([^)]+)\)$/);
    if (linkWithBackticksMatch) {
      return {
        type: linkWithBackticksMatch[1],
        link: linkWithBackticksMatch[2],
      };
    }

    // Handle [TypeName](link) format
    const linkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return { type: linkMatch[1], link: linkMatch[2] };
    }

    // Handle simple `TypeName` format
    const simpleMatch = trimmed.match(/^`([^`]+)`$/);
    if (simpleMatch) {
      return { type: simpleMatch[1], link: null };
    }

    // Handle function type format: (`param`) => `returnType` or (`param`: `Type`) => `returnType`
    // e.g., (`conversation`) => `void` or (`error`: `Error`) => `void`
    if (trimmed.startsWith("(") && trimmed.includes("=>")) {
      const sanitized = trimmed
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1") // Remove markdown links
        .replace(/`/g, "") // Remove backticks
        .replace(/\\/g, "") // Remove escapes
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
      if (sanitized) {
        return { type: sanitized, link: null };
      }
    }

    // Fallback: sanitize markdown-heavy type definitions such as `Partial`<[`Type`](link)>
    if (trimmed.startsWith("`")) {
      const sanitized = trimmed
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/`/g, "")
        .replace(/\\/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (sanitized) {
        return { type: sanitized, link: null };
      }
    }

    return null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isParamHeading(line)) {
      i++;
      continue;
    }

    let rawName = line.slice(paramLevel.length).trim();
    const optional = rawName.endsWith("?");
    const cleanName = optional ? rawName.slice(0, -1).trim() : rawName.trim();
    i++;

    // Skip blank lines
    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }

    let type = "any";
    let typeLink = null;
    if (i < lines.length) {
      const maybeType = extractType(lines[i]);
      if (maybeType) {
        if (typeof maybeType === "object") {
          type = maybeType.type;
          typeLink = maybeType.link;
        } else {
          type = maybeType;
        }
        i++;
      }
    }

    // Skip blank lines after type
    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }

    // Check if the next line has an array indicator (...[])
    if (i < lines.length && lines[i].trim() === "...[]") {
      // If type is still 'any' (default), it means no type was specified
      // TypeDoc-Markdown sometimes omits the type line for arrays
      // Default to 'string' as the base type in this case
      if (type === "any") {
        type = "string[]";
      } else {
        type = type + "[]";
      }
      i++; // Skip the array indicator line

      // Skip blank lines after array indicator
      while (i < lines.length && lines[i].trim() === "") {
        i++;
      }
    }

    const descriptionLines = [];
    while (
      i < lines.length &&
      !isParamHeading(lines[i]) &&
      !isNestedHeading(lines[i]) &&
      !isTerminator(lines[i])
    ) {
      descriptionLines.push(lines[i]);
      i++;
    }

    // Check if we should expand this type inline
    let linkedTypeInfo = getLinkedTypeInfo(type, typeLink, context);
    let nested = [];

    // Track linked types for suppression (for types with explicit links)

    // Try to extract properties from the linked type
    if (linkedTypeInfo && context) {
      const properties = extractPropertiesFromLinkedType(
        linkedTypeInfo,
        context
      );
      if (properties.length > 0) {
        nested = normalizePropertiesForParams(properties);
      }
    }

    // If no linked properties were found, check for manually specified nested fields
    if (nested.length === 0) {
      while (i < lines.length && isNestedHeading(lines[i])) {
        let nestedRawName = lines[i].slice(nestedLevel.length).trim();
        const nestedOptional = nestedRawName.endsWith("?");
        const nestedName = nestedOptional
          ? nestedRawName.slice(0, -1).trim()
          : nestedRawName.trim();
        i++;

        while (i < lines.length && lines[i].trim() === "") {
          i++;
        }

        let nestedType = "any";
        let nestedTypeLink = null;
        if (i < lines.length) {
          const maybeNestedType = extractType(lines[i]);
          if (maybeNestedType) {
            if (typeof maybeNestedType === "object") {
              nestedType = maybeNestedType.type;
              nestedTypeLink = maybeNestedType.link;
            } else {
              nestedType = maybeNestedType;
            }
            i++;
          }
        }

        while (i < lines.length && lines[i].trim() === "") {
          i++;
        }

        // Check if the next line has an array indicator (...[])
        if (i < lines.length && lines[i].trim() === "...[]") {
          // If type is still 'any' (default), it means no type was specified
          // TypeDoc-Markdown sometimes omits the type line for arrays
          // Default to 'string' as the base type in this case
          if (nestedType === "any") {
            nestedType = "string[]";
          } else {
            nestedType = nestedType + "[]";
          }
          i++; // Skip the array indicator line

          // Skip blank lines after array indicator
          while (i < lines.length && lines[i].trim() === "") {
            i++;
          }
        }

        const nestedDescLines = [];
        while (
          i < lines.length &&
          !isNestedHeading(lines[i]) &&
          !isParamHeading(lines[i]) &&
          !isTerminator(lines[i])
        ) {
          nestedDescLines.push(lines[i]);
          i++;
        }

        const nestedField = {
          name: nestedName,
          type: nestedType,
          description: nestedDescLines.join("\n").trim(),
          optional: nestedOptional,
          nested: [],
        };

        if (nestedField.nested.length === 0) {
          const nestedLinkedInfo = getLinkedTypeInfo(
            nestedType,
            nestedTypeLink,
            context
          );
          if (nestedLinkedInfo && context) {
            const nestedProps = extractPropertiesFromLinkedType(
              nestedLinkedInfo,
              context
            );
            if (nestedProps.length > 0) {
              nestedField.nested = normalizePropertiesForParams(nestedProps);
            }
          }
        }

        nested.push(nestedField);
      }
    }

    params.push({
      name: cleanName,
      type: type,
      description: descriptionLines.join("\n").trim(),
      optional,
      nested,
    });
  }

  return params;
}

/**
 * Parse parameters from markdown content (for interface/class methods - no expansion)
 */
function parseParameters(
  paramContent,
  paramLevel,
  nestedLevel,
  context = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  const lines = paramContent.split("\n");
  const params = [];

  const isParamHeading = (line) => line.startsWith(paramLevel + " ");
  const isNestedHeading = nestedLevel
    ? (line) => line.startsWith(nestedLevel + " ")
    : () => false;
  const isTerminator = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (
      trimmed.startsWith("#### Returns") ||
      trimmed.startsWith("#### Example") ||
      trimmed === "***"
    ) {
      return true;
    }
    const nestedPrefix = nestedLevel ? nestedLevel + " " : null;
    if (/^#{1,3}\s+/.test(trimmed)) {
      if (
        !trimmed.startsWith(paramLevel + " ") &&
        !(nestedPrefix && trimmed.startsWith(nestedPrefix))
      ) {
        return true;
      }
    }
    return false;
  };

  const extractType = (line) => {
    if (!line) return null;
    const trimmed = line.trim();

    // Handle [`TypeName`](link) format first (backticks inside the link)
    const linkWithBackticksMatch = trimmed.match(/^\[`([^`]+)`\]\(([^)]+)\)$/);
    if (linkWithBackticksMatch) {
      return {
        type: linkWithBackticksMatch[1],
        link: linkWithBackticksMatch[2],
      };
    }

    // Handle [TypeName](link) format
    const linkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return { type: linkMatch[1], link: linkMatch[2] };
    }

    // Handle simple `TypeName` format
    const simpleMatch = trimmed.match(/^`([^`]+)`$/);
    if (simpleMatch) {
      return { type: simpleMatch[1], link: null };
    }

    // Handle function type format: (`param`) => `returnType` or (`param`: `Type`) => `returnType`
    // e.g., (`conversation`) => `void` or (`error`: `Error`) => `void`
    if (trimmed.startsWith("(") && trimmed.includes("=>")) {
      const sanitized = trimmed
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1") // Remove markdown links
        .replace(/`/g, "") // Remove backticks
        .replace(/\\/g, "") // Remove escapes
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
      if (sanitized) {
        return { type: sanitized, link: null };
      }
    }

    // Fallback: sanitize markdown-heavy type definitions such as `Partial`<[`Type`](link)>
    if (trimmed.startsWith("`")) {
      const sanitized = trimmed
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/`/g, "")
        .replace(/\\/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (sanitized) {
        return { type: sanitized, link: null };
      }
    }

    return null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isParamHeading(line)) {
      i++;
      continue;
    }

    let rawName = line.slice(paramLevel.length).trim();
    const optional = rawName.endsWith("?");
    const cleanName = optional ? rawName.slice(0, -1).trim() : rawName.trim();
    i++;

    // Skip blank lines
    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }

    let type = "any";
    let typeLink = null;
    if (i < lines.length) {
      const maybeType = extractType(lines[i]);
      if (maybeType) {
        if (typeof maybeType === "object") {
          type = maybeType.type;
          typeLink = maybeType.link;
        } else {
          type = maybeType;
        }
        i++;
      }
    }

    // Skip blank lines after type
    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }

    // Check if the next line has an array indicator (...[])
    if (i < lines.length && lines[i].trim() === "...[]") {
      // If type is still 'any' (default), it means no type was specified
      // TypeDoc-Markdown sometimes omits the type line for arrays
      // Default to 'string' as the base type in this case
      if (type === "any") {
        type = "string[]";
      } else {
        type = type + "[]";
      }
      i++; // Skip the array indicator line

      // Skip blank lines after array indicator
      while (i < lines.length && lines[i].trim() === "") {
        i++;
      }
    }

    const descriptionLines = [];
    while (
      i < lines.length &&
      !isParamHeading(lines[i]) &&
      !isNestedHeading(lines[i]) &&
      !isTerminator(lines[i])
    ) {
      descriptionLines.push(lines[i]);
      i++;
    }

    // Check if we should expand this type inline
    const linkedTypeInfo = getLinkedTypeInfo(type, typeLink, context);
    let nested = [];

    // Try to extract properties from the linked type
    if (linkedTypeInfo && context) {
      const properties = extractPropertiesFromLinkedType(
        linkedTypeInfo,
        context
      );
      if (properties.length > 0) {
        nested = normalizePropertiesForParams(properties);
        // Keep the type as the original type name (without expanding to 'object')
        // This preserves the type name in the ParamField
      }
    }

    // If no linked properties were found, check for manually specified nested fields
    if (nested.length === 0) {
      while (i < lines.length && isNestedHeading(lines[i])) {
        let nestedRawName = lines[i].slice(nestedLevel.length).trim();
        const nestedOptional = nestedRawName.endsWith("?");
        const nestedName = nestedOptional
          ? nestedRawName.slice(0, -1).trim()
          : nestedRawName.trim();
        i++;

        while (i < lines.length && lines[i].trim() === "") {
          i++;
        }

        let nestedType = "any";
        let nestedTypeLink = null;
        if (i < lines.length) {
          const maybeNestedType = extractType(lines[i]);
          if (maybeNestedType) {
            if (typeof maybeNestedType === "object") {
              nestedType = maybeNestedType.type;
              nestedTypeLink = maybeNestedType.link;
            } else {
              nestedType = maybeNestedType;
            }
            i++;
          }
        }

        while (i < lines.length && lines[i].trim() === "") {
          i++;
        }

        // Check if the next line has an array indicator (...[])
        if (i < lines.length && lines[i].trim() === "...[]") {
          // If type is still 'any' (default), it means no type was specified
          // TypeDoc-Markdown sometimes omits the type line for arrays
          // Default to 'string' as the base type in this case
          if (nestedType === "any") {
            nestedType = "string[]";
          } else {
            nestedType = nestedType + "[]";
          }
          i++; // Skip the array indicator line

          // Skip blank lines after array indicator
          while (i < lines.length && lines[i].trim() === "") {
            i++;
          }
        }

        const nestedDescLines = [];
        while (
          i < lines.length &&
          !isNestedHeading(lines[i]) &&
          !isParamHeading(lines[i]) &&
          !isTerminator(lines[i])
        ) {
          nestedDescLines.push(lines[i]);
          i++;
        }

        const nestedField = {
          name: nestedName,
          type: nestedType,
          description: nestedDescLines.join("\n").trim(),
          optional: nestedOptional,
          nested: [],
        };

        if (nestedField.nested.length === 0) {
          const nestedLinkedInfo = getLinkedTypeInfo(
            nestedType,
            nestedTypeLink,
            context
          );
          if (nestedLinkedInfo && context) {
            const nestedProps = extractPropertiesFromLinkedType(
              nestedLinkedInfo,
              context
            );
            if (nestedProps.length > 0) {
              nestedField.nested = normalizePropertiesForParams(nestedProps);
            }
          }
        }

        nested.push(nestedField);
      }
    }

    params.push({
      name: cleanName,
      type: nested.length > 0 ? type : type, // Keep original type name
      description: descriptionLines.join("\n").trim(),
      optional,
      nested,
    });
  }

  return params;
}

/**
 * Build ParamField components from parsed parameters
 */
function buildParamFieldsSection(
  params,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  if (!params || params.length === 0) {
    return "";
  }

  let fieldsOutput = "";

  for (const param of params) {
    const requiredAttr = param.optional ? "" : " required";

    // Track non-primitive parameter types for suppression

    fieldsOutput += `<ParamField body="${param.name}" type="${param.type}"${requiredAttr}>\n`;

    // Always show description in ParamField if it exists
    if (param.description) {
      fieldsOutput += `\n${param.description}\n`;
    }

    fieldsOutput += "\n</ParamField>\n";

    // If param has nested fields, wrap them in an Accordion
    if (param.nested.length > 0) {
      // Accordion title is always "Properties"
      fieldsOutput += `\n<Accordion title="Properties">\n\n`;

      fieldsOutput += renderNestedParamFields(param.nested);

      fieldsOutput += "</Accordion>\n\n";
    } else {
      fieldsOutput += "\n";
    }
  }

  // Wrap multiple parameters in an Accordion (but not single parameters, even if they have nested fields)
  const hasMultipleParams = params.length > 1;

  if (hasMultipleParams) {
    return `<Accordion title="Properties">\n\n${fieldsOutput.trim()}\n</Accordion>`;
  }

  return fieldsOutput;
}

function renderNestedParamFields(fields) {
  if (!fields || fields.length === 0) {
    return "";
  }

  let output = "";
  for (const field of fields) {
    const requiredAttr = field.optional ? "" : " required";
    output += `<ParamField body="${escapeAttribute(
      field.name
    )}" type="${escapeAttribute(field.type)}"${requiredAttr}>\n`;

    if (field.description) {
      output += `\n${field.description}\n`;
    }

    if (Array.isArray(field.nested) && field.nested.length > 0) {
      output += `\n<Accordion title="Properties">\n\n`;
      output += renderNestedParamFields(field.nested);
      output += "</Accordion>\n";
    }

    output += "\n</ParamField>\n\n";
  }

  return output;
}

function getLinkedTypeInfo(typeName, typeLink, context) {
  if (!typeName) {
    return null;
  }

  if (typeLink) {
    const simpleFromLink = simplifyTypeName(typeName) || typeName;
    return { typeName: simpleFromLink, typePath: typeLink };
  }

  if (!context) {
    return null;
  }

  const simpleTypeName = simplifyTypeName(typeName);
  if (!simpleTypeName || PRIMITIVE_TYPES.includes(simpleTypeName)) {
    return null;
  }

  const typePath = resolveTypePath(
    simpleTypeName,
    context.app,
    context.currentPagePath
  );
  return { typeName: simpleTypeName, typePath: typePath || simpleTypeName };
}

function simplifyTypeName(typeName) {
  if (!typeName) {
    return null;
  }

  let cleaned = typeName.trim();

  // Unwrap helper types like Partial<T>, Required<T>, etc.
  cleaned = unwrapHelperType(cleaned);

  // Remove generics/array indicators and take the first union/intersection entry
  cleaned = cleaned
    .replace(/[\[\]]/g, "")
    .split("|")[0]
    .split("&")[0]
    .trim();
  return cleaned.replace(/<.*?>/g, "").trim();
}

function unwrapHelperType(typeName) {
  let current = typeName.trim();
  let changed = true;

  while (changed) {
    changed = false;
    const match = current.match(/^([A-Za-z0-9_]+)\s*<(.+)>$/);
    if (!match) {
      break;
    }

    const wrapperName = match[1];
    if (!WRAPPER_TYPE_NAMES.has(wrapperName)) {
      break;
    }

    const genericBlock = match[2];
    const inner = getFirstGenericArgument(genericBlock);
    if (!inner) {
      break;
    }

    current = inner.trim();
    changed = true;
  }

  return current;
}

function getFirstGenericArgument(genericBlock) {
  if (!genericBlock) {
    return "";
  }

  let depth = 0;
  let buffer = "";
  for (let i = 0; i < genericBlock.length; i++) {
    const char = genericBlock[i];
    if (char === "<") {
      depth++;
      buffer += char;
      continue;
    }
    if (char === ">") {
      if (depth > 0) {
        depth--;
      }
      buffer += char;
      continue;
    }
    if (char === "," && depth === 0) {
      return buffer.trim();
    }
    buffer += char;
  }

  return buffer.trim();
}

function normalizePropertiesForParams(properties) {
  if (!Array.isArray(properties)) {
    return [];
  }

  return properties.map((prop) => ({
    name: prop.name,
    type: prop.type || "any",
    description: prop.description || "",
    optional: !!prop.optional,
    nested: normalizePropertiesForParams(prop.nested || []),
  }));
}
