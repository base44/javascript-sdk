import { AxiosInstance } from "axios";
import {
  DeleteManyResult,
  DeleteResult,
  EntitiesModule,
  EntityHandler,
  ImportResult,
  RealtimeCallback,
  RealtimeEvent,
  RealtimeEventType,
  SortField,
  UpdateManyResult,
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
function parseRealtimeMessage<T = any>(dataStr: string): RealtimeEvent<T> | null {
  try {
    const parsed = JSON.parse(dataStr);
    return {
      type: parsed.type as RealtimeEventType,
      data: parsed.data as T,
      id: parsed.id || parsed.data?.id,
      timestamp: parsed.timestamp || new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[Base44 SDK] Failed to parse realtime message:", error);
    return null;
  }
}

// In-flight HTTP refetches for oversize realtime events. Lets multiple
// subscribers in the same browser (e.g. several React components subscribed
// to the same entity) share one HTTP call when they all receive the same
// oversize event. Keyed by `${entityName}:${id}:${timestamp}` so distinct
// updates are not collapsed.
const inflightRefetches = new Map<string, Promise<any>>();

/**
 * Refetches a record over HTTP after the server signaled it had to slim the
 * realtime broadcast (`_oversize: true`). Reuses an in-flight promise if
 * one exists for the same (entityName, id, timestamp) so concurrent
 * subscribers in the same browser fan out to a single HTTP call.
 * @internal
 */
function refetchTruncated<T>(
  axios: AxiosInstance,
  baseURL: string,
  entityName: string,
  id: string,
  timestamp: string
): Promise<T> {
  const key = `${entityName}:${id}:${timestamp}`;
  let promise = inflightRefetches.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = axios.get(`${baseURL}/${id}`) as Promise<T>;
    inflightRefetches.set(key, promise);
    // Clear the cache entry after the promise settles plus a short grace
    // window so late subscribers can still piggy-back on the result. Use
    // .then(success, failure) instead of .finally to avoid creating an
    // unhandled rejection tail when the underlying axios call rejects.
    const cleanup = () => setTimeout(() => inflightRefetches.delete(key), 5_000);
    promise.then(cleanup, cleanup);
  }
  return promise;
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
function createEntityHandler<T = any>(
  axios: AxiosInstance,
  appId: string,
  entityName: string,
  getSocket: () => ReturnType<typeof RoomsSocket>
): EntityHandler<T> {
  const baseURL = `/apps/${appId}/entities/${entityName}`;

  return {
    // List entities with optional pagination and sorting
    async list<K extends keyof T = keyof T>(
      sort?: SortField<T>,
      limit?: number,
      skip?: number,
      fields?: K[]
    ): Promise<Pick<T, K>[]> {
      const params: Record<string, string | number> = {};
      if (sort) params.sort = sort;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields)
        params.fields = Array.isArray(fields) ? fields.join(",") : fields;

      return axios.get(baseURL, { params });
    },

    // Filter entities based on query
    async filter<K extends keyof T = keyof T>(
      query: Partial<T>,
      sort?: SortField<T>,
      limit?: number,
      skip?: number,
      fields?: K[]
    ): Promise<Pick<T, K>[]> {
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
    async get(id: string): Promise<T> {
      return axios.get(`${baseURL}/${id}`);
    },

    // Create new entity
    async create(data: Partial<T>): Promise<T> {
      return axios.post(baseURL, data);
    },

    // Update entity by ID
    async update(id: string, data: Partial<T>): Promise<T> {
      return axios.put(`${baseURL}/${id}`, data);
    },

    // Delete entity by ID
    async delete(id: string): Promise<DeleteResult> {
      return axios.delete(`${baseURL}/${id}`);
    },

    // Delete multiple entities based on query
    async deleteMany(query: Partial<T>): Promise<DeleteManyResult> {
      return axios.delete(baseURL, { data: query });
    },

    // Create multiple entities in a single request
    async bulkCreate(data: Partial<T>[]): Promise<T[]> {
      return axios.post(`${baseURL}/bulk`, data);
    },

    // Update multiple entities matching a query using a MongoDB update operator
    async updateMany(query: Partial<T>, data: Record<string, Record<string, any>>): Promise<UpdateManyResult> {
      return axios.patch(`${baseURL}/update-many`, { query, data });
    },

    // Update multiple entities by ID, each with its own update data
    async bulkUpdate(data: (Partial<T> & { id: string })[]): Promise<T[]> {
      return axios.put(`${baseURL}/bulk`, data);
    },

    // Import entities from a file
    async importEntities(file: File): Promise<ImportResult<T>> {
      const formData = new FormData();
      formData.append("file", file, file.name);

      return axios.post(`${baseURL}/import`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
    },

    // Subscribe to realtime updates
    subscribe(callback: RealtimeCallback<T>): () => void {
      const room = `entities:${appId}:${entityName}`;

      // Get the socket and subscribe to the room
      const socket = getSocket();
      const unsubscribe = socket.subscribeToRoom(room, {
        update_model: async (msg) => {
          const event = parseRealtimeMessage<T>(msg.data);
          if (!event) {
            return;
          }

          // Server signals oversize broadcasts with `_oversize: true` on
          // `data`. The wire payload is bounded for transport; we transparently
          // refetch the full record over HTTP so callers always see complete
          // data. Skip on delete events — the record no longer exists.
          if (event.type !== "delete" && (event.data as any)?._oversize) {
            try {
              event.data = await refetchTruncated<T>(
                axios,
                baseURL,
                entityName,
                event.id,
                event.timestamp
              );
            } catch (error) {
              console.warn(
                "[Base44 SDK] Failed to refetch oversize entity, falling through with stub payload:",
                error
              );
              // event.data stays as the `{id, _oversize: true}` stub; user
              // code receives partial data — same UX as today's drop-and-stale.
            }
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
