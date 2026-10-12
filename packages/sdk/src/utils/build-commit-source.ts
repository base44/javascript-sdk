/**
 * Where the SDK gets the app's build commit outside a browser bundle: nowhere.
 *
 * The package's `browser` field swaps this file for `build-commit-source.browser.js`,
 * which reads the value Vite bakes in. Everything else — Node, Deno, SSR builds,
 * and React Native, whose `react-native` field maps this file back to itself —
 * gets this one, so `import.meta` never reaches a runtime or bundler that can't
 * parse it (Hermes rejects it outright).
 *
 * @internal
 */
export function readBuildCommitSource(): unknown {
  return undefined;
}
