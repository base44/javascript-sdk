export const isNode = typeof window === "undefined";
export const isInIFrame = !isNode && window.self !== window.top;

export const generateUuid = () => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};
