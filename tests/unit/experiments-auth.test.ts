import axios from "axios";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAuthModule } from "../../src/modules/auth.js";
import { createExperimentsModule } from "../../src/modules/experiments.js";
import type { User } from "../../src/modules/auth.types.js";
import type { ExperimentsRuntime } from "../../src/modules/experiments-runtime.types.js";

function setup(token?: string) {
  const api = axios.create();
  const requests: { resolve: (user: User) => void; reject: (error: unknown) => void }[] = [];
  const get = vi.spyOn(api, "get").mockImplementation(() =>
    new Promise<User>((resolve, reject) => requests.push({ resolve, reject }))
  );
  const runtime: ExperimentsRuntime = {
    flags: { checkout: false }, assignments: [], visitorId: "visitor",
    userId: null, pendingUser: false,
    setUser(userId) {
      this.userId = userId;
      this.pendingUser = false;
      this.flags = { checkout: userId !== null };
    },
  };
  vi.stubGlobal("window", {
    __B44_EXPERIMENTS__: runtime,
    localStorage: { setItem: vi.fn(), removeItem: vi.fn() },
    location: { href: "https://example.test/dashboard" },
  });
  vi.stubGlobal("document", {});
  const bridge = createExperimentsModule({ getAuth: () => auth, trackExposure: vi.fn() });
  const auth = createAuthModule(api, axios.create(), "app-id", {
    serverUrl: "https://example.test", appBaseUrl: "https://example.test",
    onAuthStateChange: bridge.onAuthStateChange,
  });
  if (token) auth.setToken(token, false);
  return { api, get, requests, runtime, auth, ...bridge };
}

afterEach(() => vi.unstubAllGlobals());

describe("experiments with real SDK auth", () => {
  test("ready follows token B without waiting for A, and A cannot restore its identity", async () => {
    const b = setup("token-a");
    const ready = b.module.ready();
    const oldRequest = b.auth.me();
    b.auth.setToken("token-b", false);
    const newRequest = b.auth.me();
    expect(b.get).toHaveBeenCalledTimes(2);

    b.requests[1].resolve({ id: "user-b" } as User);
    await newRequest;
    expect(await ready).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(b.runtime.userId).toBe("user-b");

    b.requests[0].resolve({ id: "user-a" } as User);
    await expect(oldRequest).resolves.toEqual({ id: "user-a" });
    expect(b.runtime.userId).toBe("user-b");
    expect(b.module.getSnapshot()).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(b.get).toHaveBeenCalledTimes(2);
  });

  test("logout settles ready immediately and ignores the old authenticated response", async () => {
    const b = setup("old-token");
    const ready = b.module.ready();
    const oldRequest = b.auth.me();
    b.auth.logout();

    expect(await ready).toEqual({ flags: { checkout: false }, isLoading: false });
    expect(b.runtime.userId).toBeNull();
    b.requests[0].resolve({ id: "old-user" } as User);
    await oldRequest;
    expect(b.module.getSnapshot()).toEqual({ flags: { checkout: false }, isLoading: false });
    expect(b.runtime.userId).toBeNull();
    expect(b.get).toHaveBeenCalledOnce();
  });

  test("ready observes the common auth flow retry without starting a lookup", async () => {
    const b = setup("valid-token");
    const ready = b.module.ready();
    const first = b.auth.me().catch(() => {});
    b.requests[0].reject({ status: 503 });
    await first;
    expect(await ready).toEqual({ flags: {}, isLoading: false });

    const retry = b.auth.me();
    b.requests[1].resolve({ id: "recovered-user" } as User);
    await retry;
    expect(await b.module.ready()).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(b.runtime.userId).toBe("recovered-user");
  });

  test("email login changes an active anonymous experiment session to the resolved user", async () => {
    const b = setup();
    expect(await b.module.ready()).toEqual({ flags: { checkout: false }, isLoading: false });
    const response = { access_token: "login-token", user: { id: "logged-in" } };
    vi.spyOn(b.api, "post").mockResolvedValueOnce(response);

    await expect(b.auth.loginViaEmailPassword("user@example.test", "password")).resolves.toEqual(response);
    expect(b.module.getSnapshot()).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(b.api.defaults.headers.common.Authorization).toBe("Bearer login-token");
    expect(await b.module.ready()).toEqual({ flags: { checkout: true }, isLoading: false });
    expect(b.runtime.userId).toBe("logged-in");
    expect(b.get).not.toHaveBeenCalled();
  });
});
