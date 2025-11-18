/**
 * Linked type extraction and property parsing functions
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Extract properties from a linked type's markdown file
 */
export function extractPropertiesFromLinkedType(linkedTypeInfo, context) {
  if (!linkedTypeInfo || !context) {
    return [];
  }

  const { typePath, typeName } = linkedTypeInfo;
  const { currentPagePath, app } = context;

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
      filePath = path.resolve(currentDir, cleanTypePath);
      if (!filePath.endsWith('.md') && !filePath.endsWith('.mdx')) {
        filePath += '.md';
      }
    } else if (cleanTypePath.includes('/')) {
      // Path with directory separator
      filePath = path.join(outputDir, cleanTypePath);
      if (!filePath.endsWith('.md') && !filePath.endsWith('.mdx')) {
        filePath += '.md';
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
      console.warn(`Could not find linked type file: ${filePath} (from typePath: ${typePath})`);
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return parsePropertiesFromTypeFile(content);
  } catch (error) {
    console.warn(`Error reading linked type file ${typePath}:`, error.message);
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

