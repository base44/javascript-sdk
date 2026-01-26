import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock socket.io-client
const mockSocketInstance = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  id: "mock-socket-id",
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocketInstance),
}));

// Mock auth-utils
vi.mock("../../src/utils/auth-utils.js", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

import { RoomsSocket } from "../../src/utils/socket-utils";

describe("RoomsSocket.subscribeQuery", () => {
  let roomsSocket: ReturnType<typeof RoomsSocket>;

  beforeEach(() => {
    vi.clearAllMocks();

    roomsSocket = RoomsSocket({
      config: {
        serverUrl: "https://test.example.com",
        mountPath: "/socket",
        transports: ["websocket"],
        appId: "test-app-123",
        token: "test-token",
      },
    });
  });

  afterEach(() => {
    roomsSocket.disconnect();
  });

  it("should emit subscribe_query with correct parameters", () => {
    const options = {
      filter: { status: "active" },
      sort: "-created_date",
      fields: ["id", "title"],
      limit: 10,
    };

    roomsSocket.subscribeQuery("test-app-123", "Task", options, {});

    expect(mockSocketInstance.emit).toHaveBeenCalledWith("subscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
      options: {
        filter: { status: "active" },
        sort: "-created_date",
        fields: ["id", "title"],
        limit: 10,
      },
    });
  });

  it("should emit subscribe_query with empty options", () => {
    roomsSocket.subscribeQuery("test-app-123", "Task", {}, {});

    expect(mockSocketInstance.emit).toHaveBeenCalledWith("subscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
      options: {},
    });
  });

  it("should return an unsubscribe function", () => {
    const unsubscribe = roomsSocket.subscribeQuery(
      "test-app-123",
      "Task",
      {},
      {}
    );

    expect(typeof unsubscribe).toBe("function");
  });

  it("should emit unsubscribe_query when unsubscribe is called and no other listeners exist", () => {
    const unsubscribe = roomsSocket.subscribeQuery(
      "test-app-123",
      "Task",
      {},
      {}
    );

    // Clear mocks to isolate unsubscribe behavior
    mockSocketInstance.emit.mockClear();

    unsubscribe();

    expect(mockSocketInstance.emit).toHaveBeenCalledWith("unsubscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
    });
  });

  it("should not emit unsubscribe_query when other listeners still exist", () => {
    const handler1 = { update_model: vi.fn() };
    const handler2 = { update_model: vi.fn() };

    const unsubscribe1 = roomsSocket.subscribeQuery(
      "test-app-123",
      "Task",
      {},
      handler1
    );
    roomsSocket.subscribeQuery("test-app-123", "Task", {}, handler2);

    mockSocketInstance.emit.mockClear();

    // Unsubscribe first listener
    unsubscribe1();

    // Should NOT have emitted unsubscribe_query because handler2 still exists
    expect(mockSocketInstance.emit).not.toHaveBeenCalledWith(
      "unsubscribe_query",
      expect.anything()
    );
  });

  it("should emit unsubscribe_query when last listener unsubscribes", () => {
    const handler1 = { update_model: vi.fn() };
    const handler2 = { update_model: vi.fn() };

    const unsubscribe1 = roomsSocket.subscribeQuery(
      "test-app-123",
      "Task",
      {},
      handler1
    );
    const unsubscribe2 = roomsSocket.subscribeQuery(
      "test-app-123",
      "Task",
      {},
      handler2
    );

    mockSocketInstance.emit.mockClear();

    unsubscribe1();
    expect(mockSocketInstance.emit).not.toHaveBeenCalled();

    unsubscribe2();
    expect(mockSocketInstance.emit).toHaveBeenCalledWith("unsubscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
    });
  });

  it("should handle multiple entities independently", () => {
    roomsSocket.subscribeQuery("test-app-123", "Task", {}, {});
    roomsSocket.subscribeQuery("test-app-123", "User", {}, {});

    expect(mockSocketInstance.emit).toHaveBeenCalledWith("subscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
      options: {},
    });
    expect(mockSocketInstance.emit).toHaveBeenCalledWith("subscribe_query", {
      app_id: "test-app-123",
      entity_name: "User",
      options: {},
    });
  });

  it("should emit subscribe_query for each subscription even with same entity", () => {
    // Each subscription emits subscribe_query
    roomsSocket.subscribeQuery("test-app-123", "Task", { filter: { a: 1 } }, {});
    roomsSocket.subscribeQuery("test-app-123", "Task", { filter: { b: 2 } }, {});

    // Both subscribe_query calls should have been made
    expect(mockSocketInstance.emit).toHaveBeenCalledTimes(2);
    expect(mockSocketInstance.emit).toHaveBeenNthCalledWith(1, "subscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
      options: { filter: { a: 1 } },
    });
    expect(mockSocketInstance.emit).toHaveBeenNthCalledWith(2, "subscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
      options: { filter: { b: 2 } },
    });
  });

  it("should support partial WatchSubscriptionOptions", () => {
    roomsSocket.subscribeQuery(
      "test-app-123",
      "Task",
      { filter: { status: "active" } },
      {}
    );

    expect(mockSocketInstance.emit).toHaveBeenCalledWith("subscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
      options: { filter: { status: "active" } },
    });
  });

  it("should handle subscribed event handler", () => {
    const subscribedHandler = vi.fn();
    roomsSocket.subscribeQuery("test-app-123", "Task", {}, {
      subscribed: subscribedHandler,
    });

    // The handler is registered, verify subscribeQuery was called
    expect(mockSocketInstance.emit).toHaveBeenCalledWith("subscribe_query", {
      app_id: "test-app-123",
      entity_name: "Task",
      options: {},
    });
  });
});
