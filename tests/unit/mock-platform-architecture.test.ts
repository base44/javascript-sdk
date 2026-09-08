import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const unitDirectory = fileURLToPath(new URL(".", import.meta.url));
const thisFile = fileURLToPath(import.meta.url);

describe("mock platform architecture", () => {
  test("SDK behavior tests cannot author HTTP handlers or responses", () => {
    const forbidden = [
      ["mock", "Http"].join(""),
      ["server", ".use("].join(""),
      ["from ", '"msw"'].join(""),
      ["from ", "'msw'"].join(""),
      ["mocks/", "server"].join(""),
    ];
    const violations = readdirSync(unitDirectory)
      .filter((name) => /\.test\.[jt]s$/.test(name))
      .map((name) => `${unitDirectory}/${name}`)
      .filter((path) => path !== thisFile)
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return forbidden
          .filter((pattern) => source.includes(pattern))
          .map((pattern) => `${path.split("/").at(-1)} contains ${pattern}`);
      });

    expect(violations).toEqual([]);
  });
});
