import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { createClient } from "../../src/index.ts";
import type { DeleteResult, UpdateManyResult } from "../../src/modules/entities.types.ts";

/**
 * Todo entity type for testing.
 */
interface Todo {
  id: string;
  title: string;
  completed: boolean;
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
  const baseUrl = `${serverUrl}/api/apps/${appId}/entities`;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test("list() should fetch entities with correct parameters", async () => {
    const mockTodos: Todo[] = [
      { id: "1", title: "Task 1", completed: false },
      { id: "2", title: "Task 2", completed: true },
    ];

    server.use(
      http.get(`${baseUrl}/Todo`, () => HttpResponse.json(mockTodos))
    );

    const result = await base44.entities.Todo.list("title", 10, 0, ["id", "title"]);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Task 1");
  });

  test("filter() should send correct query parameters", async () => {
    const mockTodos: Todo[] = [{ id: "2", title: "Task 2", completed: true }];

    server.use(
      http.get(`${baseUrl}/Todo`, ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q");
        if (q && JSON.parse(q).completed === true) {
          return HttpResponse.json(mockTodos);
        }
        return HttpResponse.json([], { status: 400 });
      })
    );

    const result = await base44.entities.Todo.filter({ completed: true });

    expect(result).toHaveLength(1);
    expect(result[0].completed).toBe(true);
  });

  test("get() should fetch a single entity", async () => {
    const todoId = "123";
    const mockTodo: Todo = { id: todoId, title: "Get milk", completed: false };

    server.use(
      http.get(`${baseUrl}/Todo/${todoId}`, () => HttpResponse.json(mockTodo))
    );

    const todo = await base44.entities.Todo.get(todoId);

    expect(todo.id).toBe(todoId);
    expect(todo.title).toBe("Get milk");
  });

  test("create() should send correct data", async () => {
    const newTodo: Partial<Todo> = { title: "New task", completed: false };
    const createdTodo: Todo = { id: "123", title: "New task", completed: false };

    server.use(
      http.post(`${baseUrl}/Todo`, () => HttpResponse.json(createdTodo, { status: 201 }))
    );

    const todo = await base44.entities.Todo.create(newTodo);

    expect(todo.id).toBe("123");
    expect(todo.title).toBe("New task");
  });

  test("update() should send correct data", async () => {
    const todoId = "123";
    const updatedTodo: Todo = { id: todoId, title: "Updated task", completed: true };

    server.use(
      http.put(`${baseUrl}/Todo/${todoId}`, () => HttpResponse.json(updatedTodo))
    );

    const todo = await base44.entities.Todo.update(todoId, { title: "Updated task", completed: true });

    expect(todo.id).toBe(todoId);
    expect(todo.title).toBe("Updated task");
    expect(todo.completed).toBe(true);
  });

  test("delete() should call correct endpoint and return DeleteResult", async () => {
    const todoId = "123";
    const deleteResult: DeleteResult = { success: true };

    server.use(
      http.delete(`${baseUrl}/Todo/${todoId}`, () => HttpResponse.json(deleteResult))
    );

    const result = await base44.entities.Todo.delete(todoId);

    expect(result.success).toBe(true);
  });

  test("updateMany() should send query and data to correct endpoint", async () => {
    const mockResult: UpdateManyResult = { success: true, updated: 3, has_more: false };

    server.use(
      http.patch(`${baseUrl}/Todo/update-many`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        expect(body.query).toEqual({ completed: false });
        expect(body.data).toEqual({ $set: { completed: true } });
        return HttpResponse.json(mockResult);
      })
    );

    const result = await base44.entities.Todo.updateMany(
      { completed: false },
      { $set: { completed: true } }
    );

    expect(result.success).toBe(true);
    expect(result.updated).toBe(3);
    expect(result.has_more).toBe(false);
  });

  test("updateMany() should handle has_more response", async () => {
    const mockResult: UpdateManyResult = { success: true, updated: 500, has_more: true };

    server.use(
      http.patch(`${baseUrl}/Todo/update-many`, () => HttpResponse.json(mockResult))
    );

    const result = await base44.entities.Todo.updateMany({}, { $inc: { view_count: 1 } });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(500);
    expect(result.has_more).toBe(true);
  });

  test("bulkUpdate() should send array of updates to correct endpoint", async () => {
    const mockResponse: Todo[] = [
      { id: "1", title: "Updated Task 1", completed: true },
      { id: "2", title: "Updated Task 2", completed: false },
    ];

    server.use(
      http.put(`${baseUrl}/Todo/bulk`, () => HttpResponse.json(mockResponse))
    );

    const result = await base44.entities.Todo.bulkUpdate([
      { id: "1", title: "Updated Task 1", completed: true },
      { id: "2", title: "Updated Task 2" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[0].title).toBe("Updated Task 1");
    expect(result[0].completed).toBe(true);
    expect(result[1].id).toBe("2");
    expect(result[1].title).toBe("Updated Task 2");
  });
});
