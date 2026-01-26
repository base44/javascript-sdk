import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock socket-utils before importing entities
vi.mock("../../src/utils/socket-utils.js", () => ({
  RoomsSocket: vi.fn(),
}));

// Mock auth-utils
vi.mock("../../src/utils/auth-utils.js", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

import { createEntitiesModule } from "../../src/modules/entities";
import type { WatchSnapshot, WatchOptions } from "../../src/modules/entities.types";

describe("EntityHandler.watch", () => {
  let mockAxios: any;
  let mockSocket: any;
  let entities: ReturnType<typeof createEntitiesModule>;
  let subscribeQueryCallbacks: any[];

  beforeEach(() => {
    subscribeQueryCallbacks = [];

    mockAxios = {
      get: vi.fn().mockResolvedValue([]), // Default to empty array for initial fetch
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mockSocket = {
      subscribeToRoom: vi.fn(),
      subscribeQuery: vi.fn((appId, entityName, options, handlers) => {
        subscribeQueryCallbacks.push({ appId, entityName, options, handlers });
        return vi.fn(); // unsubscribe function
      }),
      updateConfig: vi.fn(),
      updateModel: vi.fn(),
      disconnect: vi.fn(),
    };

    entities = createEntitiesModule({
      axios: mockAxios,
      appId: "test-app-123",
      getSocket: () => mockSocket,
    });
  });

  it("should call subscribeQuery with correct parameters", () => {
    const options: WatchOptions = {
      filter: { status: "active" },
      sort: "-created_date",
      limit: 10,
    };
    const callback = vi.fn();

    entities.Task.watch(options, callback);

    expect(mockSocket.subscribeQuery).toHaveBeenCalledWith(
      "test-app-123",
      "Task",
      {
        filter: { status: "active" },
        sort: "-created_date",
        fields: undefined,
        limit: 10,
      },
      expect.objectContaining({
        update_model: expect.any(Function),
      })
    );
  });

  it("should return unsubscribe function", () => {
    const unsubscribe = entities.Task.watch({}, vi.fn());
    expect(typeof unsubscribe).toBe("function");
  });

  it("should fetch initial data and call callback with snapshot", async () => {
    const initialData = [
      { id: "task-1", title: "Task 1", status: "active" },
      { id: "task-2", title: "Task 2", status: "active" },
    ];
    mockAxios.get.mockResolvedValue(initialData);

    const callback = vi.fn();

    entities.Task.watch({ filter: { status: "active" } }, callback);

    // Wait for initial fetch
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "added",
        entities: initialData,
        timestamp: expect.any(String),
      })
    );
  });

  it("should handle added change type from socket", async () => {
    mockAxios.get.mockResolvedValue([]);
    const callback = vi.fn();

    entities.Task.watch({ filter: { status: "active" } }, callback);

    // Wait for initial callback
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Simulate receiving an added message
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "added",
        type: "create",
        id: "task-123",
        data: { id: "task-123", status: "active", title: "New Task" },
      }),
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "added",
        entities: [{ id: "task-123", status: "active", title: "New Task" }],
      })
    );
  });

  it("should handle modified change type from socket", async () => {
    const initialData = [{ id: "task-123", title: "Original", status: "active" }];
    mockAxios.get.mockResolvedValue(initialData);
    const callback = vi.fn();

    entities.Task.watch({}, callback);

    // Wait for initial callback
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Simulate receiving a modified message
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "modified",
        type: "update",
        id: "task-123",
        data: { id: "task-123", title: "Updated", status: "active" },
      }),
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "modified",
        entities: [{ id: "task-123", title: "Updated", status: "active" }],
      })
    );
  });

  it("should handle removed change type from socket", async () => {
    const initialData = [
      { id: "task-1", title: "Task 1", status: "active" },
      { id: "task-2", title: "Task 2", status: "active" },
    ];
    mockAxios.get.mockResolvedValue(initialData);
    const callback = vi.fn();

    entities.Task.watch({ filter: { status: "active" } }, callback);

    // Wait for initial callback
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Simulate receiving a removed message
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "removed",
        type: "update",
        id: "task-1",
        data: { id: "task-1", title: "Task 1", status: "completed" },
      }),
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "removed",
        entities: [{ id: "task-2", title: "Task 2", status: "active" }],
      })
    );
  });

  it("should handle callback errors gracefully", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAxios.get.mockResolvedValue([]);

    const callback = vi.fn(() => {
      throw new Error("Callback error");
    });

    entities.Task.watch({}, callback);

    // Wait for initial callback (which will throw)
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[Base44 SDK] Watch callback error:",
      expect.any(Error)
    );

    consoleError.mockRestore();
  });

  it("should handle invalid JSON gracefully", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAxios.get.mockResolvedValue([]);
    const callback = vi.fn();

    entities.Task.watch({}, callback);

    // Wait for initial callback
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Simulate receiving an invalid JSON message
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: "invalid json",
    });

    // Callback should not have been called for the invalid message
    expect(callback).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[Base44 SDK] Failed to parse watch message:",
      expect.any(Error)
    );

    consoleWarn.mockRestore();
  });

  it("should pass all WatchOptions including fields", () => {
    const options: WatchOptions = {
      filter: { status: "active" },
      sort: "-created_date",
      fields: ["id", "title", "status"],
      limit: 5,
    };
    const callback = vi.fn();

    entities.Task.watch(options, callback);

    expect(mockSocket.subscribeQuery).toHaveBeenCalledWith(
      "test-app-123",
      "Task",
      {
        filter: { status: "active" },
        sort: "-created_date",
        fields: ["id", "title", "status"],
        limit: 5,
      },
      expect.any(Object)
    );
  });

  it("should handle delete event type with removed change type", async () => {
    const initialData = [{ id: "task-123", title: "Task", status: "active" }];
    mockAxios.get.mockResolvedValue(initialData);
    const callback = vi.fn();

    entities.Task.watch({}, callback);

    // Wait for initial callback
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Simulate receiving a delete/removed message
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "removed",
        type: "delete",
        id: "task-123",
        data: { id: "task-123" },
      }),
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "removed",
        entities: [], // Entity removed from snapshot
      })
    );
  });

  it("should fallback to data.id when id is not provided in message", async () => {
    mockAxios.get.mockResolvedValue([]);
    const callback = vi.fn();

    entities.Task.watch({}, callback);

    // Wait for initial callback
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Simulate receiving a message without top-level id
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "added",
        type: "create",
        // Note: no top-level id field
        data: { id: "task-from-data", title: "Test" },
      }),
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        entities: [{ id: "task-from-data", title: "Test" }],
      })
    );
  });

  it("should call unsubscribe function returned from subscribeQuery", () => {
    const mockUnsubscribe = vi.fn();
    mockSocket.subscribeQuery = vi.fn(() => mockUnsubscribe);

    const unsubscribe = entities.Task.watch({}, vi.fn());

    expect(mockUnsubscribe).not.toHaveBeenCalled();

    unsubscribe();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should handle empty options", () => {
    const callback = vi.fn();

    entities.Task.watch({}, callback);

    expect(mockSocket.subscribeQuery).toHaveBeenCalledWith(
      "test-app-123",
      "Task",
      {
        filter: undefined,
        sort: undefined,
        fields: undefined,
        limit: undefined,
      },
      expect.any(Object)
    );
  });

  it("should work with different entity names", () => {
    const callback = vi.fn();

    entities.User.watch({ filter: { active: true } }, callback);

    expect(mockSocket.subscribeQuery).toHaveBeenCalledWith(
      "test-app-123",
      "User",
      expect.objectContaining({ filter: { active: true } }),
      expect.any(Object)
    );
  });

  it("should apply sorting to initial data", async () => {
    const initialData = [
      { id: "task-1", title: "A", created_date: "2024-01-03" },
      { id: "task-2", title: "B", created_date: "2024-01-01" },
      { id: "task-3", title: "C", created_date: "2024-01-02" },
    ];
    mockAxios.get.mockResolvedValue(initialData);

    const callback = vi.fn();

    entities.Task.watch({ sort: "-created_date" }, callback);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    // Should be sorted descending by created_date
    const snapshot: WatchSnapshot = callback.mock.calls[0][0];
    expect(snapshot.entities.map((e: any) => e.id)).toEqual([
      "task-1",
      "task-3",
      "task-2",
    ]);
  });

  it("should apply limit to initial data", async () => {
    const initialData = [
      { id: "task-1", title: "Task 1" },
      { id: "task-2", title: "Task 2" },
      { id: "task-3", title: "Task 3" },
      { id: "task-4", title: "Task 4" },
    ];
    mockAxios.get.mockResolvedValue(initialData);

    const callback = vi.fn();

    entities.Task.watch({ limit: 2 }, callback);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    const snapshot: WatchSnapshot = callback.mock.calls[0][0];
    expect(snapshot.entities).toHaveLength(2);
  });

  it("should not notify callback after unsubscribe", async () => {
    mockAxios.get.mockResolvedValue([]);
    const callback = vi.fn();

    const unsubscribe = entities.Task.watch({}, callback);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();
    unsubscribe();

    // Simulate receiving a message after unsubscribe
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "added",
        type: "create",
        id: "task-123",
        data: { id: "task-123" },
      }),
    });

    // Callback should not be called after unsubscribe
    expect(callback).not.toHaveBeenCalled();
  });

  it("should not add duplicate entities", async () => {
    const initialData = [{ id: "task-1", title: "Task 1" }];
    mockAxios.get.mockResolvedValue(initialData);
    const callback = vi.fn();

    entities.Task.watch({}, callback);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Try to add an entity that already exists
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "added",
        type: "create",
        id: "task-1",
        data: { id: "task-1", title: "Task 1 Duplicate" },
      }),
    });

    // Should not add duplicate, so callback shouldn't be called
    expect(callback).not.toHaveBeenCalled();
  });

  it("should apply limit when adding new entities", async () => {
    const initialData = [
      { id: "task-1", title: "Task 1" },
      { id: "task-2", title: "Task 2" },
    ];
    mockAxios.get.mockResolvedValue(initialData);
    const callback = vi.fn();

    entities.Task.watch({ limit: 2 }, callback);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    callback.mockClear();

    // Add a new entity when at limit
    const handler = subscribeQueryCallbacks[0].handlers;
    handler.update_model({
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "added",
        type: "create",
        id: "task-3",
        data: { id: "task-3", title: "Task 3" },
      }),
    });

    const snapshot: WatchSnapshot = callback.mock.calls[0][0];
    expect(snapshot.entities).toHaveLength(2); // Still at limit
  });

  it("should handle initial fetch failure gracefully", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAxios.get.mockRejectedValue(new Error("Network error"));
    const callback = vi.fn();

    entities.Task.watch({}, callback);

    // Wait a bit for the error to be handled
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(consoleError).toHaveBeenCalledWith(
      "[Base44 SDK] Failed to fetch initial watch data:",
      expect.any(Error)
    );

    // Callback should not have been called since fetch failed
    expect(callback).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
