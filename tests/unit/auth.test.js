import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createClient } from '../../src/index.ts';

describe('Auth Module', () => {
  let base44;
  const appId = 'test-app-id';
  const serverUrl = 'https://api.base44.com';
  const appBaseUrl = 'https://api.base44.com';
  const meUrl = `${serverUrl}/api/apps/${appId}/entities/User/me`;
  const loginUrl = `${serverUrl}/api/apps/${appId}/auth/login`;

  beforeEach(() => {
    // Mock window.addEventListener and document for analytics module
    if (typeof window !== 'undefined') {
      if (!window.addEventListener) {
        window.addEventListener = vi.fn();
        window.removeEventListener = vi.fn();
      }
    }
    if (typeof document === 'undefined') {
      global.document = {
        referrer: '',
        visibilityState: 'visible'
      };
    }

    base44 = createClient({ serverUrl, appId, appBaseUrl });
  });

  afterEach(() => {
    base44.cleanup();

    // Clean up localStorage if it exists
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('me()', () => {
    test('should fetch current user information', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      server.use(http.get(meUrl, () => HttpResponse.json(mockUser)));

      const result = await base44.auth.me();

      expect(result).toEqual(mockUser);
      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
    });

    test('should handle authentication errors', async () => {
      server.use(http.get(meUrl, () => HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })));

      await expect(base44.auth.me()).rejects.toThrow();
    });
  });

  describe('updateMe()', () => {
    test('should update current user data', async () => {
      const updateData = { name: 'Updated Name', email: 'updated@example.com' };
      const updatedUser = { id: 'user-123', ...updateData, role: 'user' };

      server.use(http.put(meUrl, () => HttpResponse.json(updatedUser)));

      const result = await base44.auth.updateMe(updateData);

      expect(result).toEqual(updatedUser);
      expect(result.name).toBe('Updated Name');
      expect(result.email).toBe('updated@example.com');
    });

    test('should handle validation errors', async () => {
      server.use(http.put(meUrl, () => HttpResponse.json({ detail: 'Invalid email format' }, { status: 400 })));

      await expect(base44.auth.updateMe({ email: 'invalid-email' })).rejects.toThrow();
    });
  });

  describe('login()', () => {
    test('should throw error when not in browser environment', () => {
      const originalWindow = global.window;
      delete global.window;

      expect(() => {
        base44.auth.redirectToLogin('/dashboard');
      }).toThrow('Login method can only be used in a browser environment');

      global.window = originalWindow;
    });

    test('should redirect to login page with correct URL in browser environment', () => {
      const mockLocation = { href: '' };
      const originalWindow = global.window;
      global.window = { location: mockLocation };

      const nextUrl = 'https://example.com/dashboard';
      base44.auth.redirectToLogin(nextUrl);

      expect(mockLocation.href).toBe(
        `${appBaseUrl}/login?from_url=${encodeURIComponent(nextUrl)}`
      );

      global.window = originalWindow;
    });

    test('should use current URL when nextUrl is not provided', () => {
      const currentUrl = 'https://example.com/current-page';
      const mockLocation = { href: currentUrl };
      const originalWindow = global.window;
      global.window = { location: mockLocation };

      base44.auth.redirectToLogin();

      expect(mockLocation.href).toBe(
        `${appBaseUrl}/login?from_url=${encodeURIComponent(currentUrl)}`
      );

      global.window = originalWindow;
    });

    test('should use appBaseUrl for login redirect when provided', () => {
      const customAppBaseUrl = 'https://custom-app.example.com';
      const clientWithCustomUrl = createClient({ serverUrl, appId, appBaseUrl: customAppBaseUrl });

      const originalWindow = global.window;
      const mockLocation = { href: '' };
      global.window = { location: mockLocation };

      clientWithCustomUrl.auth.redirectToLogin('https://example.com/dashboard');

      expect(mockLocation.href).toBe(
        `${customAppBaseUrl}/login?from_url=${encodeURIComponent('https://example.com/dashboard')}`
      );

      global.window = originalWindow;
    });

    test('should use relative URL for login redirect when appBaseUrl is not provided', () => {
      const clientWithoutAppBaseUrl = createClient({ serverUrl, appId });

      const originalWindow = global.window;
      const mockLocation = { href: '', origin: 'https://current-app.com' };
      global.window = { location: mockLocation };

      clientWithoutAppBaseUrl.auth.redirectToLogin('https://example.com/dashboard');

      expect(mockLocation.href).toBe(
        `/login?from_url=${encodeURIComponent('https://example.com/dashboard')}`
      );

      global.window = originalWindow;
    });
  });

  describe('logout()', () => {
    test('should remove token from axios headers', async () => {
      base44.auth.setToken('test-token', false);

      server.use(
        http.get(meUrl, ({ request }) => {
          if (request.headers.get('Authorization') === 'Bearer test-token') {
            return HttpResponse.json({ id: 'user-123', email: 'test@example.com' });
          }
          return HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 });
        })
      );

      // Token is set — should succeed
      await base44.auth.me();

      base44.auth.logout();

      // After logout no Authorization header — should fail
      await expect(base44.auth.me()).rejects.toThrow();
    });

    test('should remove token from localStorage in browser environment', async () => {
      const mockLocalStorage = {
        removeItem: vi.fn(),
        getItem: vi.fn(),
        setItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: { reload: vi.fn() }
      };

      base44.auth.setToken('test-token', true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('base44_access_token', 'test-token');

      base44.auth.logout();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('base44_access_token');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');

      global.window = originalWindow;
    });

    test('should handle localStorage errors gracefully', async () => {
      const mockLocalStorage = {
        removeItem: vi.fn().mockImplementation(() => {
          throw new Error('localStorage error');
        })
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: { reload: vi.fn() }
      };

      base44.auth.logout();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to remove token from localStorage:', expect.any(Error));

      consoleSpy.mockRestore();
      global.window = originalWindow;
    });

    test('should redirect to specified URL after logout', async () => {
      const mockLocation = { href: '' };
      const originalWindow = global.window;
      global.window = { location: mockLocation };

      const redirectUrl = 'https://example.com/logout-success';
      base44.auth.logout(redirectUrl);

      const expectedUrl = `${appBaseUrl}/api/apps/auth/logout?from_url=${encodeURIComponent(redirectUrl)}`;
      expect(mockLocation.href).toBe(expectedUrl);

      global.window = originalWindow;
    });

    test('should redirect to logout endpoint when no redirect URL is provided', async () => {
      const mockLocation = { href: 'https://example.com/current-page' };
      const originalWindow = global.window;
      global.window = { location: mockLocation };

      base44.auth.logout();

      const expectedUrl = `${appBaseUrl}/api/apps/auth/logout?from_url=${encodeURIComponent('https://example.com/current-page')}`;
      expect(mockLocation.href).toBe(expectedUrl);

      global.window = originalWindow;
    });
  });

  describe('setToken()', () => {
    test('should set token in axios headers', async () => {
      const token = 'test-access-token';
      base44.auth.setToken(token, false);

      let capturedAuth = null;
      server.use(
        http.get(meUrl, ({ request }) => {
          capturedAuth = request.headers.get('Authorization');
          return HttpResponse.json({ id: 'user-123', email: 'test@example.com' });
        })
      );

      await base44.auth.me();
      expect(capturedAuth).toBe(`Bearer ${token}`);
    });

    test('should save token to localStorage when requested', () => {
      const mockLocalStorage = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = { localStorage: mockLocalStorage };

      base44.auth.setToken('test-access-token', true);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('base44_access_token', 'test-access-token');

      global.window = originalWindow;
    });

    test('should not save token to localStorage when not requested', () => {
      const mockLocalStorage = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = { localStorage: mockLocalStorage };

      base44.auth.setToken('test-access-token', false);

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

      global.window = originalWindow;
    });

    test('should handle empty token gracefully', async () => {
      base44.auth.setToken('', false);

      server.use(
        http.get(meUrl, ({ request }) => {
          if (!request.headers.has('Authorization')) {
            return HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json({ id: 'user-123' });
        })
      );

      await expect(base44.auth.me()).rejects.toThrow();
    });

    test('should handle localStorage errors gracefully', () => {
      const mockLocalStorage = {
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('localStorage error');
        })
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalWindow = global.window;
      global.window = { localStorage: mockLocalStorage };

      base44.auth.setToken('test-access-token', true);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to save token to localStorage:', expect.any(Error));

      consoleSpy.mockRestore();
      global.window = originalWindow;
    });
  });

  describe('loginViaEmailPassword()', () => {
    test('should login successfully with email and password', async () => {
      const mockResponse = {
        access_token: 'test-access-token',
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' }
      };

      server.use(
        http.post(loginUrl, () => HttpResponse.json(mockResponse)),
        http.get(meUrl, ({ request }) => {
          if (request.headers.get('Authorization') === 'Bearer test-access-token') {
            return HttpResponse.json({ id: 'user-123', email: 'test@example.com' });
          }
          return HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 });
        })
      );

      const result = await base44.auth.loginViaEmailPassword('test@example.com', 'password123');

      expect(result.access_token).toBe('test-access-token');
      expect(result.user.email).toBe('test@example.com');

      // Token should be set — subsequent me() should succeed
      await base44.auth.me();
    });

    test('should login with turnstile token when provided', async () => {
      let capturedBody = null;
      const mockResponse = {
        access_token: 'test-access-token',
        user: { id: 'user-123', email: 'test@example.com' }
      };

      server.use(
        http.post(loginUrl, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(mockResponse);
        }),
        http.get(meUrl, () => HttpResponse.json({ id: 'user-123', email: 'test@example.com' }))
      );

      const result = await base44.auth.loginViaEmailPassword(
        'test@example.com',
        'password123',
        'turnstile-token-123'
      );

      expect(result.access_token).toBe('test-access-token');
      expect(capturedBody.turnstile_token).toBe('turnstile-token-123');

      await base44.auth.me();
    });

    test('should handle authentication errors and logout', async () => {
      server.use(
        http.post(loginUrl, () => HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 }))
      );

      base44.auth.setToken('existing-token', false);

      await expect(
        base44.auth.loginViaEmailPassword('test@example.com', 'wrongpassword')
      ).rejects.toThrow();
    });

    test('should handle network errors', async () => {
      server.use(http.post(loginUrl, () => HttpResponse.error()));

      await expect(
        base44.auth.loginViaEmailPassword('test@example.com', 'password123')
      ).rejects.toThrow();
    });
  });

  describe('isAuthenticated()', () => {
    test('should return true when token is valid', async () => {
      server.use(http.get(meUrl, () => HttpResponse.json({ id: 'user-123', email: 'test@example.com' })));

      const result = await base44.auth.isAuthenticated();
      expect(result).toBe(true);
    });

    test('should return false when token is invalid', async () => {
      server.use(http.get(meUrl, () => HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })));

      const result = await base44.auth.isAuthenticated();
      expect(result).toBe(false);
    });

    test('should return false on network errors', async () => {
      server.use(http.get(meUrl, () => HttpResponse.error()));

      const result = await base44.auth.isAuthenticated();
      expect(result).toBe(false);
    });
  });
});
