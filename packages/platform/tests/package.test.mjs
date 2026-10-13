import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const scratch = mkdtempSync(path.join(tmpdir(), "base44-platform-package-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const run = (command, args, cwd = scratch) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
const [packed] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], root));
const installed = path.join(scratch, "node_modules/@base44/platform");
mkdirSync(installed, { recursive: true });
run("tar", ["-xzf", path.join(scratch, packed.filename), "--strip-components=1", "-C", installed]);
const manifest = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"));
// Use the already-installed, lockfile-pinned dependencies; never resolve or install in this fixture.
for (const name of Object.keys(manifest.dependencies)) {
  const destination = path.join(scratch, "node_modules", name);
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(path.dirname(require.resolve(`${name}/package.json`)), destination, "dir");
}

test("the tarball contains the compiled entry point and no source or test trees", () => {
  const files = new Set(packed.files.map(file => file.path));
  for (const file of ["dist/index.js", "dist/index.d.ts", "README.md"]) assert.ok(files.has(file), file);
  assert.equal([...files].some(file => /^(src|tests|examples)\//.test(file)), false);
});

test("the client resolves from the installed package without the runtime SDK", () => {
  assert.equal("@base44/sdk" in { ...manifest.dependencies, ...manifest.peerDependencies }, false);
  run(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { createPlatformClient } from "@base44/platform";
    const client = createPlatformClient({ socketUrl: "https://example.test", getSessionToken: () => "session-token" });
    assert.equal(typeof client.builder.init, "function");
    client.builder.init({ onError() {} }).close();
  `]);
});

const consumer = `
import { createPlatformClient, type PlatformEvent } from "@base44/platform";
const platform = createPlatformClient({ socketUrl: "https://example.test", getSessionToken: async () => "token" });
platform.builder.init({ onError() {} }).subscribe("a".repeat(24), {
  onSnapshot(snapshot) { void snapshot.messages; },
  onEvent(event: PlatformEvent) {
    if (event.type === "message.updated") {
      const text: string | null | undefined = event.data.message.content;
      void text;
    }
  },
  onError() {},
});
// @ts-expect-error No browser API key.
createPlatformClient({ apiKey: "private" });
// @ts-expect-error No write channel.
platform.send("write_file", {});
`;
writeFileSync(path.join(scratch, "consumer.mts"), consumer);
const tsc = require.resolve("typescript/bin/tsc");
for (const [module, moduleResolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"], ["ESNext", "Node"]]) {
  test(`published declarations resolve with ${moduleResolution}`, () => {
    run(process.execPath, [tsc, "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", module, "--moduleResolution", moduleResolution, "consumer.mts"]);
  });
}
