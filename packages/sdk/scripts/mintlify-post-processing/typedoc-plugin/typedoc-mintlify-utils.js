/**
 * Utility functions for TypeDoc Mintlify plugin
 */

/**
 * Escape special characters for use in HTML attributes
 */
export function escapeAttribute(value) {
  return String(value).replace(/"/g, '&quot;');
}


