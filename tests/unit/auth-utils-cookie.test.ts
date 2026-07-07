import { describe, test, expect, afterEach, vi } from "vitest";
import {
  buildAccessTokenCookie,
  buildClearAccessTokenCookie,
  setAccessTokenCookie,
  clearAccessTokenCookie,
} from "../../src/utils/auth-utils.ts";
import { saveAccessToken, removeAccessToken } from "../../src/index.ts";

describe("access token cookie builders", () => {
  test("builds the cookie string with path and SameSite attributes", () => {
    expect(buildAccessTokenCookie("my-token")).toBe(
      "base44_access_token=my-token; path=/; SameSite=Lax"
    );
  });

  test("adds the Secure attribute when requested", () => {
    expect(buildAccessTokenCookie("my-token", { secure: true })).toBe(
      "base44_access_token=my-token; path=/; SameSite=Lax; Secure"
    );
  });

  test("URL-encodes the token value", () => {
    expect(buildAccessTokenCookie("a token;=value")).toBe(
      "base44_access_token=a%20token%3B%3Dvalue; path=/; SameSite=Lax"
    );
  });

  test("supports a custom cookie name", () => {
    expect(buildAccessTokenCookie("my-token", { name: "custom_key" })).toBe(
      "custom_key=my-token; path=/; SameSite=Lax"
    );
  });

  test("builds the clearing cookie string with Max-Age=0", () => {
    expect(buildClearAccessTokenCookie()).toBe(
      "base44_access_token=; path=/; SameSite=Lax; Max-Age=0"
    );
    expect(buildClearAccessTokenCookie({ secure: true })).toBe(
      "base44_access_token=; path=/; SameSite=Lax; Max-Age=0; Secure"
    );
  });
});

describe("access token cookie mirror in a simulated browser", () => {
  const stubBrowser = (protocol: string) => {
    const doc = { cookie: "" };
    const storage = new Map<string, string>();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", {
      location: { protocol },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    return { doc, storage };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("saveAccessToken mirrors the token into a cookie alongside localStorage", () => {
    const { doc, storage } = stubBrowser("https:");

    expect(saveAccessToken("my-token", {})).toBe(true);

    expect(storage.get("base44_access_token")).toBe("my-token");
    expect(storage.get("token")).toBe("my-token");
    expect(doc.cookie).toBe(
      "base44_access_token=my-token; path=/; SameSite=Lax; Secure"
    );
  });

  test("saveAccessToken omits Secure on http pages", () => {
    const { doc } = stubBrowser("http:");

    saveAccessToken("my-token", {});

    expect(doc.cookie).toBe(
      "base44_access_token=my-token; path=/; SameSite=Lax"
    );
  });

  test("removeAccessToken clears the cookie and localStorage", () => {
    const { doc, storage } = stubBrowser("https:");
    saveAccessToken("my-token", {});

    expect(removeAccessToken({})).toBe(true);

    expect(storage.has("base44_access_token")).toBe(false);
    expect(doc.cookie).toBe(
      "base44_access_token=; path=/; SameSite=Lax; Max-Age=0; Secure"
    );
  });

  test("setAccessTokenCookie and clearAccessTokenCookie are no-ops without a document", () => {
    // node test environment: no document global
    expect(typeof document).toBe("undefined");
    expect(() => setAccessTokenCookie("my-token")).not.toThrow();
    expect(() => clearAccessTokenCookie()).not.toThrow();
    expect(saveAccessToken("my-token", {})).toBe(false);
    expect(removeAccessToken({})).toBe(false);
  });
});
