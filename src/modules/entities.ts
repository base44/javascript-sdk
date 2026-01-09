import { AxiosInstance } from "axios";
import {
  EntitiesModule,
  EntityHandler,
  RealtimeCallback,
  RealtimeEvent,
  RealtimeEventType,
  Subscription,
} from "./entities.types";
import { RoomsSocket } from "../utils/socket-utils.js";

/**
 * Configuration for the entities module.
 * @internal
 */
export interface EntitiesModuleConfig {
  axios: AxiosInstance;
  appId: string;
  getSocket: () => ReturnType<typeof RoomsSocket>;
}

/**
 * Creates the entities module for the Base44 SDK.
 *
 * @param config - Configuration object containing axios, appId, and getSocket
 * @returns Entities module with dynamic entity access
 * @internal
 */
export function createEntitiesModule(
  config: EntitiesModuleConfig
): EntitiesModule {
  const { axios, appId, getSocket } = config;
  // Using Proxy to dynamically handle entity names
  return new Proxy(
    {},
    {
      get(target, entityName) {
        // Don't create handlers for internal properties
        if (
          typeof entityName !== "string" ||
          entityName === "then" ||
          entityName.startsWith("_")
        ) {
          return undefined;
        }

        // Create entity handler
        return createEntityHandler(axios, appId, entityName, getSocket);
      },
    }
  ) as EntitiesModule;
}

/**
 * Parses the realtime message data and extracts event information.
 * @internal
 */
function parseRealtimeMessage(dataStr: string): RealtimeEvent | null {
  try {
    const parsed = JSON.parse(dataStr);
    return {
      type: parsed.type as RealtimeEventType,
      data: parsed.data,
      id: parsed.id || parsed.data?.id,
      timestamp: parsed.timestamp || new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[Base44 SDK] Failed to parse realtime message:", error);
    return null;
  }
}

/**
 * Creates a handler for a specific entity.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @param entityName - Entity name
 * @param getSocket - Function to get the socket instance
 * @returns Entity handler with CRUD methods
 * @internal
 */
function createEntityHandler(
  axios: AxiosInstance,
  appId: string,
  entityName: string,
  getSocket: () => ReturnType<typeof RoomsSocket>
): EntityHandler {
  const baseURL = `/apps/${appId}/entities/${entityName}`;

  return {
    // List entities with optional pagination and sorting
    async list(sort: string, limit: number, skip: number, fields: string[]) {
      const params: Record<string, string | number> = {};
      if (sort) params.sort = sort;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields)
        params.fields = Array.isArray(fields) ? fields.join(",") : fields;

      return axios.get(baseURL, { params });
    },

    // Filter entities based on query
    async filter(
      query: Record<string, any>,
      sort: string,
      limit: number,
      skip: number,
      fields: string[]
    ) {
      const params: Record<string, string | number> = {
        q: JSON.stringify(query),
      };

      if (sort) params.sort = sort;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields)
        params.fields = Array.isArray(fields) ? fields.join(",") : fields;

      return axios.get(baseURL, { params });
    },

    // Get entity by ID
    async get(id: string) {
      return axios.get(`${baseURL}/${id}`);
    },

    // Create new entity
    async create(data: Record<string, any>) {
      return axios.post(baseURL, data);
    },

    // Update entity by ID
    async update(id: string, data: Record<string, any>) {
      return axios.put(`${baseURL}/${id}`, data);
    },

    // Delete entity by ID
    async delete(id: string) {
      return axios.delete(`${baseURL}/${id}`);
    },

    // Delete multiple entities based on query
    async deleteMany(query: Record<string, any>) {
      return axios.delete(baseURL, { data: query });
    },

    // Create multiple entities in a single request
    async bulkCreate(data: Record<string, any>[]) {
      return axios.post(`${baseURL}/bulk`, data);
    },

    // Import entities from a file
    async importEntities(file: File) {
      const formData = new FormData();
      formData.append("file", file, file.name);

      return axios.post(`${baseURL}/import`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
    },

    // Subscribe to realtime updates
    subscribe(callback: RealtimeCallback): Subscription {
      const room = `entities:${appId}:${entityName}`;

      // Get the socket and subscribe to the room
      const socket = getSocket();
      const unsubscribe = socket.subscribeToRoom(room, {
        update_model: (msg) => {
          const event = parseRealtimeMessage(msg.data);
          if (!event) {
            return;
          }

          try {
            callback(event);
          } catch (error) {
            console.error("[Base44 SDK] Subscription callback error:", error);
          }
        },
      });

      return unsubscribe;
    },
  };
}
