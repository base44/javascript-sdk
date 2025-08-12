import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/index.ts';

describe('Authorization Headers', () => {
  let scope;
  const appId = 'test-app-id';
  const serverUrl = 'https://api.base44.com';
  
  beforeEach(() => {
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

  describe('Manual Token Provision', () => {
    test('should send Authorization header when token is provided manually during client creation', async () => {
      const token = 'manual-test-token';
      
      // Create client with manual token
      const base44 = createClient({
        serverUrl,
        appId,
        token
      });
      
      // Mock the API response and expect Authorization header
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Call an auth method
      await base44.auth.me();
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should send Authorization header when token is set after client creation', async () => {
      const token = 'manual-set-token';
      
      // Create client without token
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Set token manually
      base44.auth.setToken(token, false);
      
      // Mock the API response and expect Authorization header
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Call an auth method
      await base44.auth.me();
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should update Authorization header when token is changed', async () => {
      const firstToken = 'first-token';
      const secondToken = 'second-token';
      
      // Create client with initial token
      const base44 = createClient({
        serverUrl,
        appId,
        token: firstToken
      });
      
      // Mock first request with first token
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${firstToken}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Call API with first token
      await base44.auth.me();
      
      // Change token
      base44.auth.setToken(secondToken, false);
      
      // Mock second request with second token
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${secondToken}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Call API with second token
      await base44.auth.me();
      
      // Verify all mocks were called
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('Token from Local Storage and URL', () => {
    test('should send Authorization header when token is retrieved from localStorage', async () => {
      const token = 'localStorage-token';
      
      // Mock localStorage
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(token),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          search: '',
          pathname: '/',
          hash: ''
        },
        history: {
          replaceState: vi.fn()
        },
        document: {
          title: 'Test Page'
        }
      };
      
      // Create client (should pick up token from localStorage)
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Mock the API response and expect Authorization header
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Call an auth method
      await base44.auth.me();
      
      // Verify localStorage was called
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('base44_access_token');
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
      
      // Restore window
      global.window = originalWindow;
    });
    
    test('should send Authorization header when token is retrieved from URL parameters', async () => {
      const token = 'url-token';
      
      // Mock window with URL parameters
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      const originalDocument = global.document;
      
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          search: `?access_token=${token}&other_param=value`,
          pathname: '/dashboard',
          hash: '#section1'
        },
        history: {
          replaceState: vi.fn()
        }
      };
      
      global.document = {
        title: 'Test Page'
      };
      
      // Create client (should pick up token from URL)
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Mock the API response and expect Authorization header
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Call an auth method
      await base44.auth.me();
      
      // Verify token was saved to localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('base44_access_token', token);
      
      // Verify URL was cleaned (token removed)
      expect(global.window.history.replaceState).toHaveBeenCalledWith(
        {},
        'Test Page',
        '/dashboard?other_param=value#section1'
      );
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
      
      // Restore window and document
      global.window = originalWindow;
      global.document = originalDocument;
    });
    
    test('should prioritize URL token over localStorage token', async () => {
      const localStorageToken = 'localStorage-token';
      const urlToken = 'url-token';
      
      // Mock window with both localStorage and URL token
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(localStorageToken),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          search: `?access_token=${urlToken}`,
          pathname: '/',
          hash: ''
        },
        history: {
          replaceState: vi.fn()
        },
        document: {
          title: 'Test Page'
        }
      };
      
      // Create client (should pick up token from URL, not localStorage)
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Mock the API response and expect URL token, not localStorage token
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${urlToken}`)
        .reply(200, { id: 'user-123', email: 'test@example.com' });
      
      // Call an auth method
      await base44.auth.me();
      
      // Verify URL token was saved to localStorage (overriding the old one)
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('base44_access_token', urlToken);
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
      
      // Restore window
      global.window = originalWindow;
    });
  });

  describe('Authorization Headers in Function Invocations', () => {
    test('should send Authorization header in function invocations when token is set', async () => {
      const token = 'function-test-token';
      const functionName = 'testFunction';
      const functionData = { param1: 'value1', param2: 'value2' };
      
      // Create client with token
      const base44 = createClient({
        serverUrl,
        appId,
        token
      });
      
      // Mock the API response for function invocation and expect Authorization header
      scope.post(`/api/apps/${appId}/functions/${functionName}`, functionData)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { success: true, result: 'function executed' });
      
      // Call a function
      await base44.functions.invoke(functionName, functionData);
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should send Authorization header in function invocations with file uploads', async () => {
      const token = 'function-file-token';
      const functionName = 'uploadFunction';
      
      // Create a mock file
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const functionData = { file: mockFile, description: 'test upload' };
      
      // Create client with token
      const base44 = createClient({
        serverUrl,
        appId,
        token
      });
      
      // Mock the API response for function invocation with file upload
      scope.post(`/api/apps/${appId}/functions/${functionName}`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .matchHeader('Content-Type', /multipart\/form-data/)
        .reply(200, { success: true, fileId: 'file-123' });
      
      // Call a function with file upload
      await base44.functions.invoke(functionName, functionData);
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should not send Authorization header in function invocations when token is not set', async () => {
      const functionName = 'testFunction';
      const functionData = { param1: 'value1' };
      
      // Mock empty localStorage to ensure no token is retrieved
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          search: '',
          pathname: '/',
          hash: ''
        },
        history: {
          replaceState: vi.fn()
        }
      };
      
      // Create client without token
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Mock the API response and expect NO Authorization header
      scope.post(`/api/apps/${appId}/functions/${functionName}`, functionData)
        .matchHeader('Authorization', (val) => !val)
        .reply(401, { error: 'Unauthorized' });
      
      // Call a function (should fail with 401)
      await expect(base44.functions.invoke(functionName, functionData)).rejects.toThrow();
      
      // Verify the mock was called
      expect(scope.isDone()).toBe(true);
      
      // Restore window
      global.window = originalWindow;
    });
  });

  describe('Authorization Headers in Integration Endpoints', () => {
    test('should send Authorization header in Core integration endpoints when token is set', async () => {
      const token = 'integration-test-token';
      const endpointName = 'testEndpoint';
      const endpointData = { param1: 'value1', param2: 'value2' };
      
      // Create client with token
      const base44 = createClient({
        serverUrl,
        appId,
        token
      });
      
      // Mock the API response for Core integration endpoint and expect Authorization header
      scope.post(`/api/apps/${appId}/integration-endpoints/Core/${endpointName}`, endpointData)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { success: true, data: 'processed' });
      
      // Call a Core integration endpoint
      await base44.integrations.Core[endpointName](endpointData);
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should send Authorization header in installable package integration endpoints when token is set', async () => {
      const token = 'integration-package-token';
      const packageName = 'TestPackage';
      const endpointName = 'testEndpoint';
      const endpointData = { param1: 'value1', param2: 'value2' };
      
      // Create client with token
      const base44 = createClient({
        serverUrl,
        appId,
        token
      });
      
      // Mock the API response for installable package integration endpoint
      scope.post(`/api/apps/${appId}/integration-endpoints/installable/${packageName}/integration-endpoints/${endpointName}`, endpointData)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { success: true, data: 'processed' });
      
      // Call an installable package integration endpoint
      await base44.integrations[packageName][endpointName](endpointData);
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should send Authorization header in integration endpoints with file uploads', async () => {
      const token = 'integration-file-token';
      const endpointName = 'uploadEndpoint';
      
      // Create a mock file
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const endpointData = { file: mockFile, metadata: { type: 'document' } };
      
      // Create client with token
      const base44 = createClient({
        serverUrl,
        appId,
        token
      });
      
      // Mock the API response for integration endpoint with file upload
      scope.post(`/api/apps/${appId}/integration-endpoints/Core/${endpointName}`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .matchHeader('Content-Type', /multipart\/form-data/)
        .reply(200, { success: true, fileId: 'file-123' });
      
      // Call an integration endpoint with file upload
      await base44.integrations.Core[endpointName](endpointData);
      
      // Verify the mock was called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should not send Authorization header in integration endpoints when token is not set', async () => {
      const endpointName = 'testEndpoint';
      const endpointData = { param1: 'value1' };
      
      // Mock empty localStorage to ensure no token is retrieved
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      };
      const originalWindow = global.window;
      global.window = {
        localStorage: mockLocalStorage,
        location: {
          search: '',
          pathname: '/',
          hash: ''
        },
        history: {
          replaceState: vi.fn()
        }
      };
      
      // Create client without token
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Mock the API response and expect NO Authorization header
      scope.post(`/api/apps/${appId}/integration-endpoints/Core/${endpointName}`, endpointData)
        .matchHeader('Authorization', (val) => !val)
        .reply(401, { error: 'Unauthorized' });
      
      // Call an integration endpoint (should fail with 401)
      await expect(base44.integrations.Core[endpointName](endpointData)).rejects.toThrow();
      
      // Verify the mock was called
      expect(scope.isDone()).toBe(true);
      
      // Restore window
      global.window = originalWindow;
    });
  });

  describe('Token Synchronization Across Modules', () => {
    test('should synchronize token across all modules when set via auth.setToken', async () => {
      const token = 'sync-test-token';
      
      // Create client without initial token
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Set token via auth module
      base44.auth.setToken(token, false);
      
      // Mock responses for all module types
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { id: 'user-123' });
      
      scope.post(`/api/apps/${appId}/functions/testFunction`, { param: 'value' })
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { success: true });
      
      scope.post(`/api/apps/${appId}/integration-endpoints/Core/testEndpoint`, { param: 'value' })
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { success: true });
      
      // Call methods on all modules
      await base44.auth.me();
      await base44.functions.invoke('testFunction', { param: 'value' });
      await base44.integrations.Core.testEndpoint({ param: 'value' });
      
      // Verify all mocks were called with the correct header
      expect(scope.isDone()).toBe(true);
    });
    
    test('should synchronize token across all modules when set via client.setToken', async () => {
      const token = 'client-sync-token';
      
      // Create client without initial token
      const base44 = createClient({
        serverUrl,
        appId
      });
      
      // Set token via client method
      base44.setToken(token);
      
      // Mock responses for all module types
      scope.get(`/api/apps/${appId}/entities/User/me`)
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { id: 'user-123' });
      
      scope.post(`/api/apps/${appId}/functions/testFunction`, { param: 'value' })
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { success: true });
      
      scope.post(`/api/apps/${appId}/integration-endpoints/Core/testEndpoint`, { param: 'value' })
        .matchHeader('Authorization', `Bearer ${token}`)
        .reply(200, { success: true });
      
      // Call methods on all modules
      await base44.auth.me();
      await base44.functions.invoke('testFunction', { param: 'value' });
      await base44.integrations.Core.testEndpoint({ param: 'value' });
      
      // Verify all mocks were called with the correct header
      expect(scope.isDone()).toBe(true);
    });
  });
});