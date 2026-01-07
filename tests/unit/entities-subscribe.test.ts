import { describe, test, expect, vi } from "vitest";
import { createEntitiesModule } from "../../src/modules/entities.ts";

describe("Entities Module - subscribe()", () => {
  const appId = "test-app-id";

  // Helper to create a mock socket
  function createMockSocket() {
    const listeners: Record<string, any> = {};
    return {
      subscribeToRoom: vi.fn((room: string, handlers: any) => {
        listeners[room] = handlers;
        // Return unsubscribe function
        return () => {
          delete listeners[room];
        };
      }),
      // Helper to simulate incoming messages
      _simulateMessage: (room: string, msg: any) => {
        listeners[room]?.update_model?.(msg);
      },
      _getListeners: () => listeners,
    };
  }

  // Helper to create a mock axios instance
  function createMockAxios() {
    return {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
  }

  test("subscribe() should return a Promise that resolves to an unsubscribe function", async () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    const unsubscribe = await entities.Todo.subscribe(callback);

    expect(typeof unsubscribe).toBe("function");
    expect(mockSocket.subscribeToRoom).toHaveBeenCalledWith(
      `entities:${appId}:Todo`,
      expect.any(Object)
    );
  });

  test("subscribe() should call callback when update_model event is received", async () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    await entities.Todo.subscribe(callback);

    // Simulate an incoming message
    const messageData = JSON.stringify({
      type: "create",
      data: { id: "123", title: "New Todo" },
      id: "123",
      timestamp: "2024-01-01T00:00:00.000Z",
    });

    mockSocket._simulateMessage(`entities:${appId}:Todo`, {
      room: `entities:${appId}:Todo`,
      data: messageData,
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      type: "create",
      data: { id: "123", title: "New Todo" },
      id: "123",
      timestamp: "2024-01-01T00:00:00.000Z",
    });
  });

  test("subscribe() should handle update and delete events", async () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    await entities.Todo.subscribe(callback);

    // Test update event
    mockSocket._simulateMessage(`entities:${appId}:Todo`, {
      room: `entities:${appId}:Todo`,
      data: JSON.stringify({
        type: "update",
        data: { id: "123", title: "Updated Todo" },
        id: "123",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    });

    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "update" })
    );

    // Test delete event
    mockSocket._simulateMessage(`entities:${appId}:Todo`, {
      room: `entities:${appId}:Todo`,
      data: JSON.stringify({
        type: "delete",
        data: { id: "123" },
        id: "123",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    });

    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "delete" })
    );
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test("subscribe() unsubscribe function should stop receiving events", async () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    const unsubscribe = await entities.Todo.subscribe(callback);

    // Simulate a message before unsubscribing
    mockSocket._simulateMessage(`entities:${appId}:Todo`, {
      room: `entities:${appId}:Todo`,
      data: JSON.stringify({
        type: "create",
        data: {},
        id: "1",
        timestamp: "",
      }),
    });

    expect(callback).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();

    // Simulate another message after unsubscribing
    mockSocket._simulateMessage(`entities:${appId}:Todo`, {
      room: `entities:${appId}:Todo`,
      data: JSON.stringify({
        type: "create",
        data: {},
        id: "2",
        timestamp: "",
      }),
    });

    // Callback should not have been called again
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("subscribe() should not call callback for invalid JSON messages", async () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await entities.Todo.subscribe(callback);

    // Simulate an invalid JSON message
    mockSocket._simulateMessage(`entities:${appId}:Todo`, {
      room: `entities:${appId}:Todo`,
      data: "invalid json {{{",
    });

    expect(callback).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[Base44 SDK] Failed to parse realtime message:",
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });

  test("subscribe() should catch and log errors thrown by callback", async () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Callback that throws an error
    const throwingCallback = vi.fn(() => {
      throw new Error("Callback error!");
    });

    await entities.Todo.subscribe(throwingCallback);

    // Simulate a message - this should NOT throw, but log the error
    expect(() => {
      mockSocket._simulateMessage(`entities:${appId}:Todo`, {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "create",
          data: { id: "123" },
          id: "123",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });
    }).not.toThrow();

    // The callback should have been called
    expect(throwingCallback).toHaveBeenCalledTimes(1);

    // The error should have been logged
    expect(errorSpy).toHaveBeenCalledWith(
      "[Base44 SDK] Subscription callback error:",
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });
});
