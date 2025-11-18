/**
 * Return/Response field conversion functions for TypeDoc Mintlify plugin
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractPropertiesFromLinkedType } from './typedoc-mintlify-linked-types.js';
import { escapeAttribute } from './typedoc-mintlify-utils.js';

/**
 * Extract signature information from content lines
 */
/**
 * Try to resolve a type name to a documentation file path
 */
function resolveTypePath(typeName, app, currentPagePath = null) {
  // Skip primitive types
  const primitives = ['any', 'string', 'number', 'boolean', 'void', 'null', 'undefined', 'object', 'Array', 'Promise'];
  if (primitives.includes(typeName)) {
    return null;
  }
  
  const outputDir = app.options.getValue('out') || 'docs';
  
  // Try interfaces/ first, then type-aliases/
  let filePath = path.join(outputDir, 'interfaces', typeName + '.mdx');
  if (!fs.existsSync(filePath)) {
    filePath = path.join(outputDir, 'interfaces', typeName + '.md');
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(outputDir, 'type-aliases', typeName + '.mdx');
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(outputDir, 'type-aliases', typeName + '.md');
  }
  
  if (fs.existsSync(filePath)) {
    // Convert to relative path from current page if possible
    if (currentPagePath) {
      const currentDir = path.dirname(path.join(outputDir, currentPagePath));
      const relativePath = path.relative(currentDir, filePath).replace(/\\/g, '/');
      return relativePath.startsWith('.') ? relativePath : './' + relativePath;
    }
    // Otherwise return path relative to outputDir
    return path.relative(outputDir, filePath).replace(/\\/g, '/');
  }
  
  return null;
}

export function extractSignatureInfo(lines, linkedTypeNames, writeLinkedTypesFile, app, currentPagePath = null) {
  const signatureMap = new Map();
  const linkedTypeMap = new Map();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match function signature: > **methodName**(...): `returnType` or `returnType`\<`generic`\>
    // Handle both simple types and generic types like `Promise`\<`any`\> or `Promise`\<[`TypeName`](link)\>
    const sigMatch = line.match(/^>\s*\*\*(\w+)\*\*\([^)]*\):\s*`([^`]+)`(?:\\<(.+?)\\>)?/);
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
          linkedTypeMap.set(i, { typeName: linkedTypeName, typePath: linkedTypePath });
          // Track this type name so we can suppress its documentation page
          linkedTypeNames.add(linkedTypeName);
          // Write the file immediately so post-processing script can use it
          writeLinkedTypesFile(app);
        } else {
          // Simple generic type without link - try to resolve it
          const simpleGeneric = genericParam.replace(/`/g, '').trim();
          returnType = `${returnType}<${simpleGeneric}>`;
          
          // Try to resolve the type to a documentation file
          const typePath = resolveTypePath(simpleGeneric, app, currentPagePath);
          if (typePath) {
            linkedTypeMap.set(i, { typeName: simpleGeneric, typePath: typePath });
            linkedTypeNames.add(simpleGeneric);
            writeLinkedTypesFile(app);
          }
        }
      }
      // Store the return type with the signature line index as the key
      signatureMap.set(i, returnType);
    }
  }
  
  return { signatureMap, linkedTypeMap };
}

/**
 * Convert function returns
 */
export function convertFunctionReturns(content, app, page) {
  return rewriteReturnSections(content, {
    heading: '## Returns',
    fieldHeading: '###',
    nestedHeading: '####',
    stopOnLevel3: false,
    app,
    page,
  });
}

/**
 * Convert interface method returns
 */
export function convertInterfaceMethodReturns(content, app, page, linkedTypeNames, writeLinkedTypesFile) {
  const lines = content.split('\n');
  const { signatureMap, linkedTypeMap } = extractSignatureInfo(lines, linkedTypeNames, writeLinkedTypesFile, app, page?.url);
  
  return rewriteReturnSections(content, {
    heading: '#### Returns',
    fieldHeading: '#####',
    nestedHeading: '######',
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
export function convertClassMethodReturns(content, app, page, linkedTypeNames, writeLinkedTypesFile) {
  const lines = content.split('\n');
  const { signatureMap, linkedTypeMap } = extractSignatureInfo(lines, linkedTypeNames, writeLinkedTypesFile, app, page?.url);
  
  return rewriteReturnSections(content, {
    heading: '#### Returns',
    fieldHeading: '#####',
    nestedHeading: '######',
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
    page
  } = options;
  const lines = content.split('\n');
  const result = [];
  let i = 0;

  const isTerminatorLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('#### Example') || trimmed === '***') {
      return true;
    }
    if (heading !== '## Returns' && trimmed.startsWith('## ')) {
      return true;
    }
    // For function Returns, stop at nested method definitions (#### methodName())
    if (heading === '## Returns' && trimmed.match(/^####\s+\w+\.?\w*\(\)/)) {
      return true;
    }
    if (stopOnLevel3 && trimmed.startsWith('### ')) {
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
      const sectionContent = sectionLines.join('\n').trim();

      // For function Returns sections, parse nested fields (### headings)
      if (heading === '## Returns') {
        const { fields, leadingText } = parseReturnFields(sectionContent, fieldHeading, nestedHeading, null, null, null);
        if (fields.length === 0) {
          result.push(...sectionLines);
        } else {
          if (leadingText) {
            result.push('');
            result.push(leadingText);
          }
          const fieldsBlock = buildResponseFieldsSection(fields).trimEnd();
          if (fieldsBlock) {
            result.push('');
            result.push(fieldsBlock);
            result.push('');
          }
        }
        continue;
      }

      // For interface/class method Returns sections
      // The Returns section starts at i-1 (after the heading line)
      // Look backwards to find the function signature
      let sigLineIdx = i - 2; // Go back past the Returns heading
      while (sigLineIdx >= 0 && !lines[sigLineIdx].match(/^>\s*\*\*\w+\*\*\(/)) {
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
      
      const returnTypeFromSignature = sigLineIdx >= 0 ? signatureMap.get(sigLineIdx) : null;
      const linkedTypeInfo = sigLineIdx >= 0 ? linkedTypeMap.get(sigLineIdx) : null;
      const { fields, leadingText } = parseReturnFields(
        sectionContent, 
        fieldHeading, 
        nestedHeading, 
        returnTypeFromSignature,
        linkedTypeInfo,
        { app, page, currentPagePath: page.url }
      );
      if (fields.length === 0) {
        result.push(...sectionLines);
      } else {
        if (leadingText) {
          result.push('');
          result.push(leadingText);
        }
        const fieldsBlock = buildResponseFieldsSection(fields).trimEnd();
        if (fieldsBlock) {
          result.push('');
          result.push(fieldsBlock);
          result.push('');
        }
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

function parseReturnFields(sectionContent, fieldHeading, nestedHeading, returnTypeFromSignature = null, linkedTypeInfo = null, context = null) {
  if (!sectionContent) {
    // If we have a linked type but no section content, try to extract from the linked type
    if (linkedTypeInfo && context) {
      const properties = extractPropertiesFromLinkedType(linkedTypeInfo, context);
      if (properties.length > 0) {
        // Return separate ResponseFields for each property (skip the default "result" field)
        const resultFields = [];
        
        // Add a separate ResponseField for each property
        for (const prop of properties) {
          resultFields.push({
            name: prop.name,
            type: prop.type,
            description: prop.description,
            optional: prop.optional,
            nested: prop.nested || []
          });
        }
        
        return {
          fields: resultFields,
          leadingText: ''
        };
      }
    }
    return { fields: [], leadingText: '' };
  }

  const lines = sectionContent.split('\n');
  const fields = [];
  const headingPrefix = fieldHeading ? `${fieldHeading} ` : null;
  const nestedPrefix = nestedHeading ? `${nestedHeading} ` : null;

  const extractTypeFromLine = (line) => {
    if (!line) return null;
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('>')) {
      // Handle lines like: > **entities**: `object` or > **auth**: [`AuthMethods`](../interfaces/AuthMethods)
      const blockMatch = trimmed.match(/^>\s*\*\*([^*]+)\*\*:\s*(.+)$/);
      if (blockMatch) {
        const typePart = blockMatch[2].replace(/`/g, '').trim();
        // Check if it's a markdown link: [TypeName](link)
        const linkMatch = typePart.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          return { type: linkMatch[1], link: linkMatch[2] };
        }
        return { type: typePart, link: null };
      }
    }
    if (trimmed.includes('`')) {
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

  const isHeadingLine = (line) => headingPrefix && line.startsWith(headingPrefix);
  const isNestedHeadingLine = (line) => nestedPrefix && line.startsWith(nestedPrefix);

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
    let type = returnTypeFromSignature || 'any';
    let typeLink = null;
    const descriptionLines = [];
    
    // Check if there's an existing ResponseField in the content
    const responseFieldMatch = sectionContent.match(/<ResponseField[^>]*type="([^"]+)"[^>]*>/);
    if (responseFieldMatch) {
      // Extract type from existing ResponseField
      const existingType = responseFieldMatch[1];
      if (existingType && existingType !== 'any') {
        type = existingType;
      }
    }
    
    for (const line of lines) {
      // Skip ResponseField tags - we'll replace them
      if (line.trim().startsWith('<ResponseField') || line.trim() === '</ResponseField>') {
        continue;
      }
      const maybeType = extractTypeFromLine(line);
      if (maybeType && type === 'any') {
        if (typeof maybeType === 'object') {
          type = maybeType.type;
          typeLink = maybeType.link;
        } else {
          type = maybeType;
        }
        continue;
      }
      if (line.trim() && !line.trim().startsWith('`') && !line.trim().startsWith('<')) {
        descriptionLines.push(line);
      }
    }
    let description = descriptionLines.join('\n').trim();
    
    // Check if we have a linked type to inline
    if (linkedTypeInfo && context) {
      const properties = extractPropertiesFromLinkedType(linkedTypeInfo, context);
      if (properties.length > 0) {
        // Return separate ResponseFields for each property (skip the default "result" field)
        const resultFields = [];
        
        // Add a separate ResponseField for each property
        for (const prop of properties) {
          resultFields.push({
            name: prop.name,
            type: prop.type,
            description: prop.description,
            optional: prop.optional,
            nested: prop.nested || []
          });
        }
        
        return {
          fields: resultFields,
          leadingText: '',
        };
      }
    }
    
    // Add "See [TypeName](link)" to description if there's a type link
    if (typeLink) {
      if (description) {
        description += '\n\nSee [' + type + '](' + typeLink + ')';
      } else {
        description = 'See [' + type + '](' + typeLink + ')';
      }
    }
    // Use 'result' as default name, or extract from description
    let name = 'result';
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
      leadingText: '',
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
    const optional = rawName.endsWith('?');
    const name = optional ? rawName.slice(0, -1).trim() : rawName.trim();
    index++;

    while (index < lines.length && lines[index].trim() === '') {
      index++;
    }

    let type = 'any';
    let typeLink = null;
    if (index < lines.length) {
      const maybeType = extractTypeFromLine(lines[index]);
      if (maybeType) {
        if (typeof maybeType === 'object') {
          type = maybeType.type;
          typeLink = maybeType.link;
        } else {
          type = maybeType;
        }
        index++;
      }
    }

    while (index < lines.length && lines[index].trim() === '') {
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
      const nestedOptional = nestedRawName.endsWith('?');
      const nestedName = nestedOptional ? nestedRawName.slice(0, -1).trim() : nestedRawName.trim();
      index++;

      while (index < lines.length && lines[index].trim() === '') {
        index++;
      }

      let nestedType = 'any';
      let nestedTypeLink = null;
      if (index < lines.length) {
        const maybeNestedType = extractTypeFromLine(lines[index]);
        if (maybeNestedType) {
          if (typeof maybeNestedType === 'object') {
            nestedType = maybeNestedType.type;
            nestedTypeLink = maybeNestedType.link;
          } else {
            nestedType = maybeNestedType;
          }
          index++;
        }
      }

      while (index < lines.length && lines[index].trim() === '') {
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

      // Add "See [TypeName](link)" to nested description if there's a type link
      let nestedDescription = nestedDescLines.join('\n').trim();
      if (nestedTypeLink) {
        if (nestedDescription) {
          nestedDescription += '\n\nSee [' + nestedType + '](' + nestedTypeLink + ')';
        } else {
          nestedDescription = 'See [' + nestedType + '](' + nestedTypeLink + ')';
        }
      }

      nested.push({
        name: nestedName,
        type: nestedType,
        description: nestedDescription,
        optional: nestedOptional,
      });
    }

    // Add "See [TypeName](link)" to description if there's a type link
    let description = descriptionLines.join('\n').trim();
    if (typeLink) {
      if (description) {
        description += '\n\nSee [' + type + '](' + typeLink + ')';
      } else {
        description = 'See [' + type + '](' + typeLink + ')';
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

  return { fields, leadingText: leadingLines.join('\n').trim() };
}

function buildResponseFieldsSection(fields) {
  let output = '';

  for (const field of fields) {
    const requiredAttr = field.optional ? '' : ' required';
    const defaultAttr = field.default ? ` default="${escapeAttribute(field.default)}"` : '';
    output += `<ResponseField name="${escapeAttribute(field.name)}" type="${escapeAttribute(field.type)}"${defaultAttr}${requiredAttr}>\n`;

    if (field.description) {
      output += `\n${field.description}\n`;
    }

    if (field.nested && field.nested.length > 0) {
      output += '\n';
      for (const nested of field.nested) {
        const optionalLabel = nested.optional ? ' *(optional)*' : '';
        output += `- **${nested.name}**${optionalLabel}: \`${nested.type}\``;
        if (nested.description) {
          output += ` - ${nested.description}`;
        }
        output += '\n';
      }
    }

    output += '\n</ResponseField>\n\n';
  }

  return output;
}

