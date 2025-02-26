import nock from 'nock';
import { createClient } from '../../src/index.js';

describe('Entities Module', () => {
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
  });
  
  test('list() should fetch entities with correct parameters', async () => {
    // Mock the API response
    scope.get(`/api/apps/${appId}/entities/Todo`)
      .query(true) // Accept any query parameters
      .reply(200, {
        items: [
          { id: '1', title: 'Task 1', completed: false },
          { id: '2', title: 'Task 2', completed: true }
        ],
        total: 2
      });
      
    // Call the API
    const result = await base44.entities.Todo.list('title', 10, 0, ['id', 'title']);
    
    // Verify the response
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe('Task 1');
    expect(result.total).toBe(2);
    
    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });
  
  test('filter() should send correct query parameters', async () => {
    const filterQuery = { completed: true };
    
    // Mock the API response
    scope.get(`/api/apps/${appId}/entities/Todo`)
      .query(query => {
        // Verify the query contains our filter
        const parsedQ = JSON.parse(query.q);
        return parsedQ.completed === true;
      })
      .reply(200, {
        items: [
          { id: '2', title: 'Task 2', completed: true }
        ],
        total: 1
      });
      
    // Call the API
    const result = await base44.entities.Todo.filter(filterQuery);
    
    // Verify the response
    expect(result.items).toHaveLength(1);
    expect(result.items[0].completed).toBe(true);
    
    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });
  
  test('get() should fetch a single entity', async () => {
    const todoId = '123';
    
    // Mock the API response
    scope.get(`/api/apps/${appId}/entities/Todo/${todoId}`)
      .reply(200, {
        id: todoId,
        title: 'Get milk',
        completed: false
      });
      
    // Call the API
    const todo = await base44.entities.Todo.get(todoId);
    
    // Verify the response
    expect(todo.id).toBe(todoId);
    expect(todo.title).toBe('Get milk');
    
    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });
  
  test('create() should send correct data', async () => {
    const newTodo = {
      title: 'New task',
      completed: false
    };
    
    // Mock the API response
    scope.post(`/api/apps/${appId}/entities/Todo`, newTodo)
      .reply(201, {
        id: '123',
        ...newTodo
      });
      
    // Call the API
    const todo = await base44.entities.Todo.create(newTodo);
    
    // Verify the response
    expect(todo.id).toBe('123');
    expect(todo.title).toBe('New task');
    
    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });
  
  test('update() should send correct data', async () => {
    const todoId = '123';
    const updates = {
      title: 'Updated task',
      completed: true
    };
    
    // Mock the API response
    scope.put(`/api/apps/${appId}/entities/Todo/${todoId}`, updates)
      .reply(200, {
        id: todoId,
        ...updates
      });
      
    // Call the API
    const todo = await base44.entities.Todo.update(todoId, updates);
    
    // Verify the response
    expect(todo.id).toBe(todoId);
    expect(todo.title).toBe('Updated task');
    expect(todo.completed).toBe(true);
    
    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });
  
  test('delete() should call correct endpoint', async () => {
    const todoId = '123';
    
    // Mock the API response
    scope.delete(`/api/apps/${appId}/entities/Todo/${todoId}`)
      .reply(204);
      
    // Call the API
    await base44.entities.Todo.delete(todoId);
    
    // Verify all mocks were called
    expect(scope.isDone()).toBe(true);
  });
}); 