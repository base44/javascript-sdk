/**
 * Linked type extraction and property parsing functions
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReflectionKind } from 'typedoc';

/**
 * Extract properties from a linked type using TypeDoc's reflection API
 */
export function extractPropertiesFromLinkedType(linkedTypeInfo, context) {
  if (!linkedTypeInfo || !context) {
    return [];
  }

  const { typeName } = linkedTypeInfo;
  const { app, page } = context;

  try {
    // First, try to get the type from TypeDoc's reflection API
    if (app && page && page.model) {
      const properties = extractPropertiesFromReflection(typeName, app, page);
      if (properties.length > 0) {
        return properties;
      }
    }

    // Fallback: try to read from generated markdown file
    return extractPropertiesFromMarkdownFile(linkedTypeInfo, context);
  } catch (error) {
    console.warn(`Error extracting properties for type ${typeName}:`, error.message);
    return [];
  }
}

/**
 * Extract properties from TypeDoc's reflection API (preferred method)
 */
function extractPropertiesFromReflection(typeName, app, page) {
  try {
    // Access the project through the page's model
    const project = page.model?.project;
    if (!project) {
      return [];
    }

    // Find the type reflection in the project
    const typeReflection = findReflectionByName(project, typeName);
    if (!typeReflection) {
      return [];
    }

    // Extract properties from the reflection
    const properties = [];

    // For interfaces and type aliases with properties
    if (typeReflection.children) {
      for (const child of typeReflection.children) {
        if (child.kind === ReflectionKind.Property) {
          const property = {
            name: child.name,
            type: getTypeString(child.type),
            description: child.comment?.summary?.map(p => p.text).join('') || '',
            optional: isOptional(child),
            nested: []
          };

          // Check for nested properties if the type is an object
          if (child.type && isObjectLikeType(child.type)) {
            property.nested = extractNestedProperties(child.type);
          }

          properties.push(property);
        }
      }
    }

    return properties;
  } catch (error) {
    console.warn(`Error extracting properties from reflection for ${typeName}:`, error.message);
    return [];
  }
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
  if (!type) return 'any';

  switch (type.type) {
    case 'intrinsic':
      return type.name;
    case 'reference':
      return type.name;
    case 'array':
      return `${getTypeString(type.elementType)}[]`;
    case 'union':
      return type.types?.map(t => getTypeString(t)).join(' | ') || 'any';
    case 'intersection':
      return type.types?.map(t => getTypeString(t)).join(' & ') || 'any';
    case 'literal':
      return JSON.stringify(type.value);
    case 'reflection':
      return 'object';
    default:
      return type.name || 'any';
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
  return type.type === 'reflection' && type.declaration?.children;
}

/**
 * Extract nested properties from an object type
 */
function extractNestedProperties(type) {
  if (!isObjectLikeType(type)) {
    return [];
  }

  const nested = [];
  if (type.declaration?.children) {
    for (const child of type.declaration.children) {
      if (child.kind === ReflectionKind.Property) {
        nested.push({
          name: child.name,
          type: getTypeString(child.type),
          description: child.comment?.summary?.map(p => p.text).join('') || '',
          optional: isOptional(child)
        });
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
    return [];
  }

  try {
    // Get the output directory from TypeDoc (usually 'docs')
    const outputDir = app.options.getValue('out') || 'docs';
    
    // Convert relative link to file path
    // Links can be:
    // - Just the type name: "LoginViaEmailPasswordResponse"
    // - Relative path: "../interfaces/LoginViaEmailPasswordResponse" or "./interfaces/LoginViaEmailPasswordResponse"
    // - Absolute-looking: "interfaces/LoginViaEmailPasswordResponse"
    let filePath;
    
    // Remove .md or .mdx extension if present
    let cleanTypePath = typePath.replace(/\.(md|mdx)$/, '');
    
    if (cleanTypePath.startsWith('../') || cleanTypePath.startsWith('./')) {
      // Relative path - resolve from current page's directory
      const currentDir = path.dirname(path.join(outputDir, currentPagePath || ''));
      const basePath = path.resolve(currentDir, cleanTypePath);
      
      // Try .mdx first, then .md
      if (!basePath.endsWith('.md') && !basePath.endsWith('.mdx')) {
        const mdxPath = basePath + '.mdx';
        const mdPath = basePath + '.md';
        filePath = fs.existsSync(mdxPath) ? mdxPath : mdPath;
      } else {
        filePath = basePath;
      }
    } else if (cleanTypePath.includes('/')) {
      // Path with directory separator
      filePath = path.join(outputDir, cleanTypePath);
      
      // Try .mdx first, then .md
      if (!filePath.endsWith('.md') && !filePath.endsWith('.mdx')) {
        const mdxPath = filePath + '.mdx';
        const mdPath = filePath + '.md';
        filePath = fs.existsSync(mdxPath) ? mdxPath : mdPath;
      }
    } else {
      // Just the type name - try interfaces/ first, then type-aliases/
      // Try .mdx first, then .md
      filePath = path.join(outputDir, 'interfaces', cleanTypePath + '.mdx');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(outputDir, 'interfaces', cleanTypePath + '.md');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(outputDir, 'type-aliases', cleanTypePath + '.mdx');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(outputDir, 'type-aliases', cleanTypePath + '.md');
      }
    }

    // Normalize the path
    filePath = path.normalize(filePath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Don't warn during generation - the file might not exist yet
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return parsePropertiesFromTypeFile(content);
  } catch (error) {
    // Silent failure during generation
    return [];
  }
}

/**
 * Parse properties from a type file's markdown content
 */
function parsePropertiesFromTypeFile(content) {
  const properties = [];
  const lines = content.split('\n');
  
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
    
    // Stop at next top-level heading (##)
    if (inPropertiesSection && line.match(/^##\s+/) && !line.match(/^##\s+Properties\s*$/)) {
      break;
    }
    
    // Parse property: ### propertyName or ### propertyName?
    if (inPropertiesSection && line.match(/^###\s+/)) {
      const propMatch = line.match(/^###\s+(.+)$/);
      if (propMatch) {
        const rawName = propMatch[1].trim();
        const optional = rawName.endsWith('?');
        // Unescape markdown escapes (e.g., access\_token -> access_token)
        let name = optional ? rawName.slice(0, -1).trim() : rawName.trim();
        name = name.replace(/\\_/g, '_').replace(/\\\*/g, '*').replace(/\\`/g, '`');
        
        i++;
        // Skip blank lines
        while (i < lines.length && lines[i].trim() === '') {
          i++;
        }
        
        // Get type from next line: > **name**: `type` or > `optional` **name**: `type`
        let type = 'any';
        if (i < lines.length && lines[i].includes('`')) {
          const typeMatch = lines[i].match(/`([^`]+)`/);
          if (typeMatch) {
            type = typeMatch[1].trim();
          }
          i++;
        }
        
        // Skip blank lines
        while (i < lines.length && lines[i].trim() === '') {
          i++;
        }
        
        // Collect description and nested properties
        const descriptionLines = [];
        const nested = [];
        
        // Look for nested properties (#### heading)
        while (i < lines.length) {
          const nextLine = lines[i];
          // Stop at next property (###) or section end (## or ***)
          if (nextLine.match(/^###\s+/) || nextLine.match(/^##\s+/) || nextLine === '***') {
            break;
          }
          
          // Check for nested property (####)
          if (nextLine.match(/^####\s+/)) {
            const nestedMatch = nextLine.match(/^####\s+(.+)$/);
            if (nestedMatch) {
              const nestedRawName = nestedMatch[1].trim();
              const nestedOptional = nestedRawName.endsWith('?');
              // Unescape markdown escapes
              let nestedName = nestedOptional ? nestedRawName.slice(0, -1).trim() : nestedRawName.trim();
              nestedName = nestedName.replace(/\\_/g, '_').replace(/\\\*/g, '*').replace(/\\`/g, '`');
              
              i++;
              while (i < lines.length && lines[i].trim() === '') {
                i++;
              }
              
              let nestedType = 'any';
              if (i < lines.length && lines[i].includes('`')) {
                const nestedTypeMatch = lines[i].match(/`([^`]+)`/);
                if (nestedTypeMatch) {
                  nestedType = nestedTypeMatch[1].trim();
                }
                i++;
              }
              
              while (i < lines.length && lines[i].trim() === '') {
                i++;
              }
              
              const nestedDescLines = [];
              while (i < lines.length && !lines[i].match(/^####\s+/) && !lines[i].match(/^###\s+/) && 
                     !lines[i].match(/^##\s+/) && lines[i] !== '***') {
                nestedDescLines.push(lines[i]);
                i++;
              }
              
              nested.push({
                name: nestedName,
                type: nestedType,
                description: nestedDescLines.join('\n').trim(),
                optional: nestedOptional
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
          description: descriptionLines.join('\n').trim(),
          optional,
          nested
        });
        continue;
      }
    }
    
    i++;
  }
  
  return properties;
}

