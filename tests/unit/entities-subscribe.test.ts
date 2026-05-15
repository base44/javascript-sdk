import { describe, test, expect, vi } from "vitest";
import { createEntitiesModule } from "../../src/modules/entities.ts";

describe("Entities Module - subscribe()", () => {
  const appId = "test-app-id";

  // Helper to create a mock socket
  function createMockSocket() {
    const listeners: Record<string, any> = {};
    const unsubscribes: Record<string, ReturnType<typeof vi.fn>> = {};
    return {
      subscribeToRoom: vi.fn((room: string, handlers: any) => {
        listeners[room] = handlers;
        const unsubscribe = vi.fn(() => {
          delete listeners[room];
        });
        unsubscribes[room] = unsubscribe;
        return unsubscribe;
      }),
      // Helper to simulate incoming messages
      _simulateMessage: (room: string, msg: any) => {
        listeners[room]?.update_model?.(msg);
      },
      _getListeners: () => listeners,
      _getUnsubscribe: (room: string) => unsubscribes[room],
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

  test("subscribe() should fan out callbacks through one socket room subscription", async () => {
    vi.useFakeTimers();
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    try {
      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      const firstUnsubscribe = entities.Todo.subscribe(firstCallback);
      const secondUnsubscribe = entities.Todo.subscribe(secondCallback);
      const room = `entities:${appId}:Todo`;
      const roomUnsubscribe = mockSocket._getUnsubscribe(room);

      expect(mockSocket.subscribeToRoom).toHaveBeenCalledTimes(1);

      mockSocket._simulateMessage(room, {
        room,
        data: JSON.stringify({
          type: "create",
          data: { id: "1" },
          id: "1",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledTimes(1);

      firstUnsubscribe();

      mockSocket._simulateMessage(room, {
        room,
        data: JSON.stringify({
          type: "update",
          data: { id: "1" },
          id: "1",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledTimes(2);
      expect(roomUnsubscribe).not.toHaveBeenCalled();

      secondUnsubscribe();

      expect(roomUnsubscribe).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(roomUnsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("subscribe() should cancel the empty-room leave when resubscribed during grace", async () => {
    vi.useFakeTimers();
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    try {
      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
        subscriptionOptions: { emptyRoomGraceMs: 1_000 },
      });
      const room = `entities:${appId}:Todo`;
      const firstUnsubscribe = entities.Todo.subscribe(vi.fn());
      const roomUnsubscribe = mockSocket._getUnsubscribe(room);

      firstUnsubscribe();

      expect(roomUnsubscribe).not.toHaveBeenCalled();

      const secondCallback = vi.fn();
      const secondUnsubscribe = entities.Todo.subscribe(secondCallback);

      await vi.advanceTimersByTimeAsync(1_000);

      expect(mockSocket.subscribeToRoom).toHaveBeenCalledTimes(1);
      expect(roomUnsubscribe).not.toHaveBeenCalled();

      mockSocket._simulateMessage(room, {
        room,
        data: JSON.stringify({
          type: "update",
          data: { id: "1" },
          id: "1",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      expect(secondCallback).toHaveBeenCalledTimes(1);

      secondUnsubscribe();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(roomUnsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("subscribe() should leave an empty room after the grace period expires", async () => {
    vi.useFakeTimers();
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();

    try {
      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
        subscriptionOptions: { emptyRoomGraceMs: 1_000 },
      });
      const room = `entities:${appId}:Todo`;
      const unsubscribe = entities.Todo.subscribe(vi.fn());
      const roomUnsubscribe = mockSocket._getUnsubscribe(room);

      unsubscribe();
      await vi.advanceTimersByTimeAsync(999);

      expect(roomUnsubscribe).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);

      expect(roomUnsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("subscribe() should cap distinct active entity subscriptions", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();
    const trackSubscriptionEvent = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
      subscriptionOptions: { maxActiveSubscriptions: 1 },
      trackSubscriptionEvent,
    });

    const todoCallback = vi.fn();
    const userCallback = vi.fn();
    const unsubscribeTodo = entities.Todo.subscribe(todoCallback);
    const unsubscribeUser = entities.User.subscribe(userCallback);

    expect(mockSocket.subscribeToRoom).toHaveBeenCalledTimes(1);
    expect(mockSocket.subscribeToRoom).toHaveBeenCalledWith(
      `entities:${appId}:Todo`,
      expect.any(Object)
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Realtime entity subscription cap reached")
    );
    expect(trackSubscriptionEvent).toHaveBeenCalledWith({
      eventName: "__entity_subscription_warning__",
      properties: expect.objectContaining({
        reason: "active_subscription_cap",
        entity: "User",
        active_subscription_count: 1,
        max_active_subscriptions: 1,
      }),
    });

    mockSocket._simulateMessage(`entities:${appId}:User`, {
      room: `entities:${appId}:User`,
      data: JSON.stringify({
        type: "create",
        data: { id: "blocked" },
        id: "blocked",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    });

    expect(userCallback).not.toHaveBeenCalled();

    unsubscribeUser();
    unsubscribeTodo();
    warnSpy.mockRestore();
  });

  test("subscribe() should warn and emit telemetry on repeated subscription churn", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();
    const trackSubscriptionEvent = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
      subscriptionOptions: {
        churnWarningThreshold: 4,
        churnWindowMs: 60_000,
      },
      trackSubscriptionEvent,
    });

    const firstUnsubscribe = entities.Todo.subscribe(vi.fn());
    firstUnsubscribe();
    const secondUnsubscribe = entities.Todo.subscribe(vi.fn());
    secondUnsubscribe();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("created and cleaned up repeatedly")
    );
    expect(trackSubscriptionEvent).toHaveBeenCalledWith({
      eventName: "__entity_subscription_warning__",
      properties: expect.objectContaining({
        reason: "subscription_churn",
        entity: "Todo",
        activity_count: 4,
        subscribe_count: 2,
        unsubscribe_count: 2,
        churn_window_ms: 60000,
        churn_warning_threshold: 4,
      }),
    });

    warnSpy.mockRestore();
  });

  test("subscribe() should not warn when many callbacks fan out without unsubscribe churn", () => {
    const mockSocket = createMockSocket();
    const mockAxios = createMockAxios();
    const trackSubscriptionEvent = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const entities = createEntitiesModule({
      axios: mockAxios as any,
      appId,
      getSocket: () => mockSocket as any,
      subscriptionOptions: {
        churnWarningThreshold: 4,
        churnWindowMs: 60_000,
      },
      trackSubscriptionEvent,
    });

    entities.Todo.subscribe(vi.fn());
    entities.Todo.subscribe(vi.fn());
    entities.Todo.subscribe(vi.fn());
    entities.Todo.subscribe(vi.fn());

    expect(mockSocket.subscribeToRoom).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(trackSubscriptionEvent).not.toHaveBeenCalled();

    warnSpy.mockRestore();
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

  describe("oversize broadcast handling", () => {
    test("logs a console.error and passes the stub through when data._oversize is true", () => {
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();
      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      entities.Todo.subscribe(callback);

      mockSocket._simulateMessage(`entities:${appId}:Todo`, {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "update",
          data: { id: "123", _oversize: true },
          id: "123",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      // No HTTP call — the SDK never auto-refetches.
      expect(mockAxios.get).not.toHaveBeenCalled();
      // Developer is notified via console.error.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Base44 SDK] Realtime broadcast for Todo#123 was oversize")
      );
      // Callback still fires with the slimmed payload — caller decides what to do.
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update",
          id: "123",
          data: { id: "123", _oversize: true },
        })
      );

      errorSpy.mockRestore();
    });

    test("does NOT log on delete events even if _oversize is set", () => {
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();
      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      entities.Todo.subscribe(callback);

      mockSocket._simulateMessage(`entities:${appId}:Todo`, {
        room: `entities:${appId}:Todo`,
        data: JSON.stringify({
          type: "delete",
          data: { id: "123", _oversize: true },
          id: "123",
          timestamp: "2024-01-01T00:00:00.000Z",
        }),
      });

      expect(errorSpy).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ type: "delete", id: "123" })
      );

      errorSpy.mockRestore();
    });

    test("does NOT log when data has no _oversize flag", () => {
      const mockSocket = createMockSocket();
      const mockAxios = createMockAxios();
      const entities = createEntitiesModule({
        axios: mockAxios as any,
        appId,
        getSocket: () => mockSocket as any,
      });

      const callback = vi.fn();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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

      expect(errorSpy).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: "123", title: "Normal Todo" },
        })
      );

      errorSpy.mockRestore();
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
