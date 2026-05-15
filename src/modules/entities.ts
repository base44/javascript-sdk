import { AxiosInstance } from "axios";
import {
  DeleteManyResult,
  DeleteResult,
  EntitiesModule,
  EntityFilterQuery,
  EntityHandler,
  EntitySubscriptionOptions,
  ImportResult,
  RealtimeCallback,
  RealtimeEvent,
  RealtimeEventType,
  SortField,
  UpdateManyResult,
} from "./entities.types";
import type { TrackEventParams } from "./analytics.types";
import { RoomsSocket } from "../utils/socket-utils.js";

/**
 * Configuration for the entities module.
 * @internal
 */
export interface EntitiesModuleConfig {
  axios: AxiosInstance;
  appId: string;
  getSocket: () => ReturnType<typeof RoomsSocket>;
  subscriptionOptions?: EntitySubscriptionOptions;
  trackSubscriptionEvent?: (params: TrackEventParams) => void;
}

const DEFAULT_MAX_ACTIVE_ENTITY_SUBSCRIPTIONS = 100;
const DEFAULT_SUBSCRIPTION_CHURN_WARNING_THRESHOLD = 20;
const DEFAULT_SUBSCRIPTION_CHURN_WINDOW_MS = 60_000;
const DEFAULT_EMPTY_ROOM_GRACE_MS = 1_000;
const ENTITY_SUBSCRIPTION_WARNING_EVENT_NAME =
  "__entity_subscription_warning__";

type SubscriptionChurnAction = "subscribe" | "unsubscribe";

type NormalizedEntitySubscriptionOptions = Required<EntitySubscriptionOptions>;

interface EntitySubscriptionManager {
  subscribe<T>(entityName: string, callback: RealtimeCallback<T>): () => void;
}

interface EntitySubscriptionState {
  room: string;
  entityName: string;
  callbacks: Map<number, RealtimeCallback<any>>;
  unsubscribeFromRoom: () => void;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

interface SubscriptionChurnRecord {
  action: SubscriptionChurnAction;
  timestamp: number;
}

interface SubscriptionChurnState {
  events: SubscriptionChurnRecord[];
  lastWarningAt: number | null;
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
  const entityHandlers = new Map<string, EntityHandler<any>>();
  const subscriptionManager = createEntitySubscriptionManager({
    appId,
    getSocket,
    options: config.subscriptionOptions,
    trackSubscriptionEvent: config.trackSubscriptionEvent,
  });

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

        const cachedHandler = entityHandlers.get(entityName);
        if (cachedHandler) {
          return cachedHandler;
        }

        // Create entity handler
        const handler = createEntityHandler(
          axios,
          appId,
          entityName,
          subscriptionManager
        );
        entityHandlers.set(entityName, handler);
        return handler;
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

function normalizeEntitySubscriptionOptions(
  options?: EntitySubscriptionOptions
): NormalizedEntitySubscriptionOptions {
  return {
    maxActiveSubscriptions: normalizePositiveInteger(
      options?.maxActiveSubscriptions,
      DEFAULT_MAX_ACTIVE_ENTITY_SUBSCRIPTIONS
    ),
    churnWarningThreshold: normalizePositiveInteger(
      options?.churnWarningThreshold,
      DEFAULT_SUBSCRIPTION_CHURN_WARNING_THRESHOLD
    ),
    churnWindowMs: normalizePositiveInteger(
      options?.churnWindowMs,
      DEFAULT_SUBSCRIPTION_CHURN_WINDOW_MS
    ),
    emptyRoomGraceMs: normalizeNonNegativeInteger(
      options?.emptyRoomGraceMs,
      DEFAULT_EMPTY_ROOM_GRACE_MS
    ),
  };
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function createEntitySubscriptionManager({
  appId,
  getSocket,
  options,
  trackSubscriptionEvent,
}: {
  appId: string;
  getSocket: () => ReturnType<typeof RoomsSocket>;
  options?: EntitySubscriptionOptions;
  trackSubscriptionEvent?: (params: TrackEventParams) => void;
}): EntitySubscriptionManager {
  const normalizedOptions = normalizeEntitySubscriptionOptions(options);
  const activeSubscriptions = new Map<string, EntitySubscriptionState>();
  const churnByRoom = new Map<string, SubscriptionChurnState>();
  const roomsWarnedForCap = new Set<string>();
  let nextCallbackId = 1;

  function makeRoom(entityName: string) {
    return `entities:${appId}:${entityName}`;
  }

  function emitWarning(
    message: string,
    properties: NonNullable<TrackEventParams["properties"]>
  ) {
    console.warn(message);

    try {
      trackSubscriptionEvent?.({
        eventName: ENTITY_SUBSCRIPTION_WARNING_EVENT_NAME,
        properties,
      });
    } catch {
      // Diagnostics should never break application code.
    }
  }

  function recordSubscriptionActivity(
    room: string,
    entityName: string,
    action: SubscriptionChurnAction
  ) {
    const now = Date.now();
    const churnState =
      churnByRoom.get(room) ??
      ({
        events: [],
        lastWarningAt: null,
      } satisfies SubscriptionChurnState);

    churnState.events = churnState.events.filter(
      (event) => now - event.timestamp <= normalizedOptions.churnWindowMs
    );
    churnState.events.push({ action, timestamp: now });
    churnByRoom.set(room, churnState);

    const subscribeCount = churnState.events.filter(
      (event) => event.action === "subscribe"
    ).length;
    const unsubscribeCount = churnState.events.length - subscribeCount;

    if (
      churnState.events.length < normalizedOptions.churnWarningThreshold ||
      subscribeCount === 0 ||
      unsubscribeCount === 0 ||
      (churnState.lastWarningAt !== null &&
        now - churnState.lastWarningAt < normalizedOptions.churnWindowMs)
    ) {
      return;
    }

    churnState.lastWarningAt = now;
    emitWarning(
      `[Base44 SDK] entities.${entityName}.subscribe() is being created and cleaned up repeatedly ` +
        `(${churnState.events.length} subscribe/unsubscribe operations in ` +
        `${normalizedOptions.churnWindowMs}ms). Keep realtime subscriptions in a stable lifecycle to avoid socket churn.`,
      {
        reason: "subscription_churn",
        app_id: appId,
        entity: entityName,
        room,
        action,
        activity_count: churnState.events.length,
        subscribe_count: subscribeCount,
        unsubscribe_count: unsubscribeCount,
        churn_window_ms: normalizedOptions.churnWindowMs,
        empty_room_grace_ms: normalizedOptions.emptyRoomGraceMs,
        churn_warning_threshold:
          normalizedOptions.churnWarningThreshold,
      }
    );
  }

  function warnForSubscriptionCap(room: string, entityName: string) {
    if (roomsWarnedForCap.has(room)) {
      return;
    }

    roomsWarnedForCap.add(room);
    emitWarning(
      `[Base44 SDK] Realtime entity subscription cap reached ` +
        `(${normalizedOptions.maxActiveSubscriptions} active entities per SDK client/tab). ` +
        `Skipping entities.${entityName}.subscribe(). Unsubscribe from unused entity subscriptions before subscribing to more entities.`,
      {
        reason: "active_subscription_cap",
        app_id: appId,
        entity: entityName,
        room,
        active_subscription_count: activeSubscriptions.size,
        max_active_subscriptions:
          normalizedOptions.maxActiveSubscriptions,
      }
    );
  }

  function closeRoomSubscription(state: EntitySubscriptionState) {
    clearPendingClose(state);
    state.unsubscribeFromRoom();
    activeSubscriptions.delete(state.room);

    if (
      activeSubscriptions.size < normalizedOptions.maxActiveSubscriptions
    ) {
      roomsWarnedForCap.clear();
    }
  }

  function clearPendingClose(state: EntitySubscriptionState) {
    if (!state.closeTimer) {
      return;
    }

    clearTimeout(state.closeTimer);
    state.closeTimer = null;
  }

  function scheduleRoomClose(state: EntitySubscriptionState) {
    if (state.closeTimer) {
      return;
    }

    if (normalizedOptions.emptyRoomGraceMs === 0) {
      closeRoomSubscription(state);
      return;
    }

    const closeTimer = setTimeout(() => {
      state.closeTimer = null;

      if (
        state.callbacks.size === 0 &&
        activeSubscriptions.get(state.room) === state
      ) {
        closeRoomSubscription(state);
      }
    }, normalizedOptions.emptyRoomGraceMs);

    closeTimer.unref?.();
    state.closeTimer = closeTimer;
  }

  function dispatchRealtimeMessage(
    state: EntitySubscriptionState,
    dataStr: string
  ) {
    if (state.callbacks.size === 0) {
      return;
    }

    const event = parseRealtimeMessage(dataStr);
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
        `[Base44 SDK] Realtime broadcast for ${state.entityName}#${event.id} was oversize and got slimmed for transport. ` +
          `Fields >10 KB are empty and the rest of the record may be a stub. ` +
          `Call \`entities.${state.entityName}.get("${event.id}")\` to fetch the full record.`
      );
    }

    Array.from(state.callbacks.values()).forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error("[Base44 SDK] Subscription callback error:", error);
      }
    });
  }

  function openRoomSubscription(entityName: string, room: string) {
    const state: EntitySubscriptionState = {
      room,
      entityName,
      callbacks: new Map(),
      unsubscribeFromRoom: () => {},
      closeTimer: null,
    };
    const socket = getSocket();

    state.unsubscribeFromRoom = socket.subscribeToRoom(room, {
      update_model: (msg) => {
        dispatchRealtimeMessage(state, msg.data);
      },
    });
    activeSubscriptions.set(room, state);
    return state;
  }

  return {
    subscribe<T>(entityName: string, callback: RealtimeCallback<T>) {
      const room = makeRoom(entityName);
      recordSubscriptionActivity(room, entityName, "subscribe");

      let state = activeSubscriptions.get(room);
      if (!state) {
        if (
          activeSubscriptions.size >=
          normalizedOptions.maxActiveSubscriptions
        ) {
          warnForSubscriptionCap(room, entityName);
          return () => {};
        }
        state = openRoomSubscription(entityName, room);
      } else {
        clearPendingClose(state);
      }

      const callbackId = nextCallbackId++;
      state.callbacks.set(callbackId, callback as RealtimeCallback<any>);

      let unsubscribed = false;
      return () => {
        if (unsubscribed) {
          return;
        }
        unsubscribed = true;
        recordSubscriptionActivity(room, entityName, "unsubscribe");
        state.callbacks.delete(callbackId);

        if (
          state.callbacks.size === 0 &&
          activeSubscriptions.get(room) === state
        ) {
          scheduleRoomClose(state);
        }
      };
    },
  };
}

/**
 * Creates a handler for a specific entity.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @param entityName - Entity name
 * @param subscriptionManager - Shared realtime subscription manager
 * @returns Entity handler with CRUD methods
 * @internal
 */
function createEntityHandler<T = any>(
  axios: AxiosInstance,
  appId: string,
  entityName: string,
  subscriptionManager: EntitySubscriptionManager
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
      return subscriptionManager.subscribe(entityName, callback);
    },
  };
}
