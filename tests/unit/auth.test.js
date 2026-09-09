import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient as newClient } from "../../src/index.ts";
import { getSharedInstance } from "../../src/utils/sharedInstance.ts";
import { platform } from "../mocks/platform";

const clients = [];
const createClient = (...args) => {
  const client = newClient(...args);
  clients.push(client);
  return client;
};

describe("Auth Module", () => {
  let base44;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";
  const appBaseUrl = "https://api.base44.com";

  function authenticate(user, token = "test-access-token") {
    platform.given.app(appId).auth.principal(token, user);
    base44.auth.setToken(token, false);
  }

  beforeEach(() => {
    platform.reset();
    // Mock window.addEventListener and document for analytics module
    if (typeof window !== "undefined") {
      if (!window.addEventListener) {
        window.addEventListener = vi.fn();
        window.removeEventListener = vi.fn();
      }
    }
    if (typeof document === "undefined") {
      global.document = {
        referrer: "",
        visibilityState: "visible",
      };
    }

    // Create a new client for each test
    base44 = createClient({
      serverUrl,
      appId,
      appBaseUrl,
    });
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.cleanup();
    // Clean up localStorage if it exists
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe("me()", () => {
    test("should fetch current user information", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        role: "user",
      };

      authenticate(mockUser);

      // Call the API
      const result = await base44.auth.me();

      // Verify the response - auth methods return data directly, not wrapped
      expect(result).toEqual(mockUser);
      expect(result.id).toBe("user-123");
      expect(result.email).toBe("test@example.com");
    });

    test("preserves authentication error status", async () => {
      // Call the API and expect an error
      await expect(base44.auth.me()).rejects.toMatchObject({ status: 401 });
    });

    test("binds principals to bearer tokens and app scope without sharing login across clients", async () => {
      const otherAppId = "other-app-id";
      const anonymousOther = createClient({ serverUrl, appId: otherAppId });
      const wrongScope = createClient({
        serverUrl,
        appId: otherAppId,
        token: "app-a-token",
      });
      const appAAccount = {
        email: "a@example.test",
        password: "password-a",
        accessToken: "app-a-token",
        user: { id: "user-a", app_id: appId, email: "a@example.test" },
      };
      const appBAccount = {
        email: "b@example.test",
        password: "password-b",
        accessToken: "app-b-token",
        user: { id: "user-b", app_id: otherAppId, email: "b@example.test" },
      };
      platform.given.app(appId).auth.account(appAAccount);
      platform.given.app(otherAppId).auth.account(appBAccount);

      await base44.auth.loginViaEmailPassword(
        appAAccount.email,
        appAAccount.password,
      );
      await expect(base44.auth.me()).resolves.toEqual(appAAccount.user);
      await expect(anonymousOther.auth.me()).rejects.toMatchObject({
        status: 401,
      });
      await expect(wrongScope.auth.me()).rejects.toMatchObject({ status: 401 });

      await anonymousOther.auth.loginViaEmailPassword(
        appBAccount.email,
        appBAccount.password,
      );
      await expect(anonymousOther.auth.me()).resolves.toEqual(appBAccount.user);
      await expect(base44.auth.me()).resolves.toEqual(appAAccount.user);
    });

    test("shares one in-flight request between concurrent callers", async () => {
      const mockUser = { id: "user-123", email: "test@example.com" };

      authenticate(mockUser);

      const [first, second] = await Promise.all([
        base44.auth.me(),
        base44.auth.me(),
      ]);

      expect(first).toEqual(mockUser);
      expect(second).toEqual(mockUser);
      expect(platform.requests.count("auth.me")).toBe(1);
    });

    test("does not reuse a resolved user across separate calls", async () => {
      authenticate({ id: "user-1" });

      const first = await base44.auth.me();
      platform.given
        .app(appId)
        .auth.principal("test-access-token", { id: "user-2" });
      const second = await base44.auth.me();

      // Sharing is limited to the in-flight window; identity is never cached.
      expect(first.id).toBe("user-1");
      expect(second.id).toBe("user-2");
    });

    test("does not retain a rejected request", async () => {
      const mockUser = { id: "user-123" };
      base44.auth.setToken("recovering-token", false);

      await expect(base44.auth.me()).rejects.toThrow();
      platform.given.app(appId).auth.principal("recovering-token", mockUser);
      await expect(base44.auth.me()).resolves.toEqual(mockUser);
    });

    test("setToken() drops an in-flight request from the previous identity", async () => {
      platform.given
        .app(appId)
        .auth.principal("old-access-token", { id: "anonymous" });
      platform.given
        .app(appId)
        .auth.principal("new-access-token", { id: "logged-in" });
      platform.given.app(appId).auth.meLatency("old-access-token", 50);
      platform.given.app(appId).auth.meLatency("new-access-token", 50);
      base44.auth.setToken("old-access-token", false);

      const beforeLogin = base44.auth.me();
      base44.auth.setToken("new-access-token", false);
      const afterLogin = await base44.auth.me();

      // The call made after the identity change must not resolve into the
      // request that was already in flight for the anonymous one.
      expect(afterLogin.id).toBe("logged-in");
      await expect(beforeLogin).resolves.toEqual({ id: "anonymous" });
    });

    test("a superseded request does not retire the current one", async () => {
      platform.given
        .app(appId)
        .auth.principal("old-access-token", { id: "anonymous" });
      platform.given
        .app(appId)
        .auth.principal("new-access-token", { id: "logged-in" });
      platform.given.app(appId).auth.meLatency("old-access-token", 50);
      platform.given.app(appId).auth.meLatency("new-access-token", 50);
      base44.auth.setToken("old-access-token", false);

      const beforeLogin = base44.auth.me();
      base44.auth.setToken("new-access-token", false);
      const afterLogin = base44.auth.me();

      // Let the anonymous request settle while the post-login one is still in
      // flight, then join it.
      await expect(beforeLogin).resolves.toEqual({ id: "anonymous" });
      const joined = base44.auth.me();

      expect(await afterLogin).toEqual({ id: "logged-in" });
      expect(await joined).toEqual({ id: "logged-in" });
      expect(platform.requests.count("auth.me")).toBe(2);
    });

    test("setToken() clears the analytics session context", () => {
      const analyticsState = getSharedInstance("analytics", () => ({}));
      analyticsState.sessionContext = {
        user_id: "anonymous-user",
        session_id: "s1",
      };

      base44.auth.setToken("new-access-token", false);

      expect(analyticsState.sessionContext).toBeNull();
    });
  });

  describe("updateMe()", () => {
    test("rejects missing and invalid tokens without manufacturing a user", async () => {
      const invalidClient = createClient({
        serverUrl,
        appId,
        token: "invalid-token",
      });
      await expect(
        base44.auth.updateMe({ name: "Anonymous" }),
      ).rejects.toMatchObject({
        status: 401,
        message: "Unauthorized",
      });
      await expect(
        invalidClient.auth.updateMe({ name: "Invalid" }),
      ).rejects.toMatchObject({
        status: 401,
        message: "Unauthorized",
      });
      expect(
        platform.requests.all("auth.updateMe").map((request) => request.body),
      ).toEqual([{ name: "Anonymous" }, { name: "Invalid" }]);
    });

    test("should update current user data", async () => {
      const updateData = {
        name: "Updated Name",
        email: "updated@example.com",
      };

      const updatedUser = {
        id: "user-123",
        ...updateData,
        role: "user",
      };

      authenticate({
        id: "user-123",
        name: "Original Name",
        email: "original@example.com",
        role: "user",
      });

      // Call the API
      const result = await base44.auth.updateMe(updateData);

      // Verify the response - auth methods return data directly, not wrapped
      expect(result).toEqual(updatedUser);
      expect(result.name).toBe("Updated Name");
      expect(result.email).toBe("updated@example.com");
      expect(platform.requests.last("auth.updateMe").body).toEqual(updateData);
    });

    test("should handle validation errors", async () => {
      const invalidData = {
        email: "invalid-email",
      };

      authenticate({ id: "user-123", email: "valid@example.com" });
      platform.given.app(appId).faults.auth.rejectedUpdate("test-access-token");

      // Call the API and expect an error
      await expect(base44.auth.updateMe(invalidData)).rejects.toMatchObject({
        status: 400,
        message: "Invalid email format",
      });
      expect(platform.requests.last("auth.updateMe").body).toEqual(invalidData);
    });
  });

  describe("login()", () => {
    test("should throw error when not in browser environment", () => {
      // Mock window as undefined to simulate non-browser environment
      const originalWindow = global.window;
      delete global.window;

      expect(() => {
        base44.auth.redirectToLogin("/dashboard");
      }).toThrow("Login method can only be used in a browser environment");

      // Restore window
      global.window = originalWindow;
    });

    test("should redirect to login page with correct URL in browser environment", () => {
      // Mock window object
      const mockLocation = { href: "" };
      const originalWindow = global.window;
      global.window = {
        location: mockLocation,
      };

      const nextUrl = "https://example.com/dashboard";
      base44.auth.redirectToLogin(nextUrl);

      // Verify the redirect URL was set correctly
      expect(mockLocation.href).toBe(
        `${appBaseUrl}/login?from_url=${encodeURIComponent(nextUrl)}`,
      );

      // Restore window
      global.window = originalWindow;
    });

    test("should use current URL when nextUrl is not provided", () => {
      // Mock window object
      const currentUrl = "https://example.com/current-page";
      const mockLocation = { href: currentUrl };
      const originalWindow = global.window;
      global.window = {
        location: mockLocation,
      };

      base44.auth.redirectToLogin();

      // Verify the redirect URL uses current URL
      expect(mockLocation.href).toBe(
        `${appBaseUrl}/login?from_url=${encodeURIComponent(currentUrl)}`,
      );

      // Restore window
      global.window = originalWindow;
    });

    test("should use appBaseUrl for login redirect when provided", () => {
      const customAppBaseUrl = "https://custom-app.example.com";
      const clientWithCustomUrl = createClient({
        serverUrl,
        appId,
        appBaseUrl: customAppBaseUrl,
      });

      // Mock window.location
      const originalWindow = global.window;
      const mockLocation = { href: "" };
      global.window = {
        location: mockLocation,
      };

      const nextUrl = "https://example.com/dashboard";
      clientWithCustomUrl.auth.redirectToLogin(nextUrl);

      // Verify the redirect URL uses the custom appBaseUrl
      expect(mockLocation.href).toBe(
        `${customAppBaseUrl}/login?from_url=${encodeURIComponent(nextUrl)}`,
      );

      // Restore window
      global.window = originalWindow;
    });

    test("should use relative URL for login redirect when appBaseUrl is not provided", () => {
      // Create a client without appBaseUrl
      const clientWithoutAppBaseUrl = createClient({
        serverUrl,
        appId,
      });

      // Mock window.location
      const originalWindow = global.window;
      const mockLocation = { href: "", origin: "https://current-app.com" };
      global.window = {
        location: mockLocation,
      };

      const nextUrl = "https://example.com/dashboard";
      clientWithoutAppBaseUrl.auth.redirectToLogin(nextUrl);

      // Verify the redirect URL uses a relative path (no appBaseUrl prefix)
      expect(mockLocation.href).toBe(
        `/login?from_url=${encodeURIComponent(nextUrl)}`,
      );

      // Restore window
      global.window = originalWindow;
    });
  });

  describe("logout()", () => {
    test("should remove token from axios headers", async () => {
      authenticate(
        {
          id: "user-123",
          email: "test@example.com",
        },
        "test-token",
      );

      // Verify token is set by making a request
      await base44.auth.me();
      expect(platform.requests.last("auth.me").headers.authorization).toBe(
        "Bearer test-token",
      );

      // Call logout
      base44.auth.logout();

      // Verify no Authorization header is sent after logout (should throw 401)
      await expect(base44.auth.me()).rejects.toThrow();
      expect(
        platform.requests.last("auth.me").headers.authorization,
      ).toBeUndefined();
    });

    test("should remove token from localStorage in browser environment", async () => {
      // Mock window and localStorage
      const mockLocalStorage = {
        removeItem: vi.fn(),
        getItem: vi.fn(),
        setItem: vi.fn(),
        clear: vi.fn(),
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          reload: vi.fn(),
        },
      };

      // Set a token to localStorage first
      base44.auth.setToken("test-token", true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "base44_access_token",
        "test-token",
      );

      // Call logout
      base44.auth.logout();

      // Verify token was removed from localStorage
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        "base44_access_token",
      );
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith("token");

      // Restore window
      global.window = originalWindow;
    });

    test("should handle localStorage errors gracefully", async () => {
      // Mock window and localStorage with error
      const mockLocalStorage = {
        removeItem: vi.fn().mockImplementation(() => {
          throw new Error("localStorage error");
        }),
      };
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          reload: vi.fn(),
        },
      };

      // Call logout - should not throw
      base44.auth.logout();

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to remove token from localStorage:",
        expect.any(Error),
      );

      // Restore
      consoleSpy.mockRestore();
      global.window = originalWindow;
    });

    test("should redirect to specified URL after logout", async () => {
      // Mock window object
      const mockLocation = { href: "" };
      const originalWindow = global.window;
      global.window = {
        location: mockLocation,
      };

      const redirectUrl = "https://example.com/logout-success";
      base44.auth.logout(redirectUrl);

      // Verify redirect to server-side logout endpoint with from_url parameter
      const expectedUrl = `${appBaseUrl}/api/apps/auth/logout?from_url=${encodeURIComponent(redirectUrl)}`;
      expect(mockLocation.href).toBe(expectedUrl);

      // Restore window
      global.window = originalWindow;
    });

    test("should redirect to logout endpoint when no redirect URL is provided", async () => {
      // Mock window object
      const mockLocation = { href: "https://example.com/current-page" };
      const originalWindow = global.window;
      global.window = {
        location: mockLocation,
      };

      // Call logout without redirect URL
      base44.auth.logout();

      // Verify redirect to server-side logout endpoint with current page as from_url
      const expectedUrl = `${appBaseUrl}/api/apps/auth/logout?from_url=${encodeURIComponent("https://example.com/current-page")}`;
      expect(mockLocation.href).toBe(expectedUrl);

      // Restore window
      global.window = originalWindow;
    });
  });

  describe("setToken()", () => {
    test("should set token in axios headers", async () => {
      const token = "test-access-token";

      base44.auth.setToken(token, false);

      platform.given.app(appId).auth.principal(token, {
        id: "user-123",
        email: "test@example.com",
      });

      // Verify token is set by making a request
      await base44.auth.me();
      expect(platform.requests.last("auth.me").headers.authorization).toBe(
        `Bearer ${token}`,
      );
    });

    test("should save token to localStorage when requested", () => {
      // Mock window and localStorage
      const mockLocalStorage = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
      };

      const token = "test-access-token";
      base44.auth.setToken(token, true);

      // Verify token was saved to localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "base44_access_token",
        token,
      );

      // Restore window
      global.window = originalWindow;
    });

    test("should not save token to localStorage when not requested", () => {
      // Mock window and localStorage
      const mockLocalStorage = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
      };

      const token = "test-access-token";
      base44.auth.setToken(token, false);

      // Verify token was not saved to localStorage
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

      // Restore window
      global.window = originalWindow;
    });

    test("should handle empty token gracefully", async () => {
      base44.auth.setToken("", false);

      // Verify no Authorization header is sent (should throw 401)
      await expect(base44.auth.me()).rejects.toThrow();
      expect(
        platform.requests.last("auth.me").headers.authorization,
      ).toBeUndefined();
    });

    test("should handle localStorage errors gracefully", () => {
      // Mock window and localStorage with error
      const mockLocalStorage = {
        setItem: vi.fn().mockImplementation(() => {
          throw new Error("localStorage error");
        }),
      };
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
      };

      const token = "test-access-token";
      base44.auth.setToken(token, true);

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to save token to localStorage:",
        expect.any(Error),
      );

      // Restore
      consoleSpy.mockRestore();
      global.window = originalWindow;
    });
  });

  describe("loginViaEmailPassword()", () => {
    test("should login successfully with email and password", async () => {
      const loginData = {
        email: "test@example.com",
        password: "password123",
      };

      const mockResponse = {
        access_token: "test-access-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
        },
      };

      platform.given.app(appId).auth.account({
        email: loginData.email,
        password: loginData.password,
        accessToken: mockResponse.access_token,
        user: mockResponse.user,
      });

      // Call the API
      const result = await base44.auth.loginViaEmailPassword(
        loginData.email,
        loginData.password,
      );

      // Verify the response
      expect(result.access_token).toBe("test-access-token");
      expect(result.user.email).toBe("test@example.com");
      expect(platform.requests.last("auth.login").body).toEqual(loginData);

      // Verify token was set in axios headers by making a subsequent request
      await base44.auth.me();
      expect(platform.requests.last("auth.me").headers.authorization).toBe(
        "Bearer test-access-token",
      );
    });

    test("should login with turnstile token when provided", async () => {
      const loginData = {
        email: "test@example.com",
        password: "password123",
        turnstile_token: "turnstile-token-123",
      };

      const mockResponse = {
        access_token: "test-access-token",
        user: {
          id: "user-123",
          email: "test@example.com",
        },
      };

      platform.given.app(appId).auth.account({
        email: loginData.email,
        password: loginData.password,
        accessToken: mockResponse.access_token,
        user: mockResponse.user,
      });

      // Call the API
      const result = await base44.auth.loginViaEmailPassword(
        loginData.email,
        loginData.password,
        loginData.turnstile_token,
      );

      // Verify the response
      expect(result.access_token).toBe("test-access-token");
      expect(platform.requests.last("auth.login").body).toEqual(loginData);

      // Verify token was set in axios headers by making a subsequent request
      await base44.auth.me();
      expect(platform.requests.last("auth.me").headers.authorization).toBe(
        "Bearer test-access-token",
      );
    });

    test("preserves the platform invalid-credentials response", async () => {
      const loginData = {
        email: "test@example.com",
        password: "wrongpassword",
      };

      platform.given.app(appId).faults.auth.invalidCredentials(loginData.email);

      // Set a token first to test logout
      base44.auth.setToken("existing-token", false);

      // Call the API and expect an error
      await expect(
        base44.auth.loginViaEmailPassword(loginData.email, loginData.password),
      ).rejects.toMatchObject({
        status: 400,
        message: "Invalid credentials",
      });
      expect(platform.requests.last("auth.login").body).toEqual(loginData);
    });

    test("should handle network errors", async () => {
      const loginData = {
        email: "test@example.com",
        password: "password123",
      };

      platform.given
        .app(appId)
        .faults.auth.networkUnavailableLogin(loginData.email);

      // Call the API and expect an error
      await expect(
        base44.auth.loginViaEmailPassword(loginData.email, loginData.password),
      ).rejects.toThrow();
      expect(platform.requests.last("auth.login").body).toEqual(loginData);
    });
  });

  describe("isAuthenticated()", () => {
    test("should return true when token is valid", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      authenticate(mockUser);

      // Call the API
      const result = await base44.auth.isAuthenticated();

      // Verify the response
      expect(result).toBe(true);
    });

    test("should return false when token is invalid", async () => {
      // Call the API
      const result = await base44.auth.isAuthenticated();

      // Verify the response
      expect(result).toBe(false);
    });

    test("should return false on network errors", async () => {
      base44.auth.setToken("network-token", false);
      platform.given
        .app(appId)
        .auth.principal("network-token", { id: "user-123" });
      platform.given
        .app(appId)
        .faults.auth.networkUnavailableMe("network-token");

      // Call the API
      const result = await base44.auth.isAuthenticated();

      // Verify the response
      expect(result).toBe(false);
    });
  });

  describe("loginWithProvider()", () => {
    test("should redirect to google login URL by default", () => {
      const originalWindow = global.window;
      const mockLocation = { href: "", origin: "https://myapp.com" };
      const win = { location: mockLocation };
      win.parent = win; // not in iframe
      global.window = win;

      base44.auth.loginWithProvider("google", "/dashboard");

      expect(mockLocation.href).toContain(`${appBaseUrl}/api/apps/auth/login?`);
      expect(mockLocation.href).toContain(`app_id=${appId}`);
      expect(mockLocation.href).toContain("from_url=");

      global.window = originalWindow;
    });

    test("should include provider path for non-google providers", () => {
      const originalWindow = global.window;
      const mockLocation = { href: "", origin: "https://myapp.com" };
      const win = { location: mockLocation };
      win.parent = win;
      global.window = win;

      base44.auth.loginWithProvider("microsoft", "/dashboard");

      expect(mockLocation.href).toContain("/api/apps/auth/microsoft/login?");

      global.window = originalWindow;
    });

    test("should use SSO URL structure for sso provider", () => {
      const originalWindow = global.window;
      const mockLocation = { href: "", origin: "https://myapp.com" };
      const win = { location: mockLocation };
      win.parent = win;
      global.window = win;

      base44.auth.loginWithProvider("sso", "/dashboard");

      expect(mockLocation.href).toContain(`/api/apps/${appId}/auth/sso/login?`);

      global.window = originalWindow;
    });

    test("should use popup when inside an iframe", () => {
      const originalWindow = global.window;
      const mockPopup = { closed: false, close: vi.fn() };
      const mockLocation = { href: "", origin: "https://myapp.com" };
      // Simulate iframe: window.parent !== window
      const parentWindow = {};
      global.window = {
        location: mockLocation,
        parent: parentWindow,
        screenX: 0,
        screenY: 0,
        outerWidth: 1024,
        outerHeight: 768,
        open: vi.fn().mockReturnValue(mockPopup),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      base44.auth.loginWithProvider("google", "/dashboard");

      // Should NOT have redirected
      expect(mockLocation.href).toBe("");
      // Should have opened a popup
      expect(global.window.open).toHaveBeenCalledTimes(1);
      const openCall = global.window.open.mock.calls[0];
      expect(openCall[0]).toContain("popup_origin=");
      expect(openCall[1]).toBe("base44_auth");

      global.window = originalWindow;
    });

    test("should not use popup when not inside an iframe", () => {
      const originalWindow = global.window;
      const mockLocation = { href: "", origin: "https://myapp.com" };
      // window.parent === window (not in iframe)
      const win = { location: mockLocation, open: vi.fn() };
      win.parent = win;
      global.window = win;

      base44.auth.loginWithProvider("google", "/dashboard");

      // Should have redirected directly
      expect(mockLocation.href).toContain(`${appBaseUrl}/api/apps/auth/login?`);
      // Should NOT have opened a popup
      expect(global.window.open).not.toHaveBeenCalled();

      global.window = originalWindow;
    });

    test("should handle popup being blocked by browser", () => {
      const originalWindow = global.window;
      const mockLocation = { href: "", origin: "https://myapp.com" };
      const parentWindow = {};
      global.window = {
        location: mockLocation,
        parent: parentWindow,
        screenX: 0,
        screenY: 0,
        outerWidth: 1024,
        outerHeight: 768,
        open: vi.fn().mockReturnValue(null), // popup blocked
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      // Should not throw
      expect(() => {
        base44.auth.loginWithProvider("google", "/dashboard");
      }).not.toThrow();

      global.window = originalWindow;
    });

    test("should redirect on postMessage with valid token from popup", () => {
      const originalWindow = global.window;
      const mockPopup = { closed: false, close: vi.fn() };
      const mockLocation = { href: "", origin: "https://myapp.com" };
      const parentWindow = {};
      let messageHandler;
      global.window = {
        location: mockLocation,
        parent: parentWindow,
        screenX: 0,
        screenY: 0,
        outerWidth: 1024,
        outerHeight: 768,
        open: vi.fn().mockReturnValue(mockPopup),
        addEventListener: vi.fn((event, handler) => {
          if (event === "message") messageHandler = handler;
        }),
        removeEventListener: vi.fn(),
      };

      base44.auth.loginWithProvider("google", "/callback");

      // Simulate postMessage from popup
      messageHandler({
        origin: "https://myapp.com",
        source: mockPopup,
        data: { access_token: "test-token-123", is_new_user: true },
      });

      // Should redirect with token params
      expect(mockLocation.href).toContain("access_token=test-token-123");
      expect(mockLocation.href).toContain("is_new_user=true");
      // Popup should be closed
      expect(mockPopup.close).toHaveBeenCalled();

      global.window = originalWindow;
    });

    test("should ignore postMessage from wrong origin", () => {
      const originalWindow = global.window;
      const mockPopup = { closed: false, close: vi.fn() };
      const mockLocation = { href: "", origin: "https://myapp.com" };
      const parentWindow = {};
      let messageHandler;
      global.window = {
        location: mockLocation,
        parent: parentWindow,
        screenX: 0,
        screenY: 0,
        outerWidth: 1024,
        outerHeight: 768,
        open: vi.fn().mockReturnValue(mockPopup),
        addEventListener: vi.fn((event, handler) => {
          if (event === "message") messageHandler = handler;
        }),
        removeEventListener: vi.fn(),
      };

      base44.auth.loginWithProvider("google", "/callback");

      // Simulate postMessage from wrong origin
      messageHandler({
        origin: "https://evil.com",
        source: mockPopup,
        data: { access_token: "stolen-token" },
      });

      // Should NOT have redirected
      expect(mockLocation.href).toBe("");
      expect(mockPopup.close).not.toHaveBeenCalled();

      global.window = originalWindow;
    });

    test("should ignore postMessage from wrong source", () => {
      const originalWindow = global.window;
      const mockPopup = { closed: false, close: vi.fn() };
      const mockLocation = { href: "", origin: "https://myapp.com" };
      const parentWindow = {};
      let messageHandler;
      global.window = {
        location: mockLocation,
        parent: parentWindow,
        screenX: 0,
        screenY: 0,
        outerWidth: 1024,
        outerHeight: 768,
        open: vi.fn().mockReturnValue(mockPopup),
        addEventListener: vi.fn((event, handler) => {
          if (event === "message") messageHandler = handler;
        }),
        removeEventListener: vi.fn(),
      };

      base44.auth.loginWithProvider("google", "/callback");

      // Simulate postMessage from correct origin but different source
      messageHandler({
        origin: "https://myapp.com",
        source: {}, // not the popup
        data: { access_token: "stolen-token" },
      });

      // Should NOT have redirected
      expect(mockLocation.href).toBe("");
      expect(mockPopup.close).not.toHaveBeenCalled();

      global.window = originalWindow;
    });
  });
});
