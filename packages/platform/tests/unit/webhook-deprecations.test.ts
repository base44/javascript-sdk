import { describe, expect, test } from "vitest";
// @ts-expect-error: a plain .mjs build script, with no type declarations
import { deprecations } from "../../scripts/webhook-deprecations.mjs";

const operation = (post: object) => ({ post: { summary: "An app was created", ...post } });

describe("deprecations", () => {
  test("a deprecated webhook gets the replacement, the date and the sunset", () => {
    const openapi = {
      webhooks: {
        "app.created.v1": operation({
          deprecated: true,
          "x-deprecation": { replaced_by: "app.created.v2", effective: "2027-01-01", sunset: "2027-07-01" },
        }),
        "app.created.v2": operation({}),
      },
    };
    expect(deprecations(openapi)).toEqual({
      "app.created.v1": "Deprecated from 2027-01-01; use `app.created.v2`. Base44 stops sending it on 2027-07-01.",
    });
  });

  test("a deprecation without a sunset says only what replaces it", () => {
    const openapi = {
      webhooks: {
        "app.created.v1": operation({ deprecated: true, "x-deprecation": { replaced_by: "app.created.v2", effective: "2027-01-01" } }),
      },
    };
    expect(deprecations(openapi)["app.created.v1"]).toBe("Deprecated from 2027-01-01; use `app.created.v2`.");
  });

  test("an event that left the spec keeps its last notice", () => {
    // The SDK keeps a type after Base44 stops publishing it, so it keeps saying why.
    const previous = { "app.created.v1": "Deprecated from 2027-01-01; use `app.created.v2`." };
    expect(deprecations({ webhooks: { "app.created.v2": operation({}) } }, previous)).toEqual(previous);
  });

  test("nothing is deprecated when no operation says so", () => {
    expect(deprecations({ webhooks: { "app.created.v1": operation({}) } })).toEqual({});
  });
});
