import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  main: string;
  types: string;
  exports: Record<string, unknown>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const indexSource = readFileSync("src/index.ts", "utf8");
const clientSource = readFileSync("src/client.ts", "utf8");
const clientTypesSource = readFileSync("src/client.types.ts", "utf8");

/** Removes block and line comments, so a check sees code rather than prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("package exports", () => {
  test("keeps main and types, so resolvers predating exports maps still work", () => {
    expect(packageJson.main).toBe("dist/index.js");
    expect(packageJson.types).toBe("dist/index.d.ts");
  });

  test("exposes the iap subpath", () => {
    expect(packageJson.exports["./iap"]).toEqual({
      types: "./dist/iap/index.d.ts",
      default: "./dist/iap/index.js",
    });
  });

  test("keeps deep dist/ paths resolving, which Base44 app templates depend on", () => {
    // Templates import "@base44/sdk/dist/utils/axios-client" with no
    // extension, and an exports map does no extension guessing. Both patterns
    // are needed: the bare one maps an extensionless request onto ".js", and
    // the "*.js" one stops an explicit ".js" request becoming ".js.js".
    // Node prefers the longer suffix, so the two do not conflict.
    expect(packageJson.exports["./dist/*"]).toEqual({
      types: "./dist/*.d.ts",
      default: "./dist/*.js",
    });
    expect(packageJson.exports["./dist/*.js"]).toEqual({
      types: "./dist/*.d.ts",
      default: "./dist/*.js",
    });
    expect(packageJson.exports["./dist/*.d.ts"]).toBe("./dist/*.d.ts");
  });

  test("still exports package.json, which tooling reads directly", () => {
    expect(packageJson.exports["./package.json"]).toBe("./package.json");
  });

  test("adds exactly one production dependency: Apple's own verification library", () => {
    expect(Object.keys(packageJson.dependencies).sort()).toEqual([
      "@apple/app-store-server-library",
      "axios",
      "partysocket",
      "socket.io-client",
      "uuid",
    ]);
  });

  test("that dependency is reachable only from the iap subpath, never the main entry", () => {
    // It pulls in node:crypto, Buffer and node-fetch. Browsers must never see
    // it, which the subpath export is what guarantees.
    //
    // Checked against the sources rather than the build, because `npm run
    // test:unit` in CI runs without building — reading dist/ here passes
    // locally off a stale build and fails on a clean checkout.
    for (const file of ["src/index.ts", "src/client.ts", "src/client.types.ts"]) {
      expect(readFileSync(file, "utf8"), `${file} reaches Apple's library`).not.toMatch(
        /app-store-server-library|apple-verifier/
      );
    }

    // Only the subpath's own verifier selection may import it.
    const importers = readdirSync("src/iap/verify")
      .filter((name) => name.endsWith(".ts"))
      .filter((name) =>
        readFileSync(`src/iap/verify/${name}`, "utf8").includes(
          "@apple/app-store-server-library"
        )
      );
    expect(importers).toEqual(["apple-verifier.ts"]);
  });

  test("the built main entry carries none of it either, when a build is present", () => {
    // The strongest form of the check, but only meaningful after `npm run
    // build`, so it reports rather than failing on a clean checkout.
    if (!existsSync("dist/index.js")) return;
    expect(readFileSync("dist/index.js", "utf8")).not.toMatch(
      /app-store-server-library/
    );
  });

  test("keeps the certificate-generation library to devDependencies, where it never ships", () => {
    expect(packageJson.devDependencies["@peculiar/x509"]).toBeDefined();
    expect(packageJson.dependencies["@peculiar/x509"]).toBeUndefined();
    // The gating CI audit runs with --omit=dev, so a dev-only dependency
    // cannot fail it.
    expect(packageJson.devDependencies["reflect-metadata"]).toBeDefined();
    expect(packageJson.dependencies["reflect-metadata"]).toBeUndefined();
  });
});

describe("entry-point isolation", () => {
  test("the main entry references the iap module only as types, so browsers download none of it", () => {
    const iapLines = indexSource
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => line.includes('from "./iap/'));

    expect(iapLines.length).toBeGreaterThan(0);

    // Every iap import must belong to an `export type { ... }` block. Walk
    // backwards from the `from` line to the statement that opened it.
    const lines = indexSource.split("\n");
    for (const [lineNumber] of iapLines) {
      let cursor = lineNumber - 1;
      while (cursor > 0 && !lines[cursor].includes("export type {")) {
        expect(lines[cursor]).not.toMatch(/^\s*(import|export)\s+\{/);
        cursor -= 1;
      }
      expect(lines[cursor]).toContain("export type {");
    }
  });

  test("the client never constructs the iap module, which is what keeps it off the browser path", () => {
    expect(clientSource).not.toMatch(/\biap\b/i);
    expect(clientTypesSource).not.toMatch(/\biap\b/i);
  });

  test("the iap module touches no Node built-in, so it runs on Deno and in a browser", () => {
    const files = [
      "src/iap/index.ts",
      "src/iap/version.ts",
      "src/iap/errors.types.ts",
      "src/iap/ingest/matrix.ts",
      "src/iap/ingest/mappers.ts",
      "src/iap/ingest/notifications.ts",
      "src/iap/ingest/device.ts",
      "src/iap/ingest/device.types.ts",
      "src/iap/read/derive.ts",
      "src/iap/read/read.ts",
      "src/iap/read/read.types.ts",
      "src/iap/store/collapse.ts",
      "src/iap/store/descriptors.ts",
      "src/iap/store/entities-store.ts",
      "src/iap/store/rows.types.ts",
      "src/iap/store/schemas.ts",
      "src/iap/store/store-errors.ts",
      "src/iap/store/store.types.ts",
      "src/iap/server-api/client.ts",
      "src/iap/server-api/jwt.ts",
      "src/iap/server-api/server-api.types.ts",
      "src/iap/events/emitter.ts",
      "src/iap/events/events.types.ts",
      "src/iap/config.ts",
      "src/iap/errors.ts",
      "src/iap/account-token.ts",
      "src/iap/runtime/base64.ts",
      "src/iap/runtime/webcrypto.ts",
      "src/iap/runtime/clock.ts",
      "src/iap/verify/asn1.ts",
      "src/iap/verify/x509.ts",
      "src/iap/verify/ecdsa.ts",
      "src/iap/verify/chain.ts",
      "src/iap/verify/jws.ts",
      "src/iap/verify/verifier.ts",
      "src/iap/verify/payload-checks.ts",
      "src/iap/verify/apple-roots.ts",
    ];
    // Deliberately NOT in that list: src/iap/verify/apple-verifier.ts. It is
    // the Node-compatibility path by design — it wraps Apple's library, which
    // needs `Buffer` and `node:crypto`. Its own guard is below.
    for (const file of files) {
      // Comments are stripped first: several of these files explain in prose
      // why they avoid `Buffer` or `process.env`, and a naive match would
      // flag the explanation as the offence.
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file} imports a Node built-in`).not.toMatch(/from "node:/);
      expect(source, `${file} uses require()`).not.toMatch(/\brequire\(/);
      expect(source, `${file} uses Buffer`).not.toMatch(/\bBuffer\s*[.(]|new\s+Buffer/);
      expect(source, `${file} reads process.env`).not.toMatch(/process\.env/);
      expect(source, `${file} touches window`).not.toMatch(/\bwindow\./);
      expect(source, `${file} touches document`).not.toMatch(/\bdocument\./);
    }
  });

  test("only the runtime accessor file reaches for a global, so there is one place to audit", () => {
    const verifyFiles = [
      "src/iap/verify/asn1.ts",
      "src/iap/verify/x509.ts",
      "src/iap/verify/ecdsa.ts",
      "src/iap/verify/chain.ts",
      "src/iap/verify/jws.ts",
      "src/iap/verify/verifier.ts",
    ];
    for (const file of verifyFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      // `crypto.subtle` and `fetch` are reached only through runtime/webcrypto.ts.
      expect(source, `${file} reaches crypto directly`).not.toMatch(
        /globalThis\.crypto|[^.\w]crypto\.subtle/
      );
    }
    expect(readFileSync("src/iap/runtime/webcrypto.ts", "utf8")).toMatch(
      /globalThis as \{ crypto\?: Crypto \}/
    );
  });
});
