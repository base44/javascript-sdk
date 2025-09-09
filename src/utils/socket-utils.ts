import { Socket, io } from "socket.io-client";
import { getAccessToken } from "./auth-utils.js";

export type RoomsSocketConfig = {
  serverUrl: string;
  mountPath: string;
  transports: string[];
  appId: string;
  token?: string;
};

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

function initializeSocket(
  config: RoomsSocketConfig,
  handlers: Partial<{
    [k in TEvent]: (
      ...args: Parameters<RoomsSocketEventsMap["listen"][k]>
    ) => void;
  }>
) {
  const socket = io(config.serverUrl, {
    path: config.mountPath,
    transports: config.transports,
    query: {
      app_id: config.appId,
      token: config.token ?? getAccessToken(),
    },
  }) as Socket<RoomsSocketEventsMap["listen"], RoomsSocketEventsMap["emit"]>;

  socket.on("connect", () => {
    console.log("connect", socket.id);
    handlers.connect?.();
  });

  socket.on("update_model", (msg) => {
    handlers.update_model?.(msg);
  });

  socket.on("error", (error) => {
    handlers.error?.(error);
  });

  socket.on("connect_error", (error) => {
    console.error("connect_error", error);
    handlers.error?.(error);
  });

  return socket;
}

export type RoomsSocket = ReturnType<typeof RoomsSocket>;

export function RoomsSocket({ config }: { config: RoomsSocketConfig }) {
  let currentConfig = { ...config };
  const roomsToListeners: Record<
    TSocketRoom,
    Partial<{ [k in TEvent]: THandler<k> }>[]
  > = {};

  const handlers: { [k in TEvent]: THandler<k> } = {
    connect: async () => {
      const promises: Promise<void>[] = [];
      Object.keys(roomsToListeners).forEach((room) => {
        joinRoom(room);
        const listeners = getListeners(room);
        listeners?.forEach(({ connect }) => {
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
      await handlers.error?.(error);
    },
  };

  let socket = initializeSocket(config, handlers);

  function cleanup() {
    disconnect();
  }

  function disconnect() {
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
    return roomsToListeners[room];
  }

  const subscribeToRoom = (
    room: TSocketRoom,
    handlers: Partial<{ [k in TEvent]: THandler<k> }>
  ) => {
    if (!roomsToListeners[room]) {
      joinRoom(room);
      roomsToListeners[room] = [];
    }

    roomsToListeners[room].push(handlers);

    return () => {
      roomsToListeners[room] = roomsToListeners[room].filter(
        (listener) => listener !== handlers
      );
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
