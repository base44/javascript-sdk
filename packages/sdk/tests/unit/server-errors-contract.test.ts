import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { readFunctionError } from "../utils/function-error-reader.ts";

// Headers apper's reader must accept or reject (tests/fixtures/function-error-header-v2.json,
// checked against the reader itself with check-function-error-contract.py). This pins the port
// the other tests read the helpers' headers with.

interface ContractCase {
  name: string;
  status: number;
  header: string;
  accept: boolean;
  expected?: unknown;
}

const fixture: { cases: ContractCase[] } = JSON.parse(
  readFileSync(
    new URL("../fixtures/function-error-header-v2.json", import.meta.url),
    "utf8"
  )
);

describe("X-B44-Function-Error v2 contract", () => {
  test("has accepted and rejected cases", () => {
    expect(fixture.cases.some((c) => c.accept)).toBe(true);
    expect(fixture.cases.some((c) => !c.accept)).toBe(true);
  });

  test.each(fixture.cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const read = readFunctionError(c.header, c.status);
    if (c.accept) {
      expect(read).toEqual(c.expected);
    } else {
      expect(read).toBeNull();
    }
  });

  test("every accepted header is ASCII", () => {
    for (const c of fixture.cases.filter((c) => c.accept)) {
      expect(c.header).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});
