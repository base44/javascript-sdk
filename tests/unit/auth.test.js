import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/index.ts';

describe('Auth Module', () => {
  let base44;
  let scope;
  const appId = 'test-app-id';
  const serverUrl = 'https://api.base44.com';
  
  beforeEach(() => {
    // Create a new client for each test
    base44 = createClient({
      serverUrl,
      appId,
    });
    
    // Create a nock scope for mocking API calls
    scope = nock(serverUrl);
    
    // Enable request debugging for Nock
    nock.disableNetConnect();
    nock.emitter.on('no match', (req) => {
      console.log(`Nock: No match for ${req.method} ${req.path}`);
      console.log('Headers:', req.getHeaders());
    });
  });
  
  afterEach(() => {
    // Clean up any pending mocks
    nock.cleanAll();
    nock.emitter.removeAllListeners('no match');
    nock.enableNetConnect();
    
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
      
      // Mock the API response
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .reply(200, mockUser);
        
      // Call the API
      const result = await base44.auth.me();
      
      // Verify the response - auth methods return data directly, not wrapped
      expect(result).toEqual(mockUser);
      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
    
    test('should handle authentication errors', async () => {
      // Mock the API error response
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .reply(401, { detail: 'Unauthorized' });
        
      // Call the API and expect an error
      await expect(base44.auth.me()).rejects.toThrow();
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
  });
  
  describe('updateMe()', () => {
    test('should update current user data', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };
      
      const updatedUser = {
        id: 'user-123',
        ...updateData,
        role: 'user'
      };
      
      // Mock the API response
      scope.put(`/api/apps/${appId}/entities/User/me`, updateData)
        .reply(200, updatedUser);
        
      // Call the API
      const result = await base44.auth.updateMe(updateData);
      
      // Verify the response - auth methods return data directly, not wrapped
      expect(result).toEqual(updatedUser);
      expect(result.name).toBe('Updated Name');
      expect(result.email).toBe('updated@example.com');
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
    
    test('should handle validation errors', async () => {
      const invalidData = {
        email: 'invalid-email'
      };
      
      // Mock the API error response
      scope.put(`/api/apps/${appId}/entities/User/me`, invalidData)
        .reply(400, { detail: 'Invalid email format' });
        
      // Call the API and expect an error
      await expect(base44.auth.updateMe(invalidData)).rejects.toThrow();
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
  });
  
  describe('login()', () => {
    test('should throw error when not in browser environment', () => {
      // Mock window as undefined to simulate non-browser environment
      const originalWindow = global.window;
      delete global.window;
      
      expect(() => {
        base44.auth.redirectToLogin('/dashboard');
      }).toThrow('Login method can only be used in a browser environment');
      
      // Restore window
      global.window = originalWindow;
    });
    
    test('should redirect to login page with correct URL in browser environment', () => {
      // Mock window object
      const mockLocation = { href: '' };
      const originalWindow = global.window;
      global.window = {
        location: mockLocation
      };
      
      const nextUrl = 'https://example.com/dashboard';
      base44.auth.redirectToLogin(nextUrl);
      
      // Verify the redirect URL was set correctly
      expect(mockLocation.href).toBe(
        `${serverUrl}/login?from_url=${encodeURIComponent(nextUrl)}&app_id=${appId}`
      );
      
      // Restore window
      global.window = originalWindow;
    });
    
    test('should use current URL when nextUrl is not provided', () => {
      // Mock window object
      const currentUrl = 'https://example.com/current-page';
      const mockLocation = { href: currentUrl };
      const originalWindow = global.window;
      global.window = {
        location: mockLocation
      };
      
      base44.auth.redirectToLogin();
      
      // Verify the redirect URL uses current URL
      expect(mockLocation.href).toBe(
        `${serverUrl}/login?from_url=${encodeURIComponent(currentUrl)}&app_id=${appId}`
      );
      
      // Restore window
      global.window = originalWindow;
    });
  });
  
  describe('logout()', () => {
    test('should remove token from axios headers', async () => {
      // Set a token first
      base44.auth.setToken('test-token', false);
      
      // Mock the API response for me() call
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Verify token is set by making a request
      await base44.auth.me();
      expect(scope.isDone()).toBe(true);
      
      // Call logout
      base44.auth.logout();
      
      // Mock another me() call to verify no Authorization header is sent
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', (val) => !val) // Should not have Authorization header
        .reply(401, { detail: 'Unauthorized' });
      
      // Verify no Authorization header is sent after logout (should throw 401)
      await expect(base44.auth.me()).rejects.toThrow();
      expect(scope.isDone()).toBe(true);
    });
    
    test('should remove token from localStorage in browser environment', async () => {
      // Mock window and localStorage
      const mockLocalStorage = {
        removeItem: vi.fn(),
        getItem: vi.fn(),
        setItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          reload: vi.fn()
        }
      };
      
      // Set a token to localStorage first
      base44.auth.setToken('test-token', true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('base44_access_token', 'test-token');
      
      // Call logout
      base44.auth.logout();
      
      // Verify token was removed from localStorage
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('base44_access_token');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
      
      // Restore window
      global.window = originalWindow;
    });
    
    test('should handle localStorage errors gracefully', async () => {
      // Mock window and localStorage with error
      const mockLocalStorage = {
        removeItem: vi.fn().mockImplementation(() => {
          throw new Error('localStorage error');
        })
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          reload: vi.fn()
        }
      };
      
      // Call logout - should not throw
      base44.auth.logout();
      
      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith('Failed to remove token from localStorage:', expect.any(Error));
      
      // Restore
      consoleSpy.mockRestore();
      global.window = originalWindow;
    });
    
    test('should redirect to specified URL after logout', async () => {
      // Mock window object
      const mockLocation = { href: '' };
      const originalWindow = global.window;
      global.window = {
        location: mockLocation
      };
      
      const redirectUrl = 'https://example.com/logout-success';
      base44.auth.logout(redirectUrl);
      
      // Verify redirect
      expect(mockLocation.href).toBe(redirectUrl);
      
      // Restore window
      global.window = originalWindow;
    });
    
    test('should reload page when no redirect URL is provided', async () => {
      // Mock window object with reload function
      const mockReload = vi.fn();
      const originalWindow = global.window;
      global.window = {
        location: {
          reload: mockReload
        }
      };
      
      // Call logout without redirect URL
      base44.auth.logout();
      
      // Verify page reload was called
      expect(mockReload).toHaveBeenCalledTimes(1);
      
      // Restore window
      global.window = originalWindow;
    });
  });
  
  describe('setToken()', () => {
    test('should set token in axios headers', async () => {
      const token = 'test-access-token';
      
      base44.auth.setToken(token, false);
      
      // Mock the API response for me() call
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Verify token is set by making a request
      await base44.auth.me();
      expect(scope.isDone()).toBe(true);
    });
    
    test('should save token to localStorage when requested', () => {
      // Mock window and localStorage
      const mockLocalStorage = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage
      };
      
      const token = 'test-access-token';
      base44.auth.setToken(token, true);
      
      // Verify token was saved to localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('base44_access_token', token);
      
      // Restore window
      global.window = originalWindow;
    });
    
    test('should not save token to localStorage when not requested', () => {
      // Mock window and localStorage
      const mockLocalStorage = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage
      };
      
      const token = 'test-access-token';
      base44.auth.setToken(token, false);
      
      // Verify token was not saved to localStorage
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
      
      // Restore window
      global.window = originalWindow;
    });
    
    test('should handle empty token gracefully', async () => {
      base44.auth.setToken('', false);
      
      // Mock the API response for me() call
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', (val) => !val) // Should not have Authorization header
        .reply(401, { detail: 'Unauthorized' });
      
      // Verify no Authorization header is sent (should throw 401)
      await expect(base44.auth.me()).rejects.toThrow();
      expect(scope.isDone()).toBe(true);
    });
    
    test('should handle localStorage errors gracefully', () => {
      // Mock window and localStorage with error
      const mockLocalStorage = {
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('localStorage error');
        })
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage
      };
      
      const token = 'test-access-token';
      base44.auth.setToken(token, true);
      
      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save token to localStorage:', expect.any(Error));
      
      // Restore
      consoleSpy.mockRestore();
      global.window = originalWindow;
    });
  });
  
  describe('loginViaEmailPassword()', () => {
    test('should login successfully with email and password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      const mockResponse = {
        access_token: 'test-access-token',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        }
      };
      
      // Mock the API response
      scope.post(`/api/apps/${appId}/auth/login`, loginData)
        .reply(200, mockResponse);
        
      // Call the API
      const result = await base44.auth.loginViaEmailPassword(
        loginData.email,
        loginData.password
      );
      
      // Verify the response
      expect(result.access_token).toBe('test-access-token');
      expect(result.user.email).toBe('test@example.com');
      
      // Verify token was set in axios headers by making a subsequent request
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', 'Bearer test-access-token')
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      await base44.auth.me();
      expect(scope.isDone()).toBe(true);
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
    
    test('should login with turnstile token when provided', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
        turnstile_token: 'turnstile-token-123'
      };
      
      const mockResponse = {
        access_token: 'test-access-token',
        user: {
          id: 'user-123',
          email: 'test@example.com'
        }
      };
      
      // Mock the API response
      scope.post(`/api/apps/${appId}/auth/login`, loginData)
        .reply(200, mockResponse);
        
      // Call the API
      const result = await base44.auth.loginViaEmailPassword(
        loginData.email,
        loginData.password,
        loginData.turnstile_token
      );
      
      // Verify the response
      expect(result.access_token).toBe('test-access-token');
      
      // Verify token was set in axios headers by making a subsequent request
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', 'Bearer test-access-token')
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      await base44.auth.me();
      expect(scope.isDone()).toBe(true);
    });
    
    test('should handle authentication errors and logout', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };
      
      // Mock the API error response
      scope.post(`/api/apps/${appId}/auth/login`, loginData)
        .reply(401, { detail: 'Invalid credentials' });
        
      // Set a token first to test logout
      base44.auth.setToken('existing-token', false);
      
      // Call the API and expect an error
      await expect(
        base44.auth.loginViaEmailPassword(loginData.email, loginData.password)
      ).rejects.toThrow();
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
    
    test('should handle network errors', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      // Mock network error
      scope.post(`/api/apps/${appId}/auth/login`, loginData)
        .replyWithError('Network error');
        
      // Call the API and expect an error
      await expect(
        base44.auth.loginViaEmailPassword(loginData.email, loginData.password)
      ).rejects.toThrow();
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
  });
  
  describe('isAuthenticated()', () => {
    test('should return true when token is valid', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      };
      
      // Mock the API response
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .reply(200, mockUser);
        
      // Call the API
      const result = await base44.auth.isAuthenticated();
      
      // Verify the response
      expect(result).toBe(true);
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
    
    test('should return false when token is invalid', async () => {
      // Mock the API error response
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .reply(401, { detail: 'Unauthorized' });
        
      // Call the API
      const result = await base44.auth.isAuthenticated();
      
      // Verify the response
      expect(result).toBe(false);
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
    
    test('should return false on network errors', async () => {
      // Mock network error
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .replyWithError('Network error');
        
      // Call the API
      const result = await base44.auth.isAuthenticated();
      
      // Verify the response
      expect(result).toBe(false);
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
  });
}); 