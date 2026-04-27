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

  test("subscribe() should return an unsubscribe function", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    const unsubscribe = entities.Todo.subscribe(callback);

    expect(typeof unsubscribe).toBe("function");
    expect(mockSocket.subscribeToRoom).toHaveBeenCalledWith(
      `entities:${appId}:Todo`,
      expect.any(Object)
    );
  });

  test("subscribe() should call callback when update_model event is received", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    entities.Todo.subscribe(callback);

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

  test("subscribe() should handle update and delete events", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    entities.Todo.subscribe(callback);

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

  test("subscribe() unsubscribe function should stop receiving events", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    const unsubscribe = entities.Todo.subscribe(callback);

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

  test("subscribe() should not call callback for invalid JSON messages", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
    });

    const callback = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    entities.Todo.subscribe(callback);

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

  describe("auto-refetch on _truncated events", () => {
    test("refetches full record over HTTP when data._truncated is true", async () => {
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();
      mockAxios.get.mockResolvedValueOnce({
        id: "123",
        title: "Full Title",
        body: "Full long body content",
      });

      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      entities.Todo.subscribe(callback);

      mockSocket._simulateMessage(`entities:${appId}:Todo`, {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "update",
          data: { id: "123", _truncated: true },
          id: "123",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      // Wait for the async refetch to settle
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

      expect(mockAxios.get).toHaveBeenCalledWith(`/apps/${appId}/entities/Todo/123`);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update",
          id: "123",
          data: { id: "123", title: "Full Title", body: "Full long body content" },
        })
      );
    });

    test("does NOT refetch on delete events even if _truncated is set", async () => {
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();

      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      entities.Todo.subscribe(callback);

      mockSocket._simulateMessage(`entities:${appId}:Todo`, {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "delete",
          data: { id: "123", _truncated: true },
          id: "123",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

      // Delete events should not trigger a refetch — the record is gone
      expect(mockAxios.get).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ type: "delete", id: "123" })
      );
    });

    test("does NOT refetch when data has no _truncated flag", async () => {
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();

      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      entities.Todo.subscribe(callback);

      mockSocket._simulateMessage(`entities:${appId}:Todo`, {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "update",
          data: { id: "123", title: "Normal Todo" },
          id: "123",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

      // Untruncated payload — no refetch
      expect(mockAxios.get).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: "123", title: "Normal Todo" },
        })
      );
    });

    test("falls through with partial data when HTTP refetch fails", async () => {
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();
      mockAxios.get.mockRejectedValueOnce(new Error("Network down"));

      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      entities.Todo.subscribe(callback);

      mockSocket._simulateMessage(`entities:${appId}:Todo`, {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "update",
          data: { id: "456", _truncated: true },
          id: "456",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

      // Callback fires with the partial data (not crashed)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update",
          data: { id: "456", _truncated: true },
        })
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "[Base44 SDK] Failed to refetch truncated entity, falling through with partial data:",
        expect.any(Error)
      );

      warnSpy.mockRestore();
    });

    test("debounces concurrent refetches for the same (entity, id, timestamp)", async () => {
      // The debounce map is keyed by `${entityName}:${id}:${timestamp}`, so two
      // events arriving back-to-back with the same key should fan out to a
      // single HTTP refetch. We simulate that by sending the same truncated
      // message twice in quick succession (before the first refetch resolves)
      // and asserting only one HTTP call fires.
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();
      let resolveRecord: (v: any) => void = () => {};
      mockAxios.get.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRecord = resolve;
        })
      );

      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      entities.Todo.subscribe(callback);

      const truncatedMsg = {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "update",
          data: { id: "789", _truncated: true },
          id: "789",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      };

      // Same key arrives twice while the first refetch is still in-flight.
      mockSocket._simulateMessage(`entities:${appId}:Todo`, truncatedMsg);
      mockSocket._simulateMessage(`entities:${appId}:Todo`, truncatedMsg);

      // Both handlers piggy-back on a single HTTP call.
      await Promise.resolve();
      expect(mockAxios.get).toHaveBeenCalledTimes(1);

      // Resolve the shared HTTP promise — both queued handlers fire the callback.
      resolveRecord({ id: "789", title: "Full" });
      await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
      // Both invocations carry the freshly fetched record, not the truncated stub.
      expect(callback).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: { id: "789", title: "Full" } })
      );
      expect(callback).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: { id: "789", title: "Full" } })
      );
    });
  });

  test("subscribe() should catch and log errors thrown by callback", () => {
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

    entities.Todo.subscribe(throwingCallback);

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
