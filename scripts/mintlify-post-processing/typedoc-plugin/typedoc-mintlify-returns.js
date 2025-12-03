/**
 * Return/Response field conversion functions for TypeDoc Mintlify plugin
 */

import * as fs from "fs";
import * as path from "path";
import {
  extractPropertiesFromLinkedType,
  getLinkedTypeDescription,
} from "./typedoc-mintlify-linked-types.js";
import { escapeAttribute } from "./typedoc-mintlify-utils.js";

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

function extractReturnsDescription(page) {
  if (!page?.model) {
    return "";
  }

  const signature =
    Array.isArray(page.model.signatures) && page.model.signatures.length > 0
      ? page.model.signatures[0]
      : null;

  const returnsTag = signature?.comment?.blockTags?.find(
    (tag) => tag.tag === "@returns" || tag.tag === "@return"
  );

  if (!returnsTag || !returnsTag.content) {
    return "";
  }

  return renderCommentParts(returnsTag.content).trim();
}

function renderCommentParts(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      if (!part) return "";
      switch (part.kind) {
        case "text":
          return part.text || "";
        case "code":
          return part.text ? "`" + part.text + "`" : "";
        case "inline-tag":
          if (part.tag === "@link") {
            return (part.text || part.target?.name || "").trim();
          }
          return part.text || "";
        default:
          return part.text || "";
      }
    })
    .join("");
}

/**
 * Extract signature information from content lines
 */
/**
 * Try to resolve a type name to a documentation file path
 */
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

export function extractSignatureInfo(
  lines,
  linkedTypeNames,
  writeLinkedTypesFile,
  app,
  currentPagePath = null
) {
  const signatureMap = new Map();
  const linkedTypeMap = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match function signature: > **methodName**(...): `returnType` or `returnType`\<`generic`\>
    // Handle both simple types and generic types like `Promise`\<`any`\> or `Promise`\<[`TypeName`](link)\>
    const sigMatch = line.match(
      /^>\s*\*\*(\w+)\*\*\([^)]*\):\s*`([^`]+)`(?:\\<(.+?)\\>)?/
    );
    if (sigMatch) {
      const methodName = sigMatch[1];
      let returnType = sigMatch[2];
      const genericParam = sigMatch[3];

      // Check if generic parameter is a markdown link: [`TypeName`](link)
      if (genericParam) {
        const linkMatch = genericParam.match(/\[`([^`]+)`\]\(([^)]+)\)/);
        if (linkMatch) {
          const linkedTypeName = linkMatch[1];
          const linkedTypePath = linkMatch[2];
          returnType = `${returnType}<${linkedTypeName}>`;
          linkedTypeMap.set(i, {
            typeName: linkedTypeName,
            typePath: linkedTypePath,
          });
          // Track this type name so we can suppress its documentation page
          if (linkedTypeNames) {
            linkedTypeNames.add(linkedTypeName);
            if (writeLinkedTypesFile) writeLinkedTypesFile();
          }
        } else {
          // Simple generic type without link - try to resolve it
          const simpleGeneric = genericParam.replace(/`/g, "").trim();
          returnType = `${returnType}<${simpleGeneric}>`;

          // Try to resolve the type to a documentation file
          const typePath = resolveTypePath(simpleGeneric, app, currentPagePath);
          if (typePath) {
            linkedTypeMap.set(i, {
              typeName: simpleGeneric,
              typePath: typePath,
            });
            if (linkedTypeNames) {
              linkedTypeNames.add(simpleGeneric);
              if (writeLinkedTypesFile) writeLinkedTypesFile();
            }
          }
        }
      }
      // Store the return type with the signature line index as the key
      signatureMap.set(i, returnType);

      // If we don't already have linked type info (e.g., non-generic return),
      // try to resolve the return type to a documentation file
      if (!linkedTypeMap.has(i)) {
        const simpleTypeName = getSimpleTypeName(returnType);
        if (simpleTypeName && !PRIMITIVE_TYPES.includes(simpleTypeName)) {
          let typePath = resolveTypePath(simpleTypeName, app, currentPagePath);
          if (!typePath) {
            // Fallback to the raw type name so downstream parsing can still attempt resolution
            typePath = simpleTypeName;
          }
          linkedTypeMap.set(i, { typeName: simpleTypeName, typePath });
          if (linkedTypeNames) {
            linkedTypeNames.add(simpleTypeName);
            if (writeLinkedTypesFile) writeLinkedTypesFile();
          }
        }
      }
    }
  }

  return { signatureMap, linkedTypeMap };
}

/**
 * Convert function returns
 */
export function convertFunctionReturns(
  content,
  app,
  page,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  // For functions, we need to extract signature info with linked types
  const lines = content.split("\n");
  // Use provided linkedTypeNames Set or create a local one
  const localLinkedTypeNames = linkedTypeNames || new Set();
  const localWriteLinkedTypesFile = writeLinkedTypesFile || (() => {});
  const { signatureMap, linkedTypeMap } = extractSignatureInfo(
    lines,
    localLinkedTypeNames,
    localWriteLinkedTypesFile,
    app,
    page?.url
  );

  return rewriteReturnSections(content, {
    heading: "## Returns",
    fieldHeading: "###",
    nestedHeading: "####",
    stopOnLevel3: false,
    signatureMap,
    linkedTypeMap,
    app,
    page,
    linkedTypeNames: localLinkedTypeNames,
    writeLinkedTypesFile: localWriteLinkedTypesFile,
  });
}

/**
 * Convert interface method returns
 */
export function convertInterfaceMethodReturns(
  content,
  app,
  page,
  linkedTypeNames,
  writeLinkedTypesFile
) {
  const lines = content.split("\n");
  const { signatureMap, linkedTypeMap } = extractSignatureInfo(
    lines,
    linkedTypeNames,
    writeLinkedTypesFile,
    app,
    page?.url
  );

  return rewriteReturnSections(content, {
    heading: "#### Returns",
    fieldHeading: "#####",
    nestedHeading: "######",
    stopOnLevel3: true,
    signatureMap,
    linkedTypeMap,
    app,
    page,
  });
}

/**
 * Convert class method returns
 */
export function convertClassMethodReturns(
  content,
  app,
  page,
  linkedTypeNames,
  writeLinkedTypesFile
) {
  const lines = content.split("\n");
  const { signatureMap, linkedTypeMap } = extractSignatureInfo(
    lines,
    linkedTypeNames,
    writeLinkedTypesFile,
    app,
    page?.url
  );

  return rewriteReturnSections(content, {
    heading: "#### Returns",
    fieldHeading: "#####",
    nestedHeading: "######",
    stopOnLevel3: true,
    signatureMap,
    linkedTypeMap,
    app,
    page,
  });
}

function rewriteReturnSections(content, options) {
  const {
    heading,
    fieldHeading,
    nestedHeading,
    stopOnLevel3,
    signatureMap = new Map(),
    linkedTypeMap = new Map(),
    app,
    page,
    linkedTypeNames = null,
    writeLinkedTypesFile = null,
  } = options;
  const lines = content.split("\n");
  const result = [];
  let i = 0;

  const isTerminatorLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.match(/^#{2,4}\s+Examples?/i) || trimmed === "***") {
      return true;
    }
    if (heading !== "## Returns" && trimmed.startsWith("## ")) {
      return true;
    }
    // For function Returns, stop at nested method definitions (#### methodName())
    if (heading === "## Returns" && trimmed.match(/^####\s+\w+\.?\w*\(\)/)) {
      return true;
    }
    if (stopOnLevel3 && trimmed.startsWith("### ")) {
      return true;
    }
    return false;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(heading)) {
      result.push(line);
      i++;
      const sectionStart = i;
      while (i < lines.length && !isTerminatorLine(lines[i])) {
        i++;
      }
      const sectionLines = lines.slice(sectionStart, i);
      const sectionContent = sectionLines.join("\n").trim();

      // For function Returns sections, parse nested fields (### headings)
      if (heading === "## Returns") {
        // Look backwards to find the function signature
        let sigLineIdx = i - 2; // Go back past the Returns heading
        while (
          sigLineIdx >= 0 &&
          !lines[sigLineIdx].match(/^>\s*\*\*\w+\*\*\(/)
        ) {
          sigLineIdx--;
        }

        // If we didn't find it by pattern, try to find it in our signature map
        if (sigLineIdx < 0 || !signatureMap.has(sigLineIdx)) {
          // Try searching a bit further back (up to 10 lines)
          for (let j = i - 2; j >= Math.max(0, i - 12); j--) {
            if (signatureMap.has(j)) {
              sigLineIdx = j;
              break;
            }
          }
        }

        const returnTypeFromSignature =
          sigLineIdx >= 0 ? signatureMap.get(sigLineIdx) : null;
        const linkedTypeInfo =
          sigLineIdx >= 0 ? linkedTypeMap.get(sigLineIdx) : null;
        const context =
          app && page ? { app, page, currentPagePath: page.url } : null;

        // Get the type name for display - prefer linkedTypeInfo.typeName, fallback to returnTypeFromSignature
        const returnTypeName =
          linkedTypeInfo?.typeName || returnTypeFromSignature;

        // Track linked type if found
        if (linkedTypeInfo && linkedTypeNames) {
          linkedTypeNames.add(linkedTypeInfo.typeName);
          if (writeLinkedTypesFile) {
            writeLinkedTypesFile();
          }
        }

        const {
          fields,
          leadingText,
          extractedTypeName,
          typeDescription,
          indexSignature,
        } = parseReturnFields(
          sectionContent,
          fieldHeading,
          nestedHeading,
          returnTypeFromSignature,
          linkedTypeInfo,
          context,
          linkedTypeNames,
          writeLinkedTypesFile
        );
        if (fields.length === 0 && !indexSignature) {
          result.push(...sectionLines);
        } else {
          const typeNameForDisplay = extractedTypeName || returnTypeName;
          if (typeNameForDisplay) {
            result.push("");
            result.push(`\`${typeNameForDisplay}\``);
          }
          const descriptionParts = [];
          if (typeDescription) {
            descriptionParts.push(typeDescription);
          }
          if (leadingText) {
            descriptionParts.push(leadingText);
          }
          const returnsDescription = extractReturnsDescription(page);
          if (returnsDescription) {
            descriptionParts.push(returnsDescription);
          }
          if (descriptionParts.length > 0) {
            result.push("");
            result.push(descriptionParts.join("\n\n"));
          }
          const fieldsBlock = formatReturnFieldsOutput(
            fields,
            null,
            linkedTypeNames,
            writeLinkedTypesFile,
            indexSignature
          );
          if (fieldsBlock) {
            result.push("");
            result.push(fieldsBlock);
            result.push("");
          }
        }
        continue;
      }

      // For interface/class method Returns sections
      // The Returns section starts at i-1 (after the heading line)
      // Look backwards to find the function signature
      let sigLineIdx = i - 2; // Go back past the Returns heading
      while (
        sigLineIdx >= 0 &&
        !lines[sigLineIdx].match(/^>\s*\*\*\w+\*\*\(/)
      ) {
        sigLineIdx--;
      }

      // If we didn't find it by pattern, try to find it in our signature map
      // by checking a few lines before the Returns section
      if (sigLineIdx < 0 || !signatureMap.has(sigLineIdx)) {
        // Try searching a bit further back (up to 10 lines)
        for (let j = i - 2; j >= Math.max(0, i - 12); j--) {
          if (signatureMap.has(j)) {
            sigLineIdx = j;
            break;
          }
        }
      }

      const returnTypeFromSignature =
        sigLineIdx >= 0 ? signatureMap.get(sigLineIdx) : null;
      const linkedTypeInfo =
        sigLineIdx >= 0 ? linkedTypeMap.get(sigLineIdx) : null;

      // Get the type name for display - prefer linkedTypeInfo.typeName, fallback to returnTypeFromSignature
      const returnTypeName =
        linkedTypeInfo?.typeName || returnTypeFromSignature;

      // Track linked type if found
      if (linkedTypeInfo && linkedTypeNames) {
        linkedTypeNames.add(linkedTypeInfo.typeName);
        if (writeLinkedTypesFile) {
          writeLinkedTypesFile();
        }
      }

      const {
        fields,
        leadingText,
        extractedTypeName,
        typeDescription,
        indexSignature,
      } = parseReturnFields(
        sectionContent,
        fieldHeading,
        nestedHeading,
        returnTypeFromSignature,
        linkedTypeInfo,
        { app, page, currentPagePath: page.url },
        linkedTypeNames,
        writeLinkedTypesFile
      );
      if (fields.length === 0 && !indexSignature) {
        result.push(...sectionLines);
      } else {
        const typeNameForDisplay = extractedTypeName || returnTypeName;
        if (typeNameForDisplay) {
          result.push("");
          result.push(`\`${typeNameForDisplay}\``);
        }
        const descriptionParts = [];
        if (typeDescription) {
          descriptionParts.push(typeDescription);
        }
        if (leadingText) {
          descriptionParts.push(leadingText);
        }
        if (descriptionParts.length > 0) {
          result.push("");
          result.push(descriptionParts.join("\n\n"));
        }
        const fieldsBlock = formatReturnFieldsOutput(
          fields,
          null,
          linkedTypeNames,
          writeLinkedTypesFile,
          indexSignature
        );
        if (fieldsBlock) {
          result.push("");
          result.push(fieldsBlock);
          result.push("");
        }
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

function parseReturnFields(
  sectionContent,
  fieldHeading,
  nestedHeading,
  returnTypeFromSignature = null,
  linkedTypeInfo = null,
  context = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  let infoForDescription = linkedTypeInfo;

  if (!sectionContent) {
    // If we have a linked type but no section content, try to extract from the linked type
    if (linkedTypeInfo && context) {
      const result = extractPropertiesFromLinkedType(
        linkedTypeInfo,
        context,
        new Set(),
        { includeIndexSignature: true }
      );
      const properties = result.properties || result;
      const indexSignature = result.indexSignature || null;

      if (properties.length > 0 || indexSignature) {
        // Return separate ResponseFields for each property (skip the default "result" field)
        const resultFields = [];

        // Add a separate ResponseField for each property
        for (const prop of properties) {
          resultFields.push({
            name: prop.name,
            type: prop.type,
            description: prop.description,
            optional: prop.optional,
            nested: prop.nested || [],
          });
        }

        return {
          fields: resultFields,
          leadingText: "",
          extractedTypeName: linkedTypeInfo.typeName,
          typeDescription:
            getLinkedTypeDescription(linkedTypeInfo, context) || "",
          indexSignature,
        };
      }
    }
    return {
      fields: [],
      leadingText: "",
      extractedTypeName: null,
      typeDescription:
        getLinkedTypeDescription(infoForDescription, context) || "",
      indexSignature: null,
    };
  }

  const lines = sectionContent.split("\n");
  const fields = [];
  const headingPrefix = fieldHeading ? `${fieldHeading} ` : null;
  const nestedPrefix = nestedHeading ? `${nestedHeading} ` : null;

  const extractTypeFromLine = (line) => {
    if (!line) return null;
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith(">")) {
      // Handle lines like: > **entities**: `object` or > **auth**: [`AuthMethods`](../interfaces/AuthMethods)
      const blockMatch = trimmed.match(/^>\s*\*\*([^*]+)\*\*:\s*(.+)$/);
      if (blockMatch) {
        const typePart = blockMatch[2].replace(/`/g, "").trim();
        // Check if it's a markdown link: [TypeName](link)
        const linkMatch = typePart.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          return { type: linkMatch[1], link: linkMatch[2] };
        }
        return { type: typePart, link: null };
      }
    }
    if (trimmed.includes("`")) {
      // Extract type from backticks, could be a link: [`AuthMethods`](../interfaces/AuthMethods)
      const typeMatch = trimmed.match(/`([^`]+)`/);
      if (typeMatch) {
        const typePart = typeMatch[1].trim();
        // Check if there's a link after the backticks
        const linkMatch = trimmed.match(/`[^`]+`\s*\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          return { type: linkMatch[1], link: linkMatch[2] };
        }
        // Check if the type itself is a link format
        const inlineLinkMatch = typePart.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (inlineLinkMatch) {
          return { type: inlineLinkMatch[1], link: inlineLinkMatch[2] };
        }
        return { type: typePart, link: null };
      }
    }
    // Check for standalone markdown links
    const linkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return { type: linkMatch[1], link: linkMatch[2] };
    }
    return null;
  };

  const isHeadingLine = (line) =>
    headingPrefix && line.startsWith(headingPrefix);
  const isNestedHeadingLine = (line) =>
    nestedPrefix && line.startsWith(nestedPrefix);

  const leadingLines = [];
  let index = 0;
  if (headingPrefix) {
    while (index < lines.length && !isHeadingLine(lines[index])) {
      if (lines[index].trim()) {
        leadingLines.push(lines[index]);
      }
      index++;
    }
  }

  // If no field headings found, treat as simple return
  if (!headingPrefix || index >= lines.length) {
    let type = returnTypeFromSignature || "any";
    const descriptionLines = [];

    // Check if there's an existing ResponseField in the content
    const responseFieldMatch = sectionContent.match(
      /<ResponseField[^>]*type="([^"]+)"[^>]*>/
    );
    if (responseFieldMatch) {
      // Extract type from existing ResponseField
      const existingType = responseFieldMatch[1];
      if (existingType && existingType !== "any") {
        type = existingType;
      }
    }

    for (const line of lines) {
      // Skip ResponseField tags - we'll replace them
      if (
        line.trim().startsWith("<ResponseField") ||
        line.trim() === "</ResponseField>"
      ) {
        continue;
      }
      const maybeType = extractTypeFromLine(line);
      if (maybeType && type === "any") {
        type = typeof maybeType === "object" ? maybeType.type : maybeType;
        continue;
      }
      if (
        line.trim() &&
        !line.trim().startsWith("`") &&
        !line.trim().startsWith("<")
      ) {
        descriptionLines.push(line);
      }
    }
    let description = descriptionLines.join("\n").trim();

    // Check if we have a linked type to inline
    let typeInfoToUse = linkedTypeInfo;

    // If we don't have linkedTypeInfo but we have a type name, try to resolve it
    if (!typeInfoToUse && type && context && context.app) {
      const simpleTypeName = getSimpleTypeName(type);
      if (simpleTypeName && !PRIMITIVE_TYPES.includes(simpleTypeName)) {
        const typePath = resolveTypePath(
          simpleTypeName,
          context.app,
          context.currentPagePath
        );
        if (typePath) {
          typeInfoToUse = { typeName: simpleTypeName, typePath };
        } else if (simpleTypeName) {
          // Even if we can't resolve the path, try with just the name
          typeInfoToUse = {
            typeName: simpleTypeName,
            typePath: simpleTypeName,
          };
        }
        if (typeInfoToUse) {
          infoForDescription = typeInfoToUse;
        }

        // Track resolved linked type
        if (typeInfoToUse && linkedTypeNames) {
          linkedTypeNames.add(typeInfoToUse.typeName);
          if (writeLinkedTypesFile) {
            writeLinkedTypesFile();
          }
        }
      }
    }

    if (typeInfoToUse && context) {
      const result = extractPropertiesFromLinkedType(
        typeInfoToUse,
        context,
        new Set(),
        { includeIndexSignature: true }
      );
      const properties = result.properties || result;
      const indexSignature = result.indexSignature || null;

      if (properties.length > 0 || indexSignature) {
        // Return separate ResponseFields for each property (skip the default "result" field)
        const resultFields = [];

        // Add a separate ResponseField for each property
        for (const prop of properties) {
          resultFields.push({
            name: prop.name,
            type: prop.type,
            description: prop.description,
            optional: prop.optional,
            nested: prop.nested || [],
          });
        }

        return {
          fields: resultFields,
          leadingText: "",
          extractedTypeName: typeInfoToUse.typeName, // Pass the type name for display
          typeDescription:
            getLinkedTypeDescription(typeInfoToUse, context) || "",
          indexSignature,
        };
      }
    }

    // Use 'result' as default name, or extract from description
    let name = "result";
    if (description) {
      // Check if description contains a type hint
      const typeHint = description.match(/(\w+)\s+(?:instance|object|value)/i);
      if (typeHint) {
        name = typeHint[1].toLowerCase();
      }
    }
    return {
      fields: [
        {
          name,
          type,
          description,
          optional: false,
          nested: [],
        },
      ],
      leadingText: "",
      extractedTypeName: null,
      typeDescription:
        getLinkedTypeDescription(
          infoForDescription || typeInfoToUse,
          context
        ) || "",
    };
  }

  // Parse fields with headings
  while (index < lines.length) {
    const headingLine = lines[index];
    if (!isHeadingLine(headingLine)) {
      index++;
      continue;
    }

    let rawName = headingLine.slice(headingPrefix.length).trim();
    const optional = rawName.endsWith("?");
    const name = optional ? rawName.slice(0, -1).trim() : rawName.trim();
    index++;

    while (index < lines.length && lines[index].trim() === "") {
      index++;
    }

    let type = "any";
    if (index < lines.length) {
      const maybeType = extractTypeFromLine(lines[index]);
      if (maybeType) {
        type = typeof maybeType === "object" ? maybeType.type : maybeType;
        index++;
      }
    }

    while (index < lines.length && lines[index].trim() === "") {
      index++;
    }

    const descriptionLines = [];
    const nested = [];

    // Collect description and nested fields
    while (
      index < lines.length &&
      !isHeadingLine(lines[index]) &&
      !(nestedPrefix && isNestedHeadingLine(lines[index]))
    ) {
      descriptionLines.push(lines[index]);
      index++;
    }

    // Parse nested fields if any
    while (index < lines.length && isNestedHeadingLine(lines[index])) {
      const nestedHeadingLine = lines[index];
      let nestedRawName = nestedHeadingLine.slice(nestedPrefix.length).trim();
      const nestedOptional = nestedRawName.endsWith("?");
      const nestedName = nestedOptional
        ? nestedRawName.slice(0, -1).trim()
        : nestedRawName.trim();
      index++;

      while (index < lines.length && lines[index].trim() === "") {
        index++;
      }

      let nestedType = "any";
      if (index < lines.length) {
        const maybeNestedType = extractTypeFromLine(lines[index]);
        if (maybeNestedType) {
          nestedType =
            typeof maybeNestedType === "object"
              ? maybeNestedType.type
              : maybeNestedType;
          index++;
        }
      }

      while (index < lines.length && lines[index].trim() === "") {
        index++;
      }

      const nestedDescLines = [];
      while (
        index < lines.length &&
        !isNestedHeadingLine(lines[index]) &&
        !isHeadingLine(lines[index])
      ) {
        nestedDescLines.push(lines[index]);
        index++;
      }

      nested.push({
        name: nestedName,
        type: nestedType,
        description: nestedDescLines.join("\n").trim(),
        optional: nestedOptional,
      });
    }

    let description = descriptionLines.join("\n").trim();

    // Check if this field's type is a linked type that should be expanded
    // Only expand if we don't already have nested fields from headings
    if (nested.length === 0 && context && type && type !== "any") {
      const simpleTypeName = getSimpleTypeName(type);
      if (simpleTypeName && !PRIMITIVE_TYPES.includes(simpleTypeName)) {
        // Try to resolve the type to a linked type
        const typePath = resolveTypePath(
          simpleTypeName,
          context.app,
          context.currentPagePath
        );
        const linkedTypeInfo = typePath
          ? { typeName: simpleTypeName, typePath }
          : { typeName: simpleTypeName, typePath: simpleTypeName };

        // Extract properties from the linked type
        const properties = extractPropertiesFromLinkedType(
          linkedTypeInfo,
          context
        );
        if (properties.length > 0) {
          // Add properties as nested fields
          for (const prop of properties) {
            nested.push({
              name: prop.name,
              type: prop.type,
              description: prop.description || "",
              optional: prop.optional,
            });
          }

          // Track the linked type
          if (linkedTypeNames) {
            linkedTypeNames.add(simpleTypeName);
            if (writeLinkedTypesFile) {
              writeLinkedTypesFile();
            }
          }
        }
      }
    }

    fields.push({
      name,
      type,
      description,
      optional,
      nested,
    });
  }

  return {
    fields,
    leadingText: leadingLines.join("\n").trim(),
    extractedTypeName: null,
    typeDescription:
      getLinkedTypeDescription(infoForDescription, context) || "",
    indexSignature: null,
  };
}

function buildResponseFieldsSection(
  fields,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  let output = "";

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

  for (const field of fields) {
    const requiredAttr = field.optional ? "" : " required";
    const defaultAttr = field.default
      ? ` default="${escapeAttribute(field.default)}"`
      : "";

    // Track non-primitive return field types for suppression
    if (
      linkedTypeNames &&
      field.type &&
      !PRIMITIVE_TYPES.includes(field.type)
    ) {
      const simpleTypeName = field.type.replace(/[<>\[\]]/g, "").trim();
      if (simpleTypeName && !PRIMITIVE_TYPES.includes(simpleTypeName)) {
        linkedTypeNames.add(simpleTypeName);
        if (writeLinkedTypesFile) {
          writeLinkedTypesFile();
        }
      }
    }

    output += `<ResponseField name="${escapeAttribute(
      field.name
    )}" type="${escapeAttribute(field.type)}"${defaultAttr}${requiredAttr}>\n`;

    if (field.description) {
      output += `\n${field.description}\n`;
    }

    if (field.nested && field.nested.length > 0) {
      // Wrap nested fields in an Accordion component
      output += `\n<Accordion title="Properties">\n\n`;
      output += renderNestedResponseFields(
        field.nested,
        linkedTypeNames,
        writeLinkedTypesFile
      );
      output += "</Accordion>\n";
    }

    output += "\n</ResponseField>\n\n";
  }

  return output;
}

function formatReturnFieldsOutput(
  fields,
  returnType = null,
  linkedTypeNames = null,
  writeLinkedTypesFile = null,
  indexSignature = null
) {
  if ((!fields || fields.length === 0) && !indexSignature) {
    return "";
  }

  const isSingleSimpleField =
    fields.length === 1 &&
    (!fields[0].nested || fields[0].nested.length === 0) &&
    !indexSignature;

  if (isSingleSimpleField) {
    // For a single, non-object field, we only need to return its description text.
    // The type is already rendered separately (`typeNameForDisplay`), so avoid wrapping
    // it in a ResponseField to keep the output concise.
    return fields[0].description || "";
  }

  const fieldsBlock = buildResponseFieldsSection(
    fields,
    linkedTypeNames,
    writeLinkedTypesFile
  ).trimEnd();

  // Build index signature as a ResponseField if present
  let indexSignatureBlock = "";
  if (indexSignature) {
    const keyName = `[key: ${indexSignature.keyType}]`;
    const description = indexSignature.description || "";
    indexSignatureBlock = `<ResponseField name="${escapeAttribute(
      keyName
    )}" type="${escapeAttribute(
      indexSignature.valueType
    )}">\n\n${description}\n\n</ResponseField>\n\n`;
  }

  if (!fieldsBlock && !indexSignatureBlock) {
    return "";
  }

  const hasMultipleFields = fields.length > 1;
  const hasNestedFields = fields.some(
    (field) => Array.isArray(field.nested) && field.nested.length > 0
  );

  if (hasMultipleFields || hasNestedFields || indexSignature) {
    // Extract the simple type name to display above the Accordion
    let typeDisplay = "";
    if (returnType) {
      const simpleTypeName = getSimpleTypeName(returnType);
      if (simpleTypeName && !PRIMITIVE_TYPES.includes(simpleTypeName)) {
        typeDisplay = `\`${simpleTypeName}\`\n\n`;
      }
    }
    // If we still don't have a type display and have multiple fields,
    // try to infer from the context (e.g., if all fields are from the same type)
    if (!typeDisplay && hasMultipleFields && fields.length > 0) {
      // Check if we can get a type hint from the first field's description or context
      // This is a fallback for cases where returnType wasn't passed correctly
    }
    return `${typeDisplay}<Accordion title="Properties">\n\n${fieldsBlock}${indexSignatureBlock}\n</Accordion>`;
  }

  return fieldsBlock + indexSignatureBlock;
}

function renderNestedResponseFields(
  fields,
  linkedTypeNames = null,
  writeLinkedTypesFile = null
) {
  if (!fields || fields.length === 0) {
    return "";
  }

  let output = "";
  for (const field of fields) {
    const requiredAttr = field.optional ? "" : " required";
    const defaultAttr = field.default
      ? ` default="${escapeAttribute(field.default)}"`
      : "";

    if (
      linkedTypeNames &&
      field.type &&
      !PRIMITIVE_TYPES.includes(field.type)
    ) {
      const simpleTypeName = field.type.replace(/[<>\[\]]/g, "").trim();
      if (simpleTypeName && !PRIMITIVE_TYPES.includes(simpleTypeName)) {
        linkedTypeNames.add(simpleTypeName);
        if (writeLinkedTypesFile) {
          writeLinkedTypesFile();
        }
      }
    }

    output += `<ResponseField name="${escapeAttribute(
      field.name
    )}" type="${escapeAttribute(field.type)}"${defaultAttr}${requiredAttr}>\n`;

    if (field.description) {
      output += `\n${field.description}\n`;
    }

    if (field.nested && field.nested.length > 0) {
      output += `\n<Accordion title="Properties">\n\n`;
      output += renderNestedResponseFields(
        field.nested,
        linkedTypeNames,
        writeLinkedTypesFile
      );
      output += "</Accordion>\n";
    }

    output += "\n</ResponseField>\n\n";
  }

  return output;
}

function getSimpleTypeName(typeName) {
  if (!typeName) {
    return null;
  }

  // Remove generic arguments if they are still present (e.g., Promise<Base44Client>)
  const withoutGenerics = typeName.split("<")[0].trim();

  // Type names can include dots for namespaces, so allow those
  const match = withoutGenerics.match(/^[A-Za-z0-9_.]+$/);
  return match ? match[0] : null;
}
