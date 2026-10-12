// Vite statically replaces `import.meta.env.*` when it bundles the SDK; see
// utils/build-commit-source.browser.ts. Elsewhere `import.meta.env` is undefined.
interface ImportMeta {
  readonly env: {
    readonly VITE_BASE44_BUILD_COMMIT?: string;
  };
}
