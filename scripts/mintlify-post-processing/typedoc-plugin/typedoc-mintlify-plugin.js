/**
 * TypeDoc plugin for Mintlify MDX output
 * Hooks into TypeDoc's markdown renderer to customize output for Mintlify
 */

import { MarkdownPageEvent } from 'typedoc-plugin-markdown';
import { ReflectionKind } from 'typedoc';
import * as fs from 'fs';
import * as path from 'path';
import { convertFunctionParameters, convertInterfaceMethodParameters, convertClassMethodParameters } from './typedoc-mintlify-parameters.js';
import { convertFunctionReturns, convertInterfaceMethodReturns, convertClassMethodReturns } from './typedoc-mintlify-returns.js';

/**
 * Plugin load function called by TypeDoc
 */
// Track interfaces that are linked types and should be suppressed
const linkedTypeNames = new Set();

/**
 * Load function called by TypeDoc
 */
export function load(app) {
  console.log('Loading Mintlify TypeDoc plugin...');
  
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    if (!page.contents) return;
    
    let content = page.contents;
    
    // Determine what kind of page this is.
    const isFunction = page.model?.kind === ReflectionKind.Function;
    const isClass = page.model?.kind === ReflectionKind.Class;
    const isInterface = page.model?.kind === ReflectionKind.Interface;
    
    
    // 1. Remove breadcrumbs navigation
    content = content.replace(/^\[.*?\]\(.*?\)\s*\n+/m, '');
    
    // 2. Convert parameters to ParamField components and returns to ResponseField components
    // Functions: ## Parameters/Returns with ### field names
    // Interface methods: #### Parameters/Returns with ##### field names
    // Class methods: #### Parameters/Returns with ##### field names
    if (isFunction) {
      content = convertFunctionParameters(content);
      content = convertFunctionReturns(content, app, page);
    } else if (isInterface) {
      content = convertInterfaceMethodParameters(content);
      content = convertInterfaceMethodReturns(content, app, page, linkedTypeNames, writeLinkedTypesFile);
    } else if (isClass) {
      content = convertClassMethodParameters(content);
      content = convertClassMethodReturns(content, app, page, linkedTypeNames, writeLinkedTypesFile);
    }
    
    // 3. Convert code examples to CodeGroup
    content = convertExamplesToCodeGroup(content);
    
    // 4. Remove links from function signatures (convert [`TypeName`](link) to `TypeName`)
    content = content.replace(/\[`([^`]+)`\]\([^)]+\)/g, '`$1`');
    
    // 5. Remove .md and .mdx extensions from links
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\.mdx?\)/g, '[$1]($2)');
    
    // 6. Add frontmatter
    content = addMintlifyFrontmatter(content, page);
    
    page.contents = content;
  });
}

/**
 * Write linked types file
 */
function writeLinkedTypesFile(app) {
  const outputDir = app.options.getValue('out') || 'docs';
  const linkedTypesFile = path.join(outputDir, '.linked-types.json');
  try {
    fs.writeFileSync(linkedTypesFile, JSON.stringify(Array.from(linkedTypeNames)), 'utf-8');
  } catch (e) {
    // Ignore errors writing the file
  }
}

/**
 * Convert code examples to Mintlify CodeGroup
 */
function convertExamplesToCodeGroup(content) {
  // Match all consecutive example sections as one group
  const exampleSectionRegex = /####\s+(Example|Examples)\s*\n\n([\s\S]*?)(?=\n###\s|\n####\s(?!#)|\n\*\*\*\n\n###|\n\*\*\*$|$)/g;
  
  return content.replace(exampleSectionRegex, (match, exampleHeading, exampleContent) => {
    const codeBlockRegex = /(?:^|\n)(.*?)\n*```(\w+)\n([\s\S]*?)```/g;
    const examples = [];
    let codeMatch;
    
    while ((codeMatch = codeBlockRegex.exec(exampleContent)) !== null) {
      const descText = codeMatch[1].trim();
      const language = codeMatch[2];
      const code = codeMatch[3].trimEnd();
      
      let title;
      if (descText && descText.length > 0 && descText.length < 100 && !descText.includes('\n')) {
        title = descText.replace(/^[•\-*]\s*/, '').trim();
      } else {
        title = examples.length === 0 ? 'Example' : `Example ${examples.length + 1}`;
      }
      
      examples.push({
        title: title,
        language: language,
        code: code
      });
    }
    
    if (examples.length === 0) {
      return match;
    }
    
    let codeGroup = '<CodeGroup>\n\n';
    
    for (const example of examples) {
      codeGroup += '```' + example.language + ' ' + example.title + '\n';
      codeGroup += example.code + '\n';
      codeGroup += '```\n\n';
    }
    
    codeGroup += '</CodeGroup>\n';
    
    return codeGroup;
  });
}

/**
 * Add Mintlify frontmatter to the page
 */
function addMintlifyFrontmatter(content, page) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  let title = titleMatch ? titleMatch[1].trim() : page.model?.name || 'Documentation';
  
  // Clean up title
  title = title.replace(/\*\*/g, '').replace(/`/g, '').trim();
  title = title.replace(/^(?:Interface|Class|Type|Module|Function|Variable|Constant|Enum):\s*/i, '').trim();
  
  const escapeYaml = (str) => {
    if (str.includes(':') || str.includes('"') || str.includes("'") || str.includes('\n')) {
      return str.replace(/"/g, '\\"');
    }
    return str;
  };
  
  const frontmatter = `---
title: "${escapeYaml(title)}"
---

`;
  
  // Remove the original h1 title (it's now in frontmatter)
  let processedContent = content.replace(/^#\s+.+\n\n?/, '');
  
  return frontmatter + processedContent;
}

