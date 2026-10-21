import { describe, expect, test } from "vitest";

import {
  convertInterfaceMethodReturns,
  extractSignatureInfo,
} from "../../scripts/mintlify-post-processing/typedoc-plugin/typedoc-mintlify-returns.js";

describe("TypeDoc return signature parsing", () => {
  test("recognizes method-level generics and their linked response type", () => {
    const signature =
      "> **callApi**\\<`T`\\>(`integrationType`, `request`): `Promise`\\<[`ConnectorApiResponse`](../interfaces/ConnectorApiResponse)\\<`T`\\>\\>";

    const { signatureMap, linkedTypeMap } = extractSignatureInfo(
      [signature],
      new Set(),
      () => {},
      null
    );

    expect(signatureMap.get(0)).toBe("Promise<ConnectorApiResponse>");
    expect(linkedTypeMap.get(0)).toEqual({
      typeName: "ConnectorApiResponse",
      typePath: "../interfaces/ConnectorApiResponse",
    });
  });
});

describe("TypeDoc interface method returns", () => {
  const page = { url: "interfaces/Example.mdx" };

  test("a plain return renders its description, not a field named after a word in it", () => {
    const content = [
      "> **submit**(`values`): `Promise`\\<`void`\\>",
      "",
      "#### Returns",
      "",
      "`Promise`\\<`void`\\>",
      "",
      "Promise resolving once the values are sent.",
    ].join("\n");

    const result = convertInterfaceMethodReturns(content, null, page, new Set(), () => {});

    expect(result).not.toContain("<ResponseField");
    expect(result).toContain("Promise resolving once the values are sent.");
  });

  test("a property whose type is a function keeps its return type", () => {
    const content = [
      "> `optional` **onAppCreated**: (`app`) => `void`",
      "",
      "#### Returns",
      "",
      "`void`",
    ].join("\n");

    const result = convertInterfaceMethodReturns(content, null, page, new Set(), () => {});

    expect(result).toMatch(/#### Returns\n\n`void`/);
  });
});
