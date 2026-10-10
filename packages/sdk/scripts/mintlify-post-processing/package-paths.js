import fs from "fs";
import path from "path";

const SDK_DIR = path.join(import.meta.dirname, "..", "..");

/**
 * Where the pipeline reads and writes for one package. Defaults to @base44/sdk; pass
 * `--package-dir <dir>` to document another package, whose config files live under
 * `<dir>/scripts/mintlify-post-processing/` like this package's.
 */
export function packagePaths(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--package-dir");
  const packageDir = index === -1 ? SDK_DIR : path.resolve(argv[index + 1]);
  const configDir = path.join(packageDir, "scripts", "mintlify-post-processing");
  const targetFile = path.join(configDir, "mintlify-target.json");
  // Where the reference lands in mintlify-docs. `group` creates the nav group when it is missing.
  const target = {
    path: "developers/references/sdk/docs",
    dropdown: "SDK",
    ...(fs.existsSync(targetFile) ? JSON.parse(fs.readFileSync(targetFile, "utf8")) : {}),
  };
  return { packageDir, docsDir: path.join(packageDir, "docs"), configDir, target };
}
