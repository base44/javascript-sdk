import { describe, expect, test } from "vitest";

import { extractSignatureInfo } from "../../scripts/mintlify-post-processing/typedoc-plugin/typedoc-mintlify-returns.js";

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
