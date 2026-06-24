import { AxiosInstance } from "axios";
import {
  DeleteManyResult,
  DeleteResult,
  EntitiesModule,
  EntityFilterQuery,
  EntityHandler,
  ImportResult,
  RealtimeCallback,
  RealtimeEvent,
  RealtimeEventType,
  SortField,
  UpdateManyResult,
} from "./entities.types";
import { RoomsSocket } from "../utils/socket-utils.js";
import type { Tool } from "./agents/agents.types.js";

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

  const handler: EntityHandler<T> = {
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
      query: EntityFilterQuery<T>,
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
        update_model: (msg) => {
          const event = parseRealtimeMessage<T>(msg.data);
          if (!event) {
            return;
          }

          // Server signals oversize broadcasts with `_oversize: true` on
          // `data`. The wire payload was slimmed to fit under the realtime
          // transport cap, so big string fields arrive as empty strings (or
          // the whole record collapses to a stub). Surface this to the
          // developer console so they know to fetch the full record on
          // demand (e.g. a follow-up entities.X.get(id) call) instead of
          // rendering the slimmed payload directly. Skip on delete events
          // — the record no longer exists.
          if (event.type !== "delete" && (event.data as any)?._oversize) {
            console.error(
              `[Base44 SDK] Realtime broadcast for ${entityName}#${event.id} was oversize and got slimmed for transport. ` +
                `Fields >10 KB are empty and the rest of the record may be a stub. ` +
                `Call \`entities.${entityName}.get("${event.id}")\` to fetch the full record.`
            );
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

    asTool(opts: { operations?: ("read" | "create" | "update" | "delete")[] } = {}): Record<string, Tool> {
      const operations = opts.operations ?? ["read"];
      const tools: Record<string, Tool> = {};

      if (operations.includes("read")) {
        tools[`read_${entityName}`] = {
          description: `Read ${entityName} entities. For the query param, use MongoDB query syntax, e.g. { "status": "open", "price": { "$gt": 30 } }.`,
          parameters: {
            type: "object",
            properties: {
              query: { type: "object", description: `MongoDB-style filter over ${entityName} fields.`, additionalProperties: true },
              sort: { type: "string", description: "Field to sort by; prefix with '-' for descending (e.g. '-created_date')." },
              limit: { type: "number", description: "Maximum number of records to return." },
              skip: { type: "number", description: "Number of records to skip (pagination)." },
              fields: { type: "array", items: { type: "string" }, description: "Subset of fields to return." },
            },
          },
          execute: (args: { query?: Record<string, unknown>; sort?: string; limit?: number; skip?: number; fields?: string[] } = {}) =>
            handler.filter((args.query ?? {}) as EntityFilterQuery<T>, args.sort as SortField<T> | undefined, args.limit, args.skip, args.fields as (keyof T)[] | undefined),
        };
      }
      if (operations.includes("create")) {
        tools[`create_${entityName}`] = {
          description: `Create a new ${entityName} entity`,
          // open object: the SDK has no runtime schema, so the model supplies fields directly
          parameters: { type: "object", additionalProperties: true },
          execute: (args: Record<string, unknown> = {}) => handler.create(args as Partial<T>),
        };
      }
      if (operations.includes("update")) {
        tools[`update_${entityName}`] = {
          description: `Update an existing ${entityName} entity`,
          parameters: {
            type: "object",
            properties: { id: { type: "string", description: `The id of the ${entityName} to update.` } },
            required: ["id"],
            additionalProperties: true,
          },
          execute: (args: { id: string } & Record<string, unknown>) => {
            const { id, ...data } = args ?? ({} as { id: string });
            return handler.update(id, data as Partial<T>);
          },
        };
      }
      if (operations.includes("delete")) {
        tools[`delete_${entityName}`] = {
          description: `Delete an existing ${entityName} entity`,
          parameters: {
            type: "object",
            properties: { id: { type: "string", description: `The id of the ${entityName} to delete.` } },
            required: ["id"],
          },
          execute: (args: { id: string }) => handler.delete(args.id),
        };
      }
      return tools;
    },
  };

  return handler;
}
