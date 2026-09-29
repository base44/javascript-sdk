import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), "base44-sdk-package-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const run = (command, args, cwd = scratch) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
const [packed] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], root));
const installed = path.join(scratch, "node_modules/@base44/sdk");
mkdirSync(installed, { recursive: true });
run("tar", ["-xzf", path.join(scratch, packed.filename), "--strip-components=1", "-C", installed]);
const manifest = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"));
// Use the already-installed, lockfile-pinned dependencies; never resolve or install in this fixture.
for (const name of Object.keys(manifest.dependencies)) {
  const destination = path.join(scratch, "node_modules", name);
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(path.join(root, "node_modules", name), destination, "dir");
}

function evaluate(code) {
  return run(process.execPath, ["--input-type=module", "--eval", code]);
}

test("the tarball contains both compiled entry points and no source or test trees", () => {
  const files = new Set(packed.files.map(file => file.path));
  for (const file of ["dist/index.js", "dist/index.d.ts", "dist/platform/server/index.js", "dist/platform/server/index.d.ts"]) assert.ok(files.has(file), file);
  assert.equal([...files].some(file => /^(src|platform-src|tests|examples)\//.test(file)), false);
});

test("runtime, platform and legacy deep imports resolve from the installed package", () => {
  evaluate(`
    import assert from "node:assert/strict";
    import * as runtime from "@base44/sdk";
    import { Base44PlatformClient, InMemoryTokenStore } from "@base44/sdk/platform/server";
    import { createAxiosClient } from "@base44/sdk/dist/utils/axios-client";
    import { createAxiosClient as explicit } from "@base44/sdk/dist/utils/axios-client.js";
    assert.equal(typeof runtime.createClient, "function");
    assert.equal("Base44PlatformClient" in runtime, false);
    assert.equal(createAxiosClient, explicit);
    assert.equal(typeof InMemoryTokenStore, "function");
    const client = new Base44PlatformClient({ apiKey: "fixture-key", workspaceId: "workspace" });
    assert.equal(client.asUser("customer").externalId, "customer");
  `);
});

for (const [entry, forbidden, blockedEntry] of [
  ["@base44/sdk", "/dist/platform/", "@base44/sdk/platform/server"],
  ["@base44/sdk/platform/server", "/dist/(?!platform/).*", "@base44/sdk"],
]) {
  test(`${entry} does not load the other SDK`, () => {
    const loader = path.join(scratch, "isolation-loader.mjs");
    writeFileSync(loader, `export async function load(url, context, next) {
      if (url.startsWith(${JSON.stringify(pathToFileURL(realpathSync(installed)).href + "/")}) && new RegExp(${JSON.stringify(forbidden)}).test(url)) throw Error("Unexpected SDK dependency: " + url);
      return next(url, context);
    }`);
    run(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      await import(${JSON.stringify(entry)});
      await assert.rejects(import(${JSON.stringify(blockedEntry)}), /Unexpected SDK dependency/);
    `]);
  });
}

const consumer = `
import { createClient, type Base44Client } from "@base44/sdk";
import { Base44PlatformClient, type PlatformApp, type TokenStore } from "@base44/sdk/platform/server";
import { createAxiosClient } from "@base44/sdk/dist/utils/axios-client";
import { createAxiosClient as explicit } from "@base44/sdk/dist/utils/axios-client.js";
const runtime: Base44Client = createClient({ appId: "app" });
const platform = new Base44PlatformClient({ apiKey: "fixture-key", workspaceId: "workspace" });
const app: Promise<PlatformApp> = platform.asUser("customer").apps.get("app");
// @ts-expect-error App operations need an explicit user.
platform.apps.get("app");
// @ts-expect-error Required configuration is typed, not any.
new Base44PlatformClient({ apiKey: "fixture-key" });
const store: TokenStore = { async get() { return null; }, async set() {}, async delete() {} };
void [runtime, app, store, createAxiosClient, explicit];
`;
writeFileSync(path.join(scratch, "consumer.mts"), consumer);
for (const [module, moduleResolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"], ["ESNext", "Node"]]) {
  test(`published declarations resolve with ${moduleResolution}`, () => {
    run(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", module, "--moduleResolution", moduleResolution, "consumer.mts"]);
  });
}
