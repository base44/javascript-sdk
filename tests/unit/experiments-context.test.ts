import { afterEach, describe, expect, test, vi } from "vitest";
import type { ExperimentsContext } from "../../src/modules/experiments-config.types.js";
import { getBrowserExperimentsContext, readExperimentsContext } from "../../src/modules/experiments-context.js";
import { createExperimentsModule } from "../../src/modules/experiments.js";
import type { InternalAuthModule } from "../../src/modules/auth.types.js";

const context: ExperimentsContext = {
  config: { v: 1, revision: 8, app_id: "app", flags: [], experiments: [{
    id: "exp", flag_key: "checkout", run_version: 1, traffic_allocation: 100, assign_by: "user",
    variants: [{ key: "control", value: false, weight: 0 }, { key: "treatment", value: true, weight: 100 }],
  }] },
  identity: { visitorId: "ünïcödé-👩‍💻", userId: "user-a", status: "authenticated" },
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

afterEach(() => vi.unstubAllGlobals());

describe("platform experiments context", () => {
  test("decodes UTF8 request context but rejects malformed, oversized and other-app context", () => {
    expect(readExperimentsContext(encode(context), "app")).toEqual(context);
    for (const value of [null, "not-json", "a".repeat(96 * 1024 + 1), encode({ ...context, config: { ...context.config, v: 2 } })]) {
      expect(readExperimentsContext(value, "app")).toBeUndefined();
    }
    expect(readExperimentsContext(encode(context), "other-app")).toBeUndefined();
  });

  test("server requests evaluate independently without globals, auth calls or loading exposures", async () => {
    const me = vi.fn();
    const track = vi.fn();
    const make = (value: ExperimentsContext) => createExperimentsModule({
      context: value, getAuth: () => ({ hasToken: () => true, me }) as unknown as InternalAuthModule, trackExposure: track,
    });
    const a = make(context);
    const b = make({ ...context, identity: { visitorId: "other", userId: null, status: "anonymous" } });
    expect(await a.module.ready()).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(a.module.getServerSnapshot()).toEqual(a.module.getSnapshot());
    expect(track).not.toHaveBeenCalled();
    expect(a.module.isEnabled("checkout")).toBe(true);
    expect(b.module.isEnabled("checkout")).toBe(false);
    expect(track).toHaveBeenCalledOnce();
    expect(track.mock.calls[0][1].userId).toBe("user-a");
    expect(me).not.toHaveBeenCalled();
  });

  test("browser hydration preserves request preview despite conflicting session storage", () => {
    const bootstrap = { ...context, preview: { checkout: false } };
    vi.stubGlobal("window", { __B44_EXPERIMENTS_BOOTSTRAP__: bootstrap });
    vi.stubGlobal("document", {});
    vi.stubGlobal("sessionStorage", { getItem: () => '{"checkout":true}' });
    const track = vi.fn();
    const sdk = createExperimentsModule({
      context: getBrowserExperimentsContext("app"),
      getAuth: () => ({ hasToken: () => true }) as InternalAuthModule, trackExposure: track,
    });
    const initial = sdk.module.getServerSnapshot();
    expect(initial).toEqual({ flags: { checkout: false }, isLoading: false });
    expect(sdk.module.isEnabled("checkout")).toBe(false);
    sdk.onAuthStateChange({ status: "anonymous" });
    expect(sdk.module.getServerSnapshot()).toBe(initial);
    expect(track).not.toHaveBeenCalled();
  });

  test("preserves server-rendered flags while common browser auth is still pending", () => {
    const serverFlags = { checkout: false };
    const sdk = createExperimentsModule({
      context: { ...context, identity: { ...context.identity, userId: null, status: "pending" }, serverSnapshot: { flags: serverFlags, isLoading: false } },
      getAuth: () => ({ hasToken: () => true }) as InternalAuthModule, trackExposure: vi.fn(),
    });
    expect(sdk.module.getSnapshot()).toEqual({ flags: {}, isLoading: true });
    expect(sdk.module.getServerSnapshot()).toEqual({ flags: { checkout: false }, isLoading: false });
    sdk.onAuthStateChange({ status: "authenticated", userId: "user" });
    serverFlags.checkout = true;
    expect(sdk.module.getSnapshot()).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(sdk.module.getServerSnapshot().flags.checkout).toBe(false);
  });
});
