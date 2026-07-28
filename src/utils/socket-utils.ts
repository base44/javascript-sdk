import { Socket, io } from "socket.io-client";
import { getAccessToken } from "./auth-utils.js";
import { getAnalyticsSessionId } from "../modules/analytics.js";

export interface RoomsSocketConfig {
  serverUrl: string;
  mountPath: string;
  transports: string[];
  appId: string;
  token?: string;
  /**
   * Force an anonymous handshake: never attach a token (including the stored
   * access token fallback), so the connection is identified only by its
   * anonymous visitor id.
   */
  anonymous?: boolean;
}

export type TSocketRoom = string;
export type TJsonStr = string;

type RoomsSocketEventsMap = {
  listen: {
    connect: () => Promise<void> | void;
    update_model: (msg: {
      room: string;
      data: TJsonStr;
    }) => Promise<void> | void;
    error: (error: Error) => Promise<void> | void;
  };
  emit: {
    join: (room: string) => void;
    leave: (room: string) => void;
  };
};

type TEvent = keyof RoomsSocketEventsMap["listen"];

type THandler<E extends TEvent> = RoomsSocketEventsMap["listen"][E];

const ROOM_LEAVE_GRACE_MS = 250;

function initializeSocket(
  config: RoomsSocketConfig,
  handlers: Partial<RoomsSocketEventsMap["listen"]>
) {
  // On unauthenticated clients, send a stable anonymous visitor id on the
  // handshake so the backend can verify room access for anonymous agent
  // conversations (mirrors the X-Base44-Anonymous-Id HTTP header). Authenticated
  // clients are identified by their token instead.
  const resolvedToken = config.anonymous
    ? undefined
    : config.token ?? getAccessToken();
  const query: Record<string, string | null | undefined> = {
    app_id: config.appId,
    token: resolvedToken,
  };
  if (!resolvedToken) {
    query.anonymous_id = getAnalyticsSessionId();
  }

  const socket = io(config.serverUrl, {
    path: config.mountPath,
    transports: config.transports,
    query,
  }) as Socket<RoomsSocketEventsMap["listen"], RoomsSocketEventsMap["emit"]>;

  socket.on("connect", async () => {
    console.log("connect", socket.id);
    return handlers.connect?.();
  });

  socket.on("update_model", async (msg) => {
    return handlers.update_model?.(msg);
  });

  socket.on("error", async (error) => {
    return handlers.error?.(error);
  });

  socket.on("connect_error", async (error) => {
    console.error("connect_error", error);
    return handlers.error?.(error);
  });

  return socket;
}

export type RoomsSocket = ReturnType<typeof RoomsSocket>;

export function RoomsSocket({ config }: { config: RoomsSocketConfig }) {
  let currentConfig = { ...config };
  const roomsToListeners: Record<
    TSocketRoom,
    Partial<RoomsSocketEventsMap["listen"]>[]
  > = {};
  const pendingRoomLeaves: Record<TSocketRoom, ReturnType<typeof setTimeout>> =
    {};

  const handlers: RoomsSocketEventsMap["listen"] = {
    connect: async () => {
      const promises: Promise<void>[] = [];
      Object.keys(roomsToListeners).forEach((room) => {
        const listeners = getListeners(room);
        if (listeners.length === 0) {
          return;
        }

        joinRoom(room);
        listeners.forEach(({ connect }) => {
          const promise = async () => connect?.();
          promises.push(promise());
        });
      });
      await Promise.all(promises);
    },
    update_model: async (msg) => {
      const listeners = getListeners(msg.room);
      const promises = listeners.map((listener) =>
        listener.update_model?.(msg)
      );
      await Promise.all(promises);
    },
    error: async (error) => {
      console.error("error", error);
      const promises = Object.values(roomsToListeners)
        .flat()
        .map((listener) => listener.error?.(error));
      await Promise.all(promises);
    },
  };

  let socket = initializeSocket(config, handlers);

  function cleanup() {
    disconnect();
  }

  function disconnect() {
    clearPendingRoomLeaves();

    if (socket) {
      socket.disconnect();
    }
  }

  function updateConfig(config: Partial<RoomsSocketConfig>) {
    cleanup();
    currentConfig = {
      ...currentConfig,
      ...config,
    };
    socket = initializeSocket(currentConfig, handlers);
  }

  function joinRoom(room: string) {
    socket.emit("join", room);
  }

  function leaveRoom(room: string) {
    socket.emit("leave", room);
  }

  async function updateModel(room: string, data: any) {
    const dataStr = JSON.stringify(data);
    return handlers.update_model?.({ room, data: dataStr });
  }

  function getListeners(room: string) {
    return roomsToListeners[room] ?? [];
  }

  function cancelPendingRoomLeave(room: TSocketRoom) {
    const pendingLeave = pendingRoomLeaves[room];
    if (!pendingLeave) {
      return;
    }

    clearTimeout(pendingLeave);
    delete pendingRoomLeaves[room];
  }

  function clearPendingRoomLeaves() {
    Object.keys(pendingRoomLeaves).forEach((room) => {
      clearTimeout(pendingRoomLeaves[room]);
      delete pendingRoomLeaves[room];

      if ((roomsToListeners[room]?.length ?? 0) === 0) {
        delete roomsToListeners[room];
      }
    });
  }

  function scheduleRoomLeave(room: TSocketRoom) {
    cancelPendingRoomLeave(room);
    pendingRoomLeaves[room] = setTimeout(() => {
      delete pendingRoomLeaves[room];

      if ((roomsToListeners[room]?.length ?? 0) > 0) {
        return;
      }

      leaveRoom(room);
      delete roomsToListeners[room];
    }, ROOM_LEAVE_GRACE_MS);
  }

  const subscribeToRoom = (
    room: TSocketRoom,
    handlers: Partial<{ [k in TEvent]: THandler<k> }>
  ) => {
    if (roomsToListeners[room]) {
      cancelPendingRoomLeave(room);
    } else {
      joinRoom(room);
      roomsToListeners[room] = [];
    }

    roomsToListeners[room].push(handlers);
    let unsubscribed = false;

    return () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;
      roomsToListeners[room] =
        roomsToListeners[room]?.filter((listener) => listener !== handlers) ??
        [];
      if (roomsToListeners[room].length === 0) {
        scheduleRoomLeave(room);
      }
    };
  };

  return {
    socket,
    subscribeToRoom,
    updateConfig,
    updateModel,
    disconnect,
  };
}
