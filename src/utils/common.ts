export const inNode = typeof window === "undefined";
export const isInIFrame = window !== undefined && window.self !== window.top;
