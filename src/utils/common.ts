export const isNode = typeof window === "undefined";
export const isInIFrame = !isNode && window.self !== window.top;
