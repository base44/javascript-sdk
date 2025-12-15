export const isNode = typeof window === "undefined";
export const isBrowser = !isNode;
export const isInIFrame = isBrowser && window.self !== window.top;
