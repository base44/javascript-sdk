import { isNode, isReactNative } from "./common.js";
import { readBuildCommitSource } from "#build-commit-source";

/** Header the backend reads to tell which frontend build sent a request. */
export const BUILD_COMMIT_HEADER = "X-Base44-Build";

// The backend accepts exactly this shape and ignores anything else, so a value
// that doesn't match is never sent.
const BUILD_COMMIT_PATTERN = /^[a-f0-9]{40}$/;

/**
 * The build-commit header to send from this client, if any.
 *
 * Only a browser sends it: the value names the browser bundle, so a server
 * (Node, Deno, a backend function) or React Native would report a commit that
 * isn't the one running.
 *
 * @internal
 */
export function getBuildCommitHeaders(): Record<string, string> {
  if (isNode || isReactNative) return {};
  const commit = readBuildCommitSource();
  return typeof commit === "string" && BUILD_COMMIT_PATTERN.test(commit)
    ? { [BUILD_COMMIT_HEADER]: commit }
    : {};
}
