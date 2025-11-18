/**
 * Parameter conversion functions for TypeDoc Mintlify plugin
 */

import { escapeAttribute } from './typedoc-mintlify-utils.js';

/**
 * Convert top-level function parameters (## Parameters with ### param names)
 */
export function convertFunctionParameters(content) {
  // Split content by ## headings to isolate the Parameters section
  const sections = content.split(/\n(?=##\s+\w)/);
  
  return sections.map(section => {
    // Only process ## Parameters sections (must start with exactly ##, not ###)
    if (!section.match(/^##\s+Parameters\s*$/m)) {
      return section;
    }
    
    // Extract the content after "## Parameters"
    const lines = section.split('\n');
    const paramStartIdx = lines.findIndex(l => l.match(/^##\s+Parameters\s*$/));
    
    if (paramStartIdx === -1) return section;
    
    // Get everything after "## Parameters" line
    const paramLines = lines.slice(paramStartIdx + 1);
    const paramContent = paramLines.join('\n');
    
    // Parse parameters
    const params = parseParameters(paramContent, '###', '####');
    
    if (params.length === 0) return section;
    
    // Rebuild section with ParamFields
    const beforeParams = lines.slice(0, paramStartIdx + 1).join('\n');
    return beforeParams + '\n\n' + buildParamFieldsSection(params);
  }).join('\n');
}

/**
 * Convert interface method parameters (#### Parameters with ##### param names)
 */
export function convertInterfaceMethodParameters(content) {
  return rewriteParameterSections(content, '#### Parameters', '#####', '######');
}

/**
 * Convert class method parameters (#### Parameters with ##### param names)
 */
export function convertClassMethodParameters(content) {
  return rewriteParameterSections(content, '#### Parameters', '#####', '######');
}

function rewriteParameterSections(content, sectionHeading, paramLevel, nestedLevel) {
  const lines = content.split('\n');
  const result = [];
  let i = 0;

  const isTerminatorLine = (line) => {
    return (
      line.startsWith('#### Returns') ||
      line.startsWith('#### Example') ||
      line === '***' ||
      line.startsWith('### ') ||
      line.startsWith('## ')
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
      const sectionContent = sectionContentLines.join('\n').trim();
      const params = parseParameters(sectionContent, paramLevel, nestedLevel);
      if (params.length > 0) {
        const block = buildParamFieldsSection(params).trim();
        if (block) {
          result.push('');
          result.push(...block.split('\n'));
          result.push('');
        }
      } else {
        result.push(...sectionContentLines);
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

/**
 * Parse parameters from markdown content
 */
function parseParameters(paramContent, paramLevel, nestedLevel) {
  const lines = paramContent.split('\n');
  const params = [];

  const isParamHeading = (line) => line.startsWith(paramLevel + ' ');
  const isNestedHeading = nestedLevel ? (line) => line.startsWith(nestedLevel + ' ') : () => false;
  const isTerminator = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('#### Returns') || trimmed.startsWith('#### Example') || trimmed === '***') {
      return true;
    }
    const nestedPrefix = nestedLevel ? nestedLevel + ' ' : null;
    if (/^#{1,3}\s+/.test(trimmed)) {
      if (!trimmed.startsWith(paramLevel + ' ') && !(nestedPrefix && trimmed.startsWith(nestedPrefix))) {
        return true;
      }
    }
    return false;
  };

  const extractType = (line) => {
    if (!line) return null;
    const trimmed = line.trim();
    if (!trimmed.startsWith('`')) return null;
    return trimmed.replace(/`/g, '').trim();
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isParamHeading(line)) {
      i++;
      continue;
    }

    let rawName = line.slice(paramLevel.length).trim();
    const optional = rawName.endsWith('?');
    const cleanName = optional ? rawName.slice(0, -1).trim() : rawName.trim();
    i++;

    // Skip blank lines
    while (i < lines.length && lines[i].trim() === '') {
      i++;
    }

    let type = 'any';
    if (i < lines.length) {
      const maybeType = extractType(lines[i]);
      if (maybeType) {
        type = maybeType;
        i++;
      }
    }

    // Skip blank lines after type
    while (i < lines.length && lines[i].trim() === '') {
      i++;
    }

    const descriptionLines = [];
    while (i < lines.length && !isParamHeading(lines[i]) && !isNestedHeading(lines[i]) && !isTerminator(lines[i])) {
      descriptionLines.push(lines[i]);
      i++;
    }

    const nested = [];
    while (i < lines.length && isNestedHeading(lines[i])) {
      let nestedRawName = lines[i].slice(nestedLevel.length).trim();
      const nestedOptional = nestedRawName.endsWith('?');
      const nestedName = nestedOptional ? nestedRawName.slice(0, -1).trim() : nestedRawName.trim();
      i++;

      while (i < lines.length && lines[i].trim() === '') {
        i++;
      }

      let nestedType = 'any';
      if (i < lines.length) {
        const maybeNestedType = extractType(lines[i]);
        if (maybeNestedType) {
          nestedType = maybeNestedType;
          i++;
        }
      }

      while (i < lines.length && lines[i].trim() === '') {
        i++;
      }

      const nestedDescLines = [];
      while (i < lines.length && !isNestedHeading(lines[i]) && !isParamHeading(lines[i]) && !isTerminator(lines[i])) {
        nestedDescLines.push(lines[i]);
        i++;
      }

      nested.push({
        name: nestedName,
        type: nestedType,
        description: nestedDescLines.join('\n').trim(),
        optional: nestedOptional
      });
    }

    params.push({
      name: cleanName,
      type: nested.length > 0 ? 'object' : type,
      description: descriptionLines.join('\n').trim(),
      optional,
      nested
    });
  }

  return params;
}

/**
 * Build ParamField components from parsed parameters
 */
function buildParamFieldsSection(params) {
  let output = '';
  
  for (const param of params) {
    const requiredAttr = param.optional ? '' : ' required';
    output += `<ParamField body="${param.name}" type="${param.type}"${requiredAttr}>\n`;
    
    // Always show description in ParamField if it exists
    if (param.description) {
      output += `\n${param.description}\n`;
    }
    
    output += '\n</ParamField>\n';
    
    // If param has nested fields, wrap them in an Accordion
    if (param.nested.length > 0) {
      // Accordion title is always "Properties"
      output += `\n<Accordion title="Properties">\n\n`;
      
      for (const nested of param.nested) {
        const optionalLabel = nested.optional ? ' *(optional)*' : '';
        output += `- **${nested.name}**${optionalLabel}: \`${nested.type}\``;
        if (nested.description) {
          output += ` - ${nested.description}`;
        }
        output += '\n';
      }
      
      output += '\n</Accordion>\n\n';
    } else {
      output += '\n';
    }
  }
  
  return output;
}

