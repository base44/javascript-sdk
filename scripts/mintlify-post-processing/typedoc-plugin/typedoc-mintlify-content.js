/**
 * Content transformation functions (examples, frontmatter, etc.)
 */

/**
 * Convert code examples to Mintlify CodeGroup
 */
export function convertExamplesToCodeGroup(content) {
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
      // TODO: Review - Is this what we want for unnamed examples?
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
export function addMintlifyFrontmatter(content, page) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  let title = titleMatch ? titleMatch[1].trim() : '';
  
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

