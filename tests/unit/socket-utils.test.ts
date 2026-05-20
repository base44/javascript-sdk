import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RoomsSocket } from "../../src/utils/socket-utils.ts";

const socketMock = vi.hoisted(() => ({
  disconnect: vi.fn(),
  emit: vi.fn(),
  listeners: {} as Record<string, (...args: any[]) => void>,
  on: vi.fn(),
}));

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    id: "socket-id",
    disconnect: socketMock.disconnect,
    emit: socketMock.emit,
    on: socketMock.on.mockImplementation((event: string, handler: any) => {
      socketMock.listeners[event] = handler;
    }),
  })),
}));

describe("RoomsSocket", () => {
  beforeEach(() => {
    socketMock.disconnect.mockClear();
    socketMock.emit.mockClear();
    socketMock.on.mockClear();
    socketMock.listeners = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createRoomsSocket() {
    return RoomsSocket({
      config: {
        serverUrl: "https://api.base44.test",
        mountPath: "/socket.io/",
        transports: ["websocket"],
        appId: "test-app-id",
        token: "test-token",
      },
    });
  }

  test("shares one room join across multiple listeners until the last unsubscribe", () => {
    vi.useFakeTimers();
    const socket = createRoomsSocket();
    const firstUnsubscribe = socket.subscribeToRoom("room-a", {});
    const secondUnsubscribe = socket.subscribeToRoom("room-a", {});

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith("join", "room-a");

    firstUnsubscribe();

    expect(socketMock.emit).toHaveBeenCalledTimes(1);

    secondUnsubscribe();

    expect(socketMock.emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(250);

    expect(socketMock.emit).toHaveBeenCalledTimes(2);
    expect(socketMock.emit).toHaveBeenLastCalledWith("leave", "room-a");
  });

  test("rejoins a room after its last listener unsubscribe grace elapses", () => {
    vi.useFakeTimers();
    const socket = createRoomsSocket();
    const firstUnsubscribe = socket.subscribeToRoom("room-a", {});

    firstUnsubscribe();
    vi.advanceTimersByTime(250);
    socket.subscribeToRoom("room-a", {});

    expect(socketMock.emit).toHaveBeenNthCalledWith(1, "join", "room-a");
    expect(socketMock.emit).toHaveBeenNthCalledWith(2, "leave", "room-a");
    expect(socketMock.emit).toHaveBeenNthCalledWith(3, "join", "room-a");
  });

  test("unsubscribe is idempotent after the room is left", () => {
    vi.useFakeTimers();
    const socket = createRoomsSocket();
    const unsubscribe = socket.subscribeToRoom("room-a", {});

    unsubscribe();
    unsubscribe();

    vi.advanceTimersByTime(250);

    expect(socketMock.emit).toHaveBeenCalledTimes(2);
    expect(socketMock.emit).toHaveBeenNthCalledWith(1, "join", "room-a");
    expect(socketMock.emit).toHaveBeenNthCalledWith(2, "leave", "room-a");
  });

  test("does not leave and rejoin during brief unsubscribe-resubscribe churn", () => {
    vi.useFakeTimers();
    const socket = createRoomsSocket();
    const firstUnsubscribe = socket.subscribeToRoom("room-a", {});

    firstUnsubscribe();

    expect(socketMock.emit).toHaveBeenCalledTimes(1);

    const secondUnsubscribe = socket.subscribeToRoom("room-a", {});

    vi.advanceTimersByTime(250);

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith("join", "room-a");

    secondUnsubscribe();
    vi.advanceTimersByTime(250);

    expect(socketMock.emit).toHaveBeenCalledTimes(2);
    expect(socketMock.emit).toHaveBeenLastCalledWith("leave", "room-a");
  });

  test("clears pending room leaves when the socket is replaced", () => {
    vi.useFakeTimers();
    const socket = createRoomsSocket();
    const unsubscribe = socket.subscribeToRoom("room-a", {});

    unsubscribe();
    socket.updateConfig({ token: "next-token" });
    socket.subscribeToRoom("room-a", {});

    vi.advanceTimersByTime(250);

    expect(socketMock.emit).toHaveBeenCalledTimes(2);
    expect(socketMock.emit).toHaveBeenNthCalledWith(1, "join", "room-a");
    expect(socketMock.emit).toHaveBeenNthCalledWith(2, "join", "room-a");
  });
});
