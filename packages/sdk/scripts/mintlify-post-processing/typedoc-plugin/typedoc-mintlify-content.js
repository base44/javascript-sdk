/**
 * Content transformation functions (examples, frontmatter, etc.)
 */

/**
 * Add headings to CodeGroups that don't have them
 */
export function addHeadingsToCodeGroups(content) {
  const lines = content.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line contains <CodeGroup>
    if (line.trim() === '<CodeGroup>' || line.includes('<CodeGroup>')) {
      // Look back up to 3 lines to see if there's a heading
      let hasHeading = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const prevLine = lines[j].trim();
        if (/^#{2,5}\s+/.test(prevLine)) {
          hasHeading = true;
          break;
        }
      }
      
      // If no heading found, add one
      if (!hasHeading) {
        result.push('## Examples');
        result.push('');
      }
    }
    
    result.push(line);
  }
  
  return result.join('\n');
}

/**
 * Convert code examples to Mintlify CodeGroup
 */
export function convertExamplesToCodeGroup(content) {
  // Match Example/Examples headings from level 2-5 and capture their content until next section.
  // Level 5 shows up for overloaded methods, where each "#### Call Signature" pushes its own
  // "##### Examples" one level deeper than a plain method's "#### Examples".
  const exampleSectionRegex = /^(#{2,5})\s+(Example|Examples)\s*$([\s\S]*?)(?=^#{2,5}\s|\n<\/ResponseField>|\n\*\*\*|$(?!\n))/gm;

  return content.replace(exampleSectionRegex, (match, headingLevel, exampleHeading, exampleContent) => {
    const codeBlockRegex = /```([\w-]*)\s*([^\n]*)\n([\s\S]*?)```/g;
    const examples = [];
    let codeMatch;

    while ((codeMatch = codeBlockRegex.exec(exampleContent)) !== null) {
      const language = codeMatch[1] || 'typescript';
      const titleFromCodeFence = codeMatch[2].trim();
      const code = codeMatch[3].trimEnd();

      let title;
      if (titleFromCodeFence && titleFromCodeFence.length > 0 && titleFromCodeFence.length < 100) {
        // Strip comment markers from title (e.g., "// Basic example" -> "Basic example")
        title = titleFromCodeFence.replace(/^\/\/\s*/, '').replace(/^\/\*\s*|\s*\*\/$/g, '').trim();
      } else {
        title = examples.length === 0 ? 'Example' : `Example ${examples.length + 1}`;
      }

      examples.push({
        title,
        language,
        code,
      });
    }

    if (examples.length === 0) {
      return match;
    }

    // Use the original heading level, default to ## if not specified
    const headingPrefix = headingLevel || '##';
    // Use "Examples" if multiple examples, otherwise "Example"
    const headingText = examples.length > 1 ? 'Examples' : 'Example';
    
    let codeGroup = `${headingPrefix} ${headingText}\n\n<CodeGroup>\n\n`;

    for (const example of examples) {
      codeGroup += '```' + example.language + ' ' + example.title + '\n';
      codeGroup += example.code + '\n';
      codeGroup += '```\n\n';
    }

    // Two newlines, not one: the regex above uses a lookahead so whatever
    // heading/content follows is preserved untouched. Most of the time that
    // content is already cushioned by a blank line, but when an Examples
    // section sits right before the next overload's "#### Call Signature"
    // (only possible for overloaded methods, e.g. list()/filter()), there's
    // nothing else providing that gap — without it, MDX glues a closing JSX
    // tag directly to the next line and the heading after it breaks.
    codeGroup += '</CodeGroup>\n\n';

    return codeGroup;
  });
}

/**
 * Add Mintlify frontmatter to the page
 */
export function addMintlifyFrontmatter(content, page) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  let title = titleMatch ? titleMatch[1].trim() : page?.model?.name || 'Documentation';

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
  const processedContent = content.replace(/^#\s+.+\n\n?/, '');

  return frontmatter + processedContent;
}

