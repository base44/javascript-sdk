import { describe, expect, test } from "vitest";
import { evaluateExperiments } from "../../src/modules/experiments-evaluator.js";
import type { ExperimentsConfig } from "../../src/modules/experiments-config.types.js";

const appId = "66f1a2b3c4d5e6f7a8b9c0d1";
const config: ExperimentsConfig = {
  v: 1, revision: 3, app_id: appId,
  flags: [{ key: "checkout-flow", rollout_percentage: 54 }],
  experiments: [{
    id: "exp-1", flag_key: "checkout-flow", run_version: 1,
    assign_by: "visitor", traffic_allocation: 21,
    variants: [{ key: "control", value: false, weight: 9 }, { key: "treatment", value: true, weight: 91 }],
  }],
};

describe("shared local experiments evaluator", () => {
  test.each([
    ["visitor-1", 54, 20, 9],
    ["ünïcödé-👩‍💻", 8, 14, 59],
  ] as const)("matches Python UTF8 golden boundaries for %s", (visitorId, rollout, enroll, variant) => {
    const identity = { visitorId, userId: null };
    const golden: ExperimentsConfig = {
      ...config, flags: [{ key: "checkout-flow", rollout_percentage: rollout }],
      experiments: [{ ...config.experiments[0], traffic_allocation: enroll + 1, variants: [
        { key: "control", value: false, weight: variant }, { key: "treatment", value: true, weight: 100 - variant },
      ] }],
    };
    expect(evaluateExperiments({ ...golden, experiments: [] }, identity).flags["checkout-flow"]).toBe(false);
    const result = evaluateExperiments(golden, identity);
    expect(result.flags["checkout-flow"]).toBe(true);
    expect(result.assignments).toEqual([{
      experiment_id: "exp-1", flag_key: "checkout-flow", run_version: 1, variant_key: "treatment", preview: false,
    }]);
    expect(evaluateExperiments({ ...golden, experiments: [{ ...golden.experiments[0], traffic_allocation: enroll }] }, identity).assignments).toEqual([]);
  });

  test("user assignment ignores refresh visitor changes and excludes anonymous users", () => {
    const userConfig: ExperimentsConfig = { ...config, experiments: [{ ...config.experiments[0], assign_by: "user", traffic_allocation: 100 }] };
    expect(evaluateExperiments(userConfig, { visitorId: "v1", userId: null }).assignments).toEqual([]);
    expect(evaluateExperiments(userConfig, { visitorId: "v1", userId: "user" }).assignments)
      .toEqual(evaluateExperiments(userConfig, { visitorId: "v2", userId: "user" }).assignments);
  });

  test("explicit preview suppresses enrollment, while inherited names are not overrides", () => {
    const named: ExperimentsConfig = { ...config, experiments: [{ ...config.experiments[0], flag_key: "constructor", traffic_allocation: 100 }] };
    const identity = { visitorId: "visitor-1", userId: null };
    expect(evaluateExperiments(named, identity).assignments).toHaveLength(1);
    const preview = evaluateExperiments(named, identity, { constructor: false });
    expect(preview.flags.constructor).toBe(false);
    expect(preview.assignments).toEqual([]);
  });
});
