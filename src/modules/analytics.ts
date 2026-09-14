import { AxiosInstance } from "axios";
import {
  TrackEventParams,
  TrackEventIntrinsicData,
  AnalyticsModuleOptions,
  SessionContext,
} from "./analytics.types";
import { getSharedInstance } from "../utils/sharedInstance.js";
import type { InternalAuthModule } from "./auth.types";
import { generateUuid, isReactNative } from "../utils/common.js";
import { getExperimentsRuntime } from "./experiments-runtime.types.js";
import type { ExperimentsContext } from "./experiments-config.types.js";
import { getAnalyticsQueue } from "./analytics-queue.js";

export const USER_HEARTBEAT_EVENT_NAME = "__user_heartbeat_event__";
export const ANALYTICS_INITIALIZATION_EVENT_NAME = "__initialization_event__";
export const ANALYTICS_SESSION_DURATION_EVENT_NAME =
  "__session_duration_event__";
export const ANALYTICS_CONFIG_ENABLE_URL_PARAM_KEY = "analytics-enable";

export const ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY =
  "base44_analytics_session_id";

const defaultConfiguration: AnalyticsModuleOptions = {
  // default to enabled //
  enabled: true,
  maxQueueSize: 1000,
  throttleTime: 1000,
  batchSize: 30,
  heartBeatInterval: 60 * 1000,
};

const ANALYTICS_SHARED_STATE_NAME = "analytics";
function createAnalyticsState() {
  return {
    isHeartBeatProcessing: false,
    wasInitializationTracked: false,
    sessionContext: null as SessionContext | null,
    sessionContextPromise: null as Promise<SessionContext> | null,
    sessionStartTime: null as string | null,
    // Memoized session id for when `localStorage` can't persist one — see
    // getAnalyticsSessionId.
    fallbackSessionId: null as string | null,
    config: {
      ...defaultConfiguration,
      ...getAnalyticsConfigFromUrlParams(),
    } as Required<AnalyticsModuleOptions>,
  };
}
type AnalyticsState = ReturnType<typeof createAnalyticsState>;
const analyticsSharedState = getSharedInstance(ANALYTICS_SHARED_STATE_NAME, createAnalyticsState);
const clientAnalyticsStates = new WeakMap<AxiosInstance, AnalyticsState>();

/** @internal */
export function getAnalyticsState(axiosClient: AxiosInstance): AnalyticsState {
  let state = clientAnalyticsStates.get(axiosClient);
  if (!state) {
    state = createAnalyticsState();
    if (typeof window !== "undefined") {
      state.config = analyticsSharedState.config;
    }
    clientAnalyticsStates.set(axiosClient, state);
  }
  return state;
}

export interface AnalyticsModuleArgs {
  axiosClient: AxiosInstance;
  serverUrl: string;
  appId: string;
  userAuthModule: InternalAuthModule;
  enabled: boolean;
  getVisitorId?: () => string | undefined;
  experimentsContext?: ExperimentsContext;
}

/** @internal */
export function isAnalyticsEnabled(enabled: boolean, state = analyticsSharedState): boolean {
  return enabled && state.config.enabled && !isReactNative;
}

export const createAnalyticsModule = ({
  axiosClient,
  appId,
  userAuthModule,
  enabled,
  getVisitorId,
  experimentsContext,
}: AnalyticsModuleArgs) => {
  const state = getAnalyticsState(axiosClient);
  const automaticState = typeof window === "undefined" ? state : analyticsSharedState;
  const queue = getAnalyticsQueue(axiosClient, appId, state.config);

  // Disable analytics on React Native. It defines `window` but not `document`,
  // so the per-callsite `typeof window` guards below aren't enough to keep it
  // from touching `document` (e.g. `document.referrer` on init). Node/SSR is
  // still handled by those `window` guards, so this doesn't affect it.
  if (!isAnalyticsEnabled(enabled, state)) {
    return {
      track: () => {},
      cleanup: () => {},
    };
  }

  let clearHeartBeatProcessor: (() => void) | undefined = undefined;
  const track = (params: TrackEventParams) => {
    const intrinsicData = getEventIntrinsicData();
    const visitorId = getVisitorId?.() ?? getAnalyticsSessionId(state);
    const authorization = userAuthModule.hasToken() ? axiosClient.defaults.headers.common.Authorization : null;
    const context = getSessionContext(userAuthModule, state);
    const preview = Object.fromEntries(
      Object.entries(experimentsContext?.preview ?? {}).filter(([, value]) => typeof value === "boolean"),
    );
    const properties = { ...params.properties };
    delete properties.__b44_experiment_preview;
    if (Object.keys(preview).length) {
      // Capture now: a queued event must retain its occurrence-time preview.
      properties.__b44_experiment_preview = JSON.stringify(preview);
    }
    const event = {
      event_name: params.eventName,
      timestamp: intrinsicData.timestamp,
      page_url: intrinsicData.pageUrl,
      properties: params.properties || Object.keys(properties).length ? properties : undefined,
    };
    queue.enqueue(context.then((identity) => ({ ...event, ...identity, session_id: visitorId })),
      typeof authorization === "string" ? authorization : null,
      context.then((identity) => identity.user_id ?? null));
  };

  const onDocVisible = () => {
    clearHeartBeatProcessor = startHeartBeatProcessor(track, automaticState);
    setSessionDurationTimerStart(automaticState);
  };

  const onDocHidden = () => {
    clearHeartBeatProcessor?.();
    trackSessionDurationEvent(track, automaticState);

    void queue.flush();
  };

  const onVisibilityChange = () => {
    if (typeof window === "undefined") return;
    if (document.visibilityState === "hidden") {
      onDocHidden();
    } else if (document.visibilityState === "visible") {
      onDocVisible();
    }
  };

  const cleanup = () => {
    queue.cleanup();
    clearHeartBeatProcessor?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };

  // start the heart beat processor //
  clearHeartBeatProcessor = startHeartBeatProcessor(track, automaticState);
  // track the referrer event //
  trackInitializationEvent(track, automaticState);
  // start the visibility change listener //
  if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    track,
    cleanup,
  };
};

function startHeartBeatProcessor(track: (params: TrackEventParams) => void, state: AnalyticsState) {
  // Browser-only, like the other automatic events here (initialization, session
  // duration, visibility). Outside a browser this timer fired a `me()` every
  // interval for the lifetime of a long-lived server-side client, and kept the
  // Node event loop alive. Explicit `analytics.track()` calls still work.
  if (
    typeof window === "undefined" ||
    state.isHeartBeatProcessing ||
    (state.config.heartBeatInterval ?? 0) < 10
  ) {
    return () => {};
  }

  state.isHeartBeatProcessing = true;
  const interval = setInterval(() => {
    track({ eventName: USER_HEARTBEAT_EVENT_NAME });
  }, state.config.heartBeatInterval);

  return () => {
    clearInterval(interval);
    state.isHeartBeatProcessing = false;
  };
}

function trackInitializationEvent(track: (params: TrackEventParams) => void, state: AnalyticsState) {
  if (
    typeof window === "undefined" ||
    state.wasInitializationTracked
  ) {
    return;
  }

  state.wasInitializationTracked = true;
  track({
    eventName: ANALYTICS_INITIALIZATION_EVENT_NAME,
    properties: {
      referrer: document?.referrer,
    },
  });
}

function setSessionDurationTimerStart(state: AnalyticsState) {
  if (
    typeof window === "undefined" ||
    state.sessionStartTime !== null
  ) {
    return;
  }
  state.sessionStartTime = new Date().toISOString();
}
function trackSessionDurationEvent(track: (params: TrackEventParams) => void, state: AnalyticsState) {
  if (
    typeof window === "undefined" ||
    state.sessionStartTime === null
  )
    return;
  const sessionDuration =
    new Date().getTime() -
    new Date(state.sessionStartTime).getTime();
  state.sessionStartTime = null;
  track({
    eventName: ANALYTICS_SESSION_DURATION_EVENT_NAME,
    properties: { sessionDuration },
  });
}

function getEventIntrinsicData(): TrackEventIntrinsicData {
  return {
    timestamp: new Date().toISOString(),
    // `window.location` is absent on React Native, so read it optionally.
    pageUrl:
      typeof window !== "undefined" ? window.location?.pathname ?? null : null,
  };
}

/**
 * Clears the memoized analytics session context.
 *
 * The context holds the `user_id` resolved by `auth.me()` and is reused for the
 * lifetime of the session, so it has to be dropped whenever the identity
 * changes. Without this, a visitor who loads a page anonymously and then logs in
 * keeps reporting `user_id: null` on every subsequent event.
 *
 * @internal
 */
export function resetAnalyticsSessionContext(axiosClient?: AxiosInstance) {
  const state = axiosClient ? getAnalyticsState(axiosClient) : analyticsSharedState;
  state.sessionContext = null;
  state.sessionContextPromise = null;
}

async function getSessionContext(
  userAuthModule: InternalAuthModule,
  state: AnalyticsState,
): Promise<SessionContext> {
  if (!state.sessionContext) {
    // With no token there is no identity to resolve: `me()` can only answer 401,
    // which the browser logs to the console before any handler here sees it. On
    // a public page that request is the sole reason an error appears, so skip
    // it. This is not memoized — a visitor who logs in later must still resolve.
    if (!userAuthModule.hasToken()) {
      return { user_id: null, session_id: getAnalyticsSessionId(state) };
    }

    if (!state.sessionContextPromise) {
      const sessionId = getAnalyticsSessionId(state);
      state.sessionContextPromise = userAuthModule
        .me()
        .then((user) => ({
          user_id: user.id,
          session_id: sessionId,
        }))
        .catch(() => ({
          user_id: null,
          session_id: sessionId,
        }));
    }
    const pending = state.sessionContextPromise;
    const context = await pending;
    // Publish only if this lookup is still the current one. A reset that lands
    // while the request is in flight nulls `sessionContextPromise`, and an
    // unconditional write here would put the pre-reset identity back and pin it
    // for the rest of the session. The awaited value is still returned: these
    // events were queued before the identity changed, so that is who they
    // belong to.
    if (state.sessionContextPromise === pending) {
      state.sessionContext = context;
    }
    return context;
  }
  return state.sessionContext;
}

export function getAnalyticsConfigFromUrlParams():
  | AnalyticsModuleOptions
  | undefined {
  // `window.location` is absent on React Native. This runs at module load (via
  // the shared-state factory), so an unguarded `window.location.search` would
  // throw on import there.
  if (typeof window === "undefined" || !window.location) return undefined;
  const urlParams = new URLSearchParams(window.location.search);
  const analyticsEnable = urlParams.get(ANALYTICS_CONFIG_ENABLE_URL_PARAM_KEY);

  // if the url param is not set, return undefined //
  if (analyticsEnable == null || !analyticsEnable.length) return undefined;

  // remove the url param from the url //
  const newUrlParams = new URLSearchParams(window.location.search);
  newUrlParams.delete(ANALYTICS_CONFIG_ENABLE_URL_PARAM_KEY);
  const newUrl =
    window.location.pathname +
    (newUrlParams.toString() ? "?" + newUrlParams.toString() : "");
  window.history.replaceState({}, "", newUrl);

  // return the config object //
  return { enabled: analyticsEnable === "true" };
}

// Without persistent storage, keep the id stable within this analytics state.
function getFallbackSessionId(state: AnalyticsState): string {
  return (state.fallbackSessionId ??= generateUuid());
}

export function getAnalyticsSessionId(state = analyticsSharedState): string {
  const visitorId = getExperimentsRuntime()?.visitorId;
  if (visitorId && visitorId !== "anon") return visitorId;
  if (typeof window === "undefined") {
    return getFallbackSessionId(state);
  }
  try {
    const sessionId = localStorage.getItem(
      ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY
    );
    if (!sessionId) {
      const newSessionId = generateUuid();
      localStorage.setItem(
        ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY,
        newSessionId
      );
      return newSessionId;
    }
    return sessionId;
  } catch {
    return getFallbackSessionId(state);
  }
}
