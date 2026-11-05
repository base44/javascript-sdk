/**
 * Reads the commit the app's frontend bundle was built from.
 *
 * Base44's publish pipeline sets `VITE_BASE44_BUILD_COMMIT` for the build, and
 * Vite replaces the expression below with that literal string when it bundles
 * this file out of `node_modules`, in `vite build` and in the dev server's
 * prebundled deps alike. The expression must stay spelled out exactly like
 * this: Vite matches it statically, and any indirection leaves a runtime lookup
 * that is always undefined.
 *
 * A bundler that isn't Vite leaves `import.meta.env` undefined, so the lookup
 * throws, and that means "no build commit".
 *
 * Only reached as `#build-commit-source` under the `module` condition; see
 * `build-commit-source.fallback.ts`.
 *
 * @internal
 */
export function readBuildCommitSource(): unknown {
  try {
    return import.meta.env.VITE_BASE44_BUILD_COMMIT;
  } catch {
    return undefined;
  }
}
