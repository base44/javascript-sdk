import { AxiosInstance } from "axios";
import {
  DeleteManyResult,
  DeleteResult,
  EntitiesModule,
  EntityAggregateResult,
  EntityAggregateSpec,
  EntityDistinctOptions,
  EntityFilterQuery,
  EntityHandler,
  EntityListOptions,
  EntityPage,
  EntityUpsertOptions,
  EntityUpsertResult,
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

const DEFAULT_PAGE_LIMIT = 100;

type PageOptions<T> = EntityListOptions<T, any> | EntityDistinctOptions<T, any>;

function isPageOptions(value: unknown): value is PageOptions<any> {
  return typeof value === "object" && value !== null;
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

  const fieldsParam = (fields?: readonly (keyof T)[]) =>
    Array.isArray(fields) ? fields.join(",") : (fields as string | undefined);

  // GET /{entity}: the array form shared by list() and filter()
  const readArray = (
    sort?: SortField<T>,
    limit?: number,
    skip?: number,
    fields?: (keyof T)[],
    query?: EntityFilterQuery<T>
  ) => {
    const params: Record<string, string | number> = {};
    if (query) params.q = JSON.stringify(query);
    if (sort) params.sort = sort;
    if (limit) params.limit = limit;
    if (skip) params.skip = skip;
    if (fields) params.fields = fieldsParam(fields)!;
    return axios.get(baseURL, { params });
  };

  // GET /{entity}/v2/list: one cursor page of records or distinct values, shared by list(options) and filter(query, options)
  const readPage = (options: PageOptions<T>, query?: EntityFilterQuery<T>) => {
    const params: Record<string, string | number> = {};
    if (query) params.q = JSON.stringify(query);
    params.limit = options.limit || DEFAULT_PAGE_LIMIT;
    if (options.cursor) params.cursor = options.cursor;
    if ("distinct" in options) {
      params.distinct = options.distinct;
    } else {
      if (options.sort) params.sort = options.sort;
      if (options.fields) params.fields = fieldsParam(options.fields)!;
    }
    return axios.get(`${baseURL}/v2/list`, { params });
  };

  return {
    // list(sort, limit, skip, fields) returns an array; list(options) returns one cursor page.
    async list(...args: any[]): Promise<any> {
      const [sort, limit, skip, fields] = args;
      return isPageOptions(sort) ? readPage(sort) : readArray(sort, limit, skip, fields);
    },

    // filter(query, sort, limit, skip, fields) returns an array; filter(query, options) returns one cursor page.
    async filter(query: EntityFilterQuery<T>, ...args: any[]): Promise<any> {
      const [sort, limit, skip, fields] = args;
      return isPageOptions(sort) ? readPage(sort, query) : readArray(sort, limit, skip, fields, query);
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

    // Count entities matching a query
    async count(query?: EntityFilterQuery<T>): Promise<number> {
      const params: Record<string, string> = {};
      if (query) params.q = JSON.stringify(query);
      const result: { count: number } = await axios.get(`${baseURL}/count`, { params });
      return result.count;
    },

    // Server-side group-by aggregation
    async aggregate(spec: EntityAggregateSpec<T>): Promise<EntityAggregateResult> {
      return axios.post(`${baseURL}/aggregate`, spec);
    },

    // Create or update by a natural key
    async upsert(
      records: Partial<T>[],
      options: EntityUpsertOptions<T>
    ): Promise<EntityUpsertResult<T>> {
      return axios.post(`${baseURL}/upsert`, { records, key: options.key });
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
  };
}
