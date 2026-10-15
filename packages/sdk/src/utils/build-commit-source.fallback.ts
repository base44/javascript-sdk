/**
 * What `#build-commit-source` resolves to without the `module` condition: no
 * build commit.
 *
 * The package's `imports` field gives the `import.meta` reader
 * (`build-commit-source.ts`) only to bundlers that match `module`: Vite,
 * webpack and esbuild. Everything else gets this file, so `import.meta` never
 * reaches a runtime or bundler that can't take it. That includes Node, Deno,
 * and Metro on every platform: Hermes rejects `import.meta` outright, and
 * Metro's web build ships a classic script, where it is a SyntaxError.
 *
 * @internal
 */
export function readBuildCommitSource(): unknown {
  return undefined;
}
