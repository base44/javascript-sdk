import { afterEach, describe, expect, test, vi } from "vitest";
import { createExperimentsModule } from "../../src/modules/experiments.js";
import type { ExperimentsRuntime } from "../../src/modules/experiments-runtime.types.js";
import type { AuthState, InternalAuthModule, User } from "../../src/modules/auth.types.js";

function setup(hasToken = false) {
  const runtime: ExperimentsRuntime = {
    flags: { checkout: false },
    assignments: [{ experiment_id: "exp", flag_key: "checkout", run_version: 1, variant_key: "control", preview: false }],
    visitorId: "visitor", userId: null, pendingUser: false,
    setUser(id) {
      this.userId = id;
      this.pendingUser = false;
      this.flags = { checkout: id !== null };
    },
  };
  vi.stubGlobal("window", { __B44_EXPERIMENTS__: runtime });
  vi.stubGlobal("document", {});
  const requests: { resolve: (user: User) => void; reject: (error: Error) => void }[] = [];
  const me = vi.fn(() => new Promise<User>((resolve, reject) => requests.push({ resolve, reject })));
  const trackExposure = vi.fn();
  const bridge = createExperimentsModule({
    getAuth: () => ({ hasToken: () => hasToken, me }) as InternalAuthModule,
    trackExposure,
  });
  const settle = (index: number, state: AuthState) => {
    bridge.onAuthStateChange(state);
    if (state.status === "authenticated") requests[index]?.resolve({ id: state.userId } as User);
    else requests[index]?.reject(new Error("lookup failed"));
  };
  return { ...bridge, runtime, requests, settle, me, trackExposure };
}

afterEach(() => vi.unstubAllGlobals());

describe("browser experiments", () => {
  test("stays lazy and returns fallback without a browser or injected runtime", async () => {
    const b = setup(true);
    expect(b.me).not.toHaveBeenCalled();
    vi.stubGlobal("window", undefined);
    expect(b.module.isEnabled("checkout", true)).toBe(true);
    expect(await b.module.ready()).toEqual({ flags: {}, isLoading: false });
    vi.stubGlobal("window", {});
    expect(b.module.isEnabled("checkout")).toBe(false);
    expect(b.me).not.toHaveBeenCalled();
    expect(b.trackExposure).not.toHaveBeenCalled();
  });

  test("preserves explicit false, ignores inherited keys, and tracks only assigned reads", () => {
    const b = setup();
    expect(b.module.isEnabled("missing", true)).toBe(true);
    expect(b.module.isEnabled("toString")).toBe(false);
    expect(b.trackExposure).not.toHaveBeenCalled();
    expect(b.module.isEnabled("checkout", true)).toBe(false);
    expect(b.trackExposure).toHaveBeenCalledWith(b.runtime.assignments[0], b.runtime);
    expect(b.me).not.toHaveBeenCalled();
  });

  test("preview flags without assignments never report exposures", () => {
    const b = setup();
    b.runtime.flags.checkout = true;
    b.runtime.assignments = [];
    expect(b.module.isEnabled("checkout")).toBe(true);
    expect(b.trackExposure).not.toHaveBeenCalled();
  });

  test("holds all exposures until token identity resolves, even when bootstrap is not pending", async () => {
    const b = setup(true);
    const observed: boolean[] = [];
    b.module.subscribe(() => observed.push(b.module.getSnapshot().isLoading));
    expect(b.module.isEnabled("checkout")).toBe(false);
    expect(b.module.getSnapshot()).toEqual({ flags: {}, isLoading: true });
    expect(b.trackExposure).not.toHaveBeenCalled();
    const ready = b.module.ready();
    b.settle(0, { status: "authenticated", userId: "user-1" });
    expect(await ready).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(b.runtime.userId).toBe("user-1");
    expect(observed).toEqual([false]);
    expect(b.module.isEnabled("checkout")).toBe(true);
    expect(b.me).not.toHaveBeenCalled();
  });

  test("snapshots are stable and immutable and observation alone does not expose", async () => {
    const b = setup();
    const first = b.module.getSnapshot();
    expect(await b.module.ready()).toBe(first);
    expect(Object.isFrozen(first.flags)).toBe(true);
    const listener = vi.fn();
    const unsubscribe = b.module.subscribe(listener);
    b.onAuthStateChange({ status: "anonymous" });
    expect(b.module.getSnapshot()).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    b.onAuthStateChange({ status: "authenticated", userId: "user-1" });
    expect(listener).not.toHaveBeenCalled();
    expect(b.module.getSnapshot()).not.toBe(first);
    expect(b.trackExposure).not.toHaveBeenCalled();
  });

  test("ready follows a replacement token and logout immediately clears user assignments", async () => {
    const b = setup(true);
    const ready = b.module.ready();
    b.onAuthStateChange({ status: "pending" });
    expect(b.module.getSnapshot().isLoading).toBe(true);
    b.settle(1, { status: "authenticated", userId: "new-user" });
    expect((await ready).flags.checkout).toBe(true);
    expect(b.runtime.userId).toBe("new-user");
    b.onAuthStateChange({ status: "anonymous" });
    expect(b.runtime.userId).toBeNull();
    expect(b.module.isEnabled("checkout")).toBe(false);
  });

  test("failed common identity lookup returns fallbacks without starting its own retry", async () => {
    const b = setup(true);
    const ready = b.module.ready();
    b.settle(0, { status: "error" });
    expect(await ready).toEqual({ flags: {}, isLoading: false });
    expect(b.module.isEnabled("checkout", true)).toBe(true);
    expect(b.me).not.toHaveBeenCalled();
    expect(b.trackExposure).not.toHaveBeenCalled();
    expect(await b.module.ready()).toEqual({ flags: {}, isLoading: false });
    b.onAuthStateChange({ status: "pending" });
    const retry = b.module.ready();
    b.settle(0, { status: "authenticated", userId: "user-1" });
    expect((await retry).flags.checkout).toBe(true);
  });

  test("invalid authentication resolves to visitor flags instead of user enrollment", async () => {
    const b = setup(true);
    const ready = b.module.ready();
    b.settle(0, { status: "anonymous" });
    expect((await ready).flags.checkout).toBe(false);
    expect(b.runtime.userId).toBeNull();
  });

  test("adopts a runtime injected later and clears stale bootstrap identity", () => {
    const b = setup();
    vi.stubGlobal("window", {});
    b.module.getSnapshot();
    b.runtime.userId = "old-user";
    b.runtime.flags.checkout = true;
    vi.stubGlobal("window", { __B44_EXPERIMENTS__: b.runtime });
    expect(b.module.isEnabled("checkout")).toBe(false);
    expect(b.runtime.userId).toBeNull();
  });

  test("cleanup and throwing subscribers cannot restore or interrupt identity", async () => {
    const b = setup(true);
    const listener = vi.fn(() => { throw new Error("render error"); });
    b.module.subscribe(listener);
    b.settle(0, { status: "authenticated", userId: "user-1" });
    await b.module.ready();
    expect(b.module.isEnabled("checkout")).toBe(true);
    b.cleanup();
    b.onAuthStateChange({ status: "authenticated", userId: "late-user" });
    expect(b.module.getSnapshot()).toEqual({ flags: {}, isLoading: false });
    expect(listener).toHaveBeenCalledOnce();
  });

  test.each(["logout", "cleanup"])("ready settles on %s without waiting for an obsolete lookup", async (action) => {
    const b = setup(true);
    const ready = b.module.ready();
    if (action === "logout") b.onAuthStateChange({ status: "anonymous" });
    else b.cleanup();
    expect((await ready).isLoading).toBe(false);
  });
});
