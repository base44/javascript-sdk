export const isNode = typeof window === "undefined";
export const isInIFrame = !isNode && window.self !== window.top;

// React Native defines `window` (so `isNode` is false there) but not `document`.
// Browser-only code paths gated on `window`/`isNode` alone would run — and crash —
// on React Native. Node (no `window`) is already handled by those `window` guards;
// this flags the window-without-a-DOM case that isn't.
export const isReactNative = !isNode && typeof document === "undefined";

export const generateUuid = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};
