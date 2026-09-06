/**
 * The module's own version, stamped onto every stored notification row so a
 * support case can tell which code wrote it.
 *
 * Hand-maintained, and deliberately not read from `package.json`: the build is
 * a bare `tsc` that mirrors `src/` into `dist/` and copies no JSON, and the
 * package ships only `dist`. Importing the manifest would break both.
 *
 * Bump this in the same commit as the package version.
 *
 * @internal
 */
export const IAP_MODULE_VERSION = "1.0.0";
