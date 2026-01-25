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
import type { WatchEvent, WatchOptions } from "../../src/modules/entities.types";

describe("EntityHandler.watch", () => {
  let mockAxios: any;
  let mockSocket: any;
  let entities: ReturnType<typeof createEntitiesModule>;

  beforeEach(() => {
    mockAxios = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    const subscribeQueryCallbacks: any[] = [];
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

  it("should parse watch messages and call callback with WatchEvent", () => {
    const callback = vi.fn();
    let messageHandler: (msg: { room: string; data: string }) => void;

    mockSocket.subscribeQuery = vi.fn(
      (appId, entityName, options, handlers) => {
        messageHandler = handlers.update_model;
        return vi.fn();
      }
    );

    entities.Task.watch({ filter: { status: "active" } }, callback);

    // Simulate receiving a watch message
    const watchMessage = {
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "added",
        type: "create",
        id: "task-123",
        data: { id: "task-123", status: "active", title: "New Task" },
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    };

    messageHandler!(watchMessage);

    expect(callback).toHaveBeenCalledWith({
      changeType: "added",
      eventType: "create",
      id: "task-123",
      data: { id: "task-123", status: "active", title: "New Task" },
      timestamp: "2024-01-01T00:00:00.000Z",
    });
  });

  it("should handle modified change type", () => {
    const callback = vi.fn();
    let messageHandler: (msg: { room: string; data: string }) => void;

    mockSocket.subscribeQuery = vi.fn(
      (appId, entityName, options, handlers) => {
        messageHandler = handlers.update_model;
        return vi.fn();
      }
    );

    entities.Task.watch({}, callback);

    const watchMessage = {
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "modified",
        type: "update",
        id: "task-123",
        data: { id: "task-123", status: "active", title: "Updated Task" },
      }),
    };

    messageHandler!(watchMessage);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: "modified",
        eventType: "update",
      })
    );
  });

  it("should handle removed change type", () => {
    const callback = vi.fn();
    let messageHandler: (msg: { room: string; data: string }) => void;

    mockSocket.subscribeQuery = vi.fn(
      (appId, entityName, options, handlers) => {
        messageHandler = handlers.update_model;
        return vi.fn();
      }
    );

    entities.Task.watch({ filter: { status: "active" } }, callback);

    const watchMessage = {
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "removed",
        type: "update",
        id: "task-123",
        data: { id: "task-123", status: "completed", title: "Task" },
      }),
    };

    messageHandler!(watchMessage);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: "removed",
        eventType: "update",
      })
    );
  });

  it("should handle callback errors gracefully", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const callback = vi.fn(() => {
      throw new Error("Callback error");
    });
    let messageHandler: (msg: { room: string; data: string }) => void;

    mockSocket.subscribeQuery = vi.fn(
      (appId, entityName, options, handlers) => {
        messageHandler = handlers.update_model;
        return vi.fn();
      }
    );

    entities.Task.watch({}, callback);

    const watchMessage = {
      room: "entities:test-app-123:Task:watch",
      data: JSON.stringify({
        change_type: "added",
        type: "create",
        id: "task-123",
        data: {},
      }),
    };

    // Should not throw
    expect(() => messageHandler!(watchMessage)).not.toThrow();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("should handle invalid JSON gracefully", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callback = vi.fn();
    let messageHandler: (msg: { room: string; data: string }) => void;

    mockSocket.subscribeQuery = vi.fn(
      (appId, entityName, options, handlers) => {
        messageHandler = handlers.update_model;
        return vi.fn();
      }
    );

    entities.Task.watch({}, callback);

    const invalidMessage = {
      room: "entities:test-app-123:Task:watch",
      data: "invalid json",
    };

    // Should not throw and should not call callback
    expect(() => messageHandler!(invalidMessage)).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });
});
