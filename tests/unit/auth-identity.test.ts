import axios from "axios";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAuthModule } from "../../src/modules/auth.ts";
import type { AuthState, User } from "../../src/modules/auth.types.ts";

afterEach(() => vi.unstubAllGlobals());

function deferredUser() {
  let resolve!: (user: User) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<User>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setup() {
  const api = axios.create();
  const functionsApi = axios.create();
  const get = vi.spyOn(api, "get");
  const onAuthStateChange = vi.fn<(state: AuthState) => void>();
  const auth = createAuthModule(api, functionsApi, "app-id", {
    serverUrl: "https://base44.example",
    appBaseUrl: "https://base44.example",
    onAuthStateChange,
  });
  return { api, functionsApi, get, onAuthStateChange, auth };
}

describe("auth identity notifications", () => {
  test("reports the returned user once for concurrent callers without caching settled identities", async () => {
    const { get, onAuthStateChange, auth } = setup();
    const pending = deferredUser();
    const user = { id: "user-1" } as User;
    get.mockReturnValueOnce(pending.promise);

    const first = auth.me();
    const second = auth.me();
    expect(onAuthStateChange).not.toHaveBeenCalled();
    pending.resolve(user);

    expect(await Promise.all([first, second])).toEqual([user, user]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange.mock.calls).toEqual([
      [{ status: "authenticated", userId: "user-1" }],
    ]);

    get.mockResolvedValueOnce({ id: "user-2" });
    await auth.me();
    expect(get).toHaveBeenCalledTimes(2);
    expect(onAuthStateChange).toHaveBeenLastCalledWith({
      status: "authenticated", userId: "user-2",
    });
  });

  test("announces a token change only after subsequent requests can use it", () => {
    const { api, functionsApi, onAuthStateChange, auth } = setup();
    const observed: unknown[] = [];
    onAuthStateChange.mockImplementation((state) => {
      observed.push({
        state,
        hasToken: auth.hasToken(),
        authorization: api.defaults.headers.common.Authorization,
        functionsAuthorization: functionsApi.defaults.headers.common.Authorization,
      });
    });

    auth.setToken("next-token", false);
    expect(observed).toEqual([{
      state: { status: "pending" },
      hasToken: true,
      authorization: "Bearer next-token",
      functionsAuthorization: "Bearer next-token",
    }]);
  });

  test.each(["success", "failure"])("ignores an old token's late %s without retiring the new request", async (outcome) => {
    const { get, onAuthStateChange, auth } = setup();
    const old = deferredUser();
    const current = deferredUser();
    get.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const before = auth.me().catch((error) => error);

    auth.setToken("new-token", false);
    const after = auth.me();
    if (outcome === "success") old.resolve({ id: "old-user" } as User);
    else old.reject({ status: 401 });
    await before;
    expect(onAuthStateChange.mock.calls).toEqual([[{ status: "pending" }]]);

    const joined = auth.me();
    current.resolve({ id: "new-user" } as User);
    expect(await Promise.all([after, joined])).toEqual([
      { id: "new-user" }, { id: "new-user" },
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(onAuthStateChange.mock.calls).toEqual([
      [{ status: "pending" }],
      [{ status: "authenticated", userId: "new-user" }],
    ]);
  });

  test.each(["success", "failure"])("keeps logout anonymous after an old request's late %s", async (outcome) => {
    const { api, get, onAuthStateChange, auth } = setup();
    const pending = deferredUser();
    auth.setToken("old-token", false);
    onAuthStateChange.mockClear();
    get.mockReturnValueOnce(pending.promise);
    const before = auth.me().catch((error) => error);

    const observed: unknown[] = [];
    onAuthStateChange.mockImplementation(() => {
      observed.push({
        hasToken: auth.hasToken(),
        authorization: api.defaults.headers.common.Authorization,
      });
    });
    auth.logout();
    if (outcome === "success") pending.resolve({ id: "old-user" } as User);
    else pending.reject({ response: { status: 503 } });
    await before;

    expect(onAuthStateChange.mock.calls).toEqual([[{ status: "anonymous" }]]);
    expect(observed).toEqual([{ hasToken: false, authorization: undefined }]);
  });

  test.each([
    [{ status: 401 }, "anonymous"],
    [{ status: 403 }, "anonymous"],
    [{ response: { status: 401 } }, "anonymous"],
    [{ response: { status: 403 } }, "anonymous"],
    [{ status: 503 }, "error"],
    [new Error("Network unavailable"), "error"],
  ])("classifies shared %j failures once without changing their rejection", async (error, status) => {
    const { get, onAuthStateChange, auth } = setup();
    get.mockRejectedValueOnce(error);

    const results = await Promise.allSettled([auth.me(), auth.me()]);
    expect(results).toEqual([
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange.mock.calls).toEqual([[{ status }]]);
  });

  test("preserves successful and failed auth results when an observer throws", async () => {
    const { get, onAuthStateChange, auth } = setup();
    onAuthStateChange.mockImplementation(() => { throw new Error("Observer failed"); });
    get.mockResolvedValueOnce({ id: "user-1" });
    await expect(auth.me()).resolves.toEqual({ id: "user-1" });

    const error = { status: 401 };
    get.mockRejectedValueOnce(error);
    await expect(auth.me()).rejects.toBe(error);
  });

  test("still persists tokens and completes logout cleanup and redirect when an observer throws", () => {
    const { onAuthStateChange, auth } = setup();
    const localStorage = { setItem: vi.fn(), removeItem: vi.fn() };
    const location = { href: "https://base44.example/dashboard" };
    vi.stubGlobal("window", { localStorage, location });
    onAuthStateChange.mockImplementation(() => { throw new Error("Observer failed"); });

    auth.setToken("new-token");
    expect(localStorage.setItem).toHaveBeenCalledWith("base44_access_token", "new-token");
    expect(localStorage.setItem).toHaveBeenCalledWith("token", "new-token");

    auth.logout();
    expect(localStorage.removeItem).toHaveBeenCalledWith("base44_access_token");
    expect(localStorage.removeItem).toHaveBeenCalledWith("token");
    expect(location.href).toBe(
      "https://base44.example/api/apps/auth/logout?from_url=https%3A%2F%2Fbase44.example%2Fdashboard"
    );
  });
});
