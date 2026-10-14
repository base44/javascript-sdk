/** Validate a platform origin and return it normalized. Used by the server entrypoint. */
export function normalizeServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new TypeError("serverUrl must be an HTTP(S) origin without credentials, path, query or fragment");
  }
  return url.origin;
}
