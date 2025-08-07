/**
 * Utility to handle circular JSON references in Jest
 * 
 * This module provides a safe JSON.stringify replacement that can handle circular references
 */

// Store original JSON.stringify
const originalStringify = JSON.stringify;

/**
 * A replacement for JSON.stringify that handles circular references
 */
function safeStringify(obj: any, replacer?: ((key: string, value: any) => any) | Array<string | number> | null, space?: string | number): string {
  try {
    // First try normal stringify
    return originalStringify(obj, replacer as any, space);
  } catch (err: any) {
    if (err.message && err.message.includes('circular')) {
      // We have a circular reference, use a replacer that handles circular refs
      const seen = new WeakSet();
      return originalStringify(obj, (key, value) => {
        // Skip undefined values
        if (value === undefined) return undefined;
        
        // If value is an object and not null 
        if (typeof value === 'object' && value !== null) {
          // Check if we've seen this object before
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          // Add object to our set of seen objects
          seen.add(value);
        }
        
        // Use original replacer if provided
        if (typeof replacer === 'function') {
          return replacer(key, value);
        }
        
        return value;
      }, space);
    }
    
    // If it failed for some other reason, just return a placeholder
    return `"[Cannot stringify: ${err.message}]"`;
  }
}

// Patch JSON.stringify globally
JSON.stringify = safeStringify;

export { safeStringify };