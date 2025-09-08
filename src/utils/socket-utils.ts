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
    connect: () => void;
    update_model: (msg: { room: string; data: TJsonStr }) => void;
    error: (error: Error) => void;
  };
  emit: {
    join: (room: string) => void;
    leave: (room: string) => void;
  };
};

type TEvent = keyof RoomsSocketEventsMap["listen"];

type THandler<E extends TEvent> = (
  ...args: Parameters<RoomsSocketEventsMap["listen"][E]>
) => void;

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

export function RoomsSocket({ config }: { config: RoomsSocketConfig }) {
  let currentConfig = { ...config };
  const roomsToListeners: Record<
    TSocketRoom,
    Partial<{ [k in TEvent]: THandler<k> }>[]
  > = {};

  const handlers: { [k in TEvent]: THandler<k> } = {
    connect: () => {
      Object.keys(roomsToListeners).forEach((room) => {
        joinRoom(room);
        getListeners(room)?.forEach(({ connect: connectHandler }) => {
          connectHandler?.();
        });
      });
    },
    update_model: (msg) => {
      if (roomsToListeners[msg.room]) {
        getListeners(msg.room)?.forEach(({ update_model }) => {
          update_model?.(msg);
        });
      }
    },
    error: (error) => {
      console.error("error", error);
      handlers.error?.(error);
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
    handlers,
    disconnect,
  };
}
