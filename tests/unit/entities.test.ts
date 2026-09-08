import { mockHttp } from "../mocks/http";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import type {
  DeleteResult,
  UpdateManyResult,
} from "../../src/modules/entities.types.ts";

/**
 * Todo entity type for testing.
 */
interface Todo {
  id: string;
  title: string;
  completed: boolean;
  description?: string;
}

// Module augmentation: register Todo type in EntityTypeRegistry
declare module "../../src/modules/entities.types.ts" {
  interface EntityTypeRegistry {
    Todo: Todo;
  }
}

describe("Entities Module", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  beforeEach(() => {
    // Create a new client for each test
    base44 = createClient({
      serverUrl,
      appId,
    });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("list() should fetch entities with correct parameters", async () => {
    const mockTodos: Todo[] = [
      { id: "1", title: "Task 1", completed: false },
      { id: "2", title: "Task 2", completed: true },
    ];

    // Mock the API response
    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/entities/Todo`,
      query: true,
      status: 200,
      response: mockTodos,
    });

    // Call the API
    const result = await base44.entities.Todo.list("title", 10, 0, [
      "id",
      "title",
    ]);

    // Verify the response
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Task 1");
  });

  test("filter() should send correct query parameters", async () => {
    const filterQuery: Partial<Todo> = { completed: true };
    const mockTodos: Todo[] = [{ id: "2", title: "Task 2", completed: true }];

    // Mock the API response
    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/entities/Todo`,
      query: (query) => {
        // Verify the query contains our filter
        const parsedQ = JSON.parse(query.q as string);
        return parsedQ.completed === true;
      },
      status: 200,
      response: mockTodos,
    });

    // Call the API
    const result = await base44.entities.Todo.filter(filterQuery);

    // Verify the response
    expect(result).toHaveLength(1);
    expect(result[0].completed).toBe(true);
  });

  test("filter() should support typed advanced query syntax", async () => {
    const mockTodos: Todo[] = [{ id: "2", title: "Task 2", completed: true }];

    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/entities/Todo`,
      query: (query) => {
        const parsedQ = JSON.parse(query.q as string);

        return (
          parsedQ.title.$in[0] === "Task 1" &&
          parsedQ.title.$in[1] === "Task 2" &&
          parsedQ.description === null &&
          parsedQ.$or[0].title === "Task 2" &&
          parsedQ.$or[1].completed === true
        );
      },
      status: 200,
      response: mockTodos,
    });

    const result = await base44.entities.Todo.filter({
      title: { $in: ["Task 1", "Task 2"] },
      description: null,
      $or: [{ title: "Task 2" }, { completed: true }],
    });

    expect(result).toHaveLength(1);
  });

  test("get() should fetch a single entity", async () => {
    const todoId = "123";
    const mockTodo: Todo = {
      id: todoId,
      title: "Get milk",
      completed: false,
    };

    // Mock the API response
    mockHttp({
      method: "get",
      url: serverUrl + `/api/apps/${appId}/entities/Todo/${todoId}`,
      status: 200,
      response: mockTodo,
    });

    // Call the API
    const todo = await base44.entities.Todo.get(todoId);

    // Verify the response
    expect(todo.id).toBe(todoId);
    expect(todo.title).toBe("Get milk");
  });

  test("create() should send correct data", async () => {
    const newTodo: Partial<Todo> = {
      title: "New task",
      completed: false,
    };
    const createdTodo: Todo = {
      id: "123",
      title: "New task",
      completed: false,
    };

    // Mock the API response
    mockHttp({
      method: "post",
      url: serverUrl + `/api/apps/${appId}/entities/Todo`,
      body: newTodo,
      status: 201,
      response: createdTodo,
    });

    // Call the API
    const todo = await base44.entities.Todo.create(newTodo);

    // Verify the response
    expect(todo.id).toBe("123");
    expect(todo.title).toBe("New task");
  });

  test("update() should send correct data", async () => {
    const todoId = "123";
    const updates: Partial<Todo> = {
      title: "Updated task",
      completed: true,
    };
    const updatedTodo: Todo = {
      id: todoId,
      title: "Updated task",
      completed: true,
    };

    // Mock the API response
    mockHttp({
      method: "put",
      url: serverUrl + `/api/apps/${appId}/entities/Todo/${todoId}`,
      body: updates,
      status: 200,
      response: updatedTodo,
    });

    // Call the API
    const todo = await base44.entities.Todo.update(todoId, updates);

    // Verify the response
    expect(todo.id).toBe(todoId);
    expect(todo.title).toBe("Updated task");
    expect(todo.completed).toBe(true);
  });

  test("delete() should call correct endpoint and return DeleteResult", async () => {
    const todoId = "123";
    const deleteResult: DeleteResult = { success: true };

    // Mock the API response
    mockHttp({
      method: "delete",
      url: serverUrl + `/api/apps/${appId}/entities/Todo/${todoId}`,
      status: 200,
      response: deleteResult,
    });

    // Call the API
    const result = await base44.entities.Todo.delete(todoId);

    // Verify the response matches DeleteResult type
    expect(result.success).toBe(true);
  });

  test("updateMany() should send query and data to correct endpoint", async () => {
    const mockResult: UpdateManyResult = {
      success: true,
      updated: 3,
      has_more: false,
    };

    // Mock the API response
    mockHttp({
      method: "patch",
      url: serverUrl + `/api/apps/${appId}/entities/Todo/update-many`,
      body: {
        query: { completed: false },
        data: { $set: { completed: true } },
      },
      status: 200,
      response: mockResult,
    });

    // Call the API
    const result = await base44.entities.Todo.updateMany(
      { completed: false },
      { $set: { completed: true } },
    );

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.updated).toBe(3);
    expect(result.has_more).toBe(false);
  });

  test("updateMany() should handle has_more response", async () => {
    const mockResult: UpdateManyResult = {
      success: true,
      updated: 500,
      has_more: true,
    };

    // Mock the API response
    mockHttp({
      method: "patch",
      url: serverUrl + `/api/apps/${appId}/entities/Todo/update-many`,
      body: {
        query: {},
        data: { $inc: { view_count: 1 } },
      },
      status: 200,
      response: mockResult,
    });

    // Call the API
    const result = await base44.entities.Todo.updateMany(
      {},
      { $inc: { view_count: 1 } },
    );

    // Verify the response
    expect(result.success).toBe(true);
    expect(result.updated).toBe(500);
    expect(result.has_more).toBe(true);
  });

  test("bulkUpdate() should send array of updates to correct endpoint", async () => {
    const updatePayload = [
      { id: "1", title: "Updated Task 1", completed: true },
      { id: "2", title: "Updated Task 2" },
    ];
    const mockResponse: Todo[] = [
      { id: "1", title: "Updated Task 1", completed: true },
      { id: "2", title: "Updated Task 2", completed: false },
    ];

    // Mock the API response
    mockHttp({
      method: "put",
      url: serverUrl + `/api/apps/${appId}/entities/Todo/bulk`,
      body: updatePayload,
      status: 200,
      response: mockResponse,
    });

    // Call the API
    const result = await base44.entities.Todo.bulkUpdate(updatePayload);

    // Verify the response
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[0].title).toBe("Updated Task 1");
    expect(result[0].completed).toBe(true);
    expect(result[1].id).toBe("2");
    expect(result[1].title).toBe("Updated Task 2");
  });
});
