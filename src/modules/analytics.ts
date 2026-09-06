import { AxiosInstance } from "axios";
import {
  TrackEventParams,
  TrackEventData,
  AnalyticsApiRequestData,
  AnalyticsApiBatchRequest,
  TrackEventIntrinsicData,
  AnalyticsModuleOptions,
  SessionContext,
} from "./analytics.types";
import { getSharedInstance } from "../utils/sharedInstance.js";
import type { InternalAuthModule } from "./auth.types";
import { generateUuid, isReactNative } from "../utils/common.js";

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

///////////////////////////////////////////////
//// shared queue for analytics events     ////
///////////////////////////////////////////////

const ANALYTICS_SHARED_STATE_NAME = "analytics";
// shared state//
const analyticsSharedState = getSharedInstance(
  ANALYTICS_SHARED_STATE_NAME,
  () => ({
    requestsQueue: [] as TrackEventData[],
    isProcessing: false,
    isHeartBeatProcessing: false,
    wasInitializationTracked: false,
    sessionContext: null as SessionContext | null,
    sessionStartTime: null as string | null,
    // Memoized session id for when `localStorage` can't persist one. See
    // getAnalyticsSessionId.
    fallbackSessionId: null as string | null,
    config: {
      ...defaultConfiguration,
      ...getAnalyticsConfigFromUrlParams(),
    } as Required<AnalyticsModuleOptions>,
  })
);

///////////////////////////////////////////////

export interface AnalyticsModuleArgs {
  axiosClient: AxiosInstance;
  serverUrl: string;
  appId: string;
  userAuthModule: InternalAuthModule;
  enabled: boolean;
}

export const createAnalyticsModule = ({
  axiosClient,
  serverUrl,
  appId,
  userAuthModule,
  enabled,
}: AnalyticsModuleArgs) => {
  // prevent overflow of events //
  const { maxQueueSize, throttleTime, batchSize } = analyticsSharedState.config;

  // Disable analytics on React Native. It defines `window` but not `document`,
  // so the per-callsite `typeof window` guards below aren't enough to keep it
  // from touching `document` (e.g. `document.referrer` on init). Node/SSR is
  // still handled by those `window` guards, so this doesn't affect it.
  if (!enabled || !analyticsSharedState.config?.enabled || isReactNative) {
    return {
      track: () => {},
      cleanup: () => {},
    };
  }

  let clearHeartBeatProcessor: (() => void) | undefined = undefined;
  const trackBatchUrl = `${serverUrl}/api/apps/${appId}/analytics/track/batch`;

  const batchRequestFallback = async (events: AnalyticsApiRequestData[]) => {
    await axiosClient.request({
      method: "POST",
      url: `/apps/${appId}/analytics/track/batch`,
      data: { events },
    } as AnalyticsApiBatchRequest);
  };

  // currently disabled, until fully tested  //
  const beaconRequest = (events: AnalyticsApiRequestData[]) => {
    try {
      const beaconPayload = JSON.stringify({ events });
      const blob = new Blob([beaconPayload], { type: "application/json" });
      return (
        typeof navigator === "undefined" ||
        beaconPayload.length > 60000 ||
        !navigator.sendBeacon(trackBatchUrl, blob)
      );
    } catch {
      return false;
    }
  };

  const flush = async (
    eventsData: TrackEventData[],
    options: { isBeacon?: boolean } = {}
  ) => {
    if (eventsData.length === 0) return;

    const sessionContext_ = await getSessionContext(userAuthModule);
    const events = eventsData.map(
      transformEventDataToApiRequestData(sessionContext_)
    );

    try {
      if (!options.isBeacon || !beaconRequest(events)) {
        await batchRequestFallback(events);
      }
    } catch {
      // do nothing
    }
  };

  const startProcessing = () => {
    startAnalyticsProcessor(flush, {
      throttleTime,
      batchSize,
    });
  };

  const track = (params: TrackEventParams) => {
    if (analyticsSharedState.requestsQueue.length >= maxQueueSize) {
      return;
    }
    const intrinsicData = getEventIntrinsicData();
    analyticsSharedState.requestsQueue.push({
      ...params,
      ...intrinsicData,
    });
    startProcessing();
  };

  const onDocVisible = () => {
    startAnalyticsProcessor(flush, {
      throttleTime,
      batchSize,
    });
    clearHeartBeatProcessor = startHeartBeatProcessor(track);
    setSessionDurationTimerStart();
  };

  const onDocHidden = () => {
    stopAnalyticsProcessor();
    clearHeartBeatProcessor?.();
    trackSessionDurationEvent(track);

    //  flush entire queue on visibility change and hope for the best //
    const eventsData = analyticsSharedState.requestsQueue.splice(0);
    flush(eventsData, { isBeacon: true });
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
    stopAnalyticsProcessor();
    clearHeartBeatProcessor?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };

  // start the flusing process ///
  startProcessing();
  // start the heart beat processor //
  clearHeartBeatProcessor = startHeartBeatProcessor(track);
  // track the referrer event //
  trackInitializationEvent(track);
  // start the visibility change listener //
  if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    track,
    cleanup,
  };
};

function stopAnalyticsProcessor() {
  analyticsSharedState.isProcessing = false;
}

async function startAnalyticsProcessor(
  handleTrack: (eventsData: TrackEventData[]) => Promise<void>,
  options?: {
    throttleTime: number;
    batchSize: number;
  }
) {
  if (analyticsSharedState.isProcessing) {
    // only one instance of the analytics processor can be running at a time //
    return;
  }
  analyticsSharedState.isProcessing = true;

  const { throttleTime = 1000, batchSize = 30 } = options ?? {};
  while (
    analyticsSharedState.isProcessing &&
    analyticsSharedState.requestsQueue.length > 0
  ) {
    const requests = analyticsSharedState.requestsQueue.splice(0, batchSize);
    requests.length && (await handleTrack(requests));
    await new Promise((resolve) => setTimeout(resolve, throttleTime));
  }
  analyticsSharedState.isProcessing = false;
}

function startHeartBeatProcessor(track: (params: TrackEventParams) => void) {
  // Browser-only, like the other automatic events here (initialization, session
  // duration, visibility). Outside a browser this timer fired a `me()` every
  // interval for the lifetime of a long-lived server-side client, and kept the
  // Node event loop alive. Explicit `analytics.track()` calls still work.
  if (
    typeof window === "undefined" ||
    analyticsSharedState.isHeartBeatProcessing ||
    (analyticsSharedState.config.heartBeatInterval ?? 0) < 10
  ) {
    return () => {};
  }

  analyticsSharedState.isHeartBeatProcessing = true;
  const interval = setInterval(() => {
    track({ eventName: USER_HEARTBEAT_EVENT_NAME });
  }, analyticsSharedState.config.heartBeatInterval);

  return () => {
    clearInterval(interval);
    analyticsSharedState.isHeartBeatProcessing = false;
  };
}

function trackInitializationEvent(track: (params: TrackEventParams) => void) {
  if (
    typeof window === "undefined" ||
    analyticsSharedState.wasInitializationTracked
  ) {
    return;
  }

  analyticsSharedState.wasInitializationTracked = true;
  track({
    eventName: ANALYTICS_INITIALIZATION_EVENT_NAME,
    properties: {
      referrer: document?.referrer,
    },
  });
}

function setSessionDurationTimerStart() {
  if (
    typeof window === "undefined" ||
    analyticsSharedState.sessionStartTime !== null
  ) {
    return;
  }
  analyticsSharedState.sessionStartTime = new Date().toISOString();
}
function trackSessionDurationEvent(track: (params: TrackEventParams) => void) {
  if (
    typeof window === "undefined" ||
    analyticsSharedState.sessionStartTime === null
  )
    return;
  const sessionDuration =
    new Date().getTime() -
    new Date(analyticsSharedState.sessionStartTime).getTime();
  analyticsSharedState.sessionStartTime = null;
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

function transformEventDataToApiRequestData(sessionContext: SessionContext) {
  return (eventData: TrackEventData): AnalyticsApiRequestData => ({
    event_name: eventData.eventName,
    properties: eventData.properties,
    timestamp: eventData.timestamp,
    page_url: eventData.pageUrl,
    ...sessionContext,
  });
}

let sessionContextPromise: Promise<SessionContext> | null = null;

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
export function resetAnalyticsSessionContext() {
  analyticsSharedState.sessionContext = null;
  sessionContextPromise = null;
}

async function getSessionContext(
  userAuthModule: InternalAuthModule
): Promise<SessionContext> {
  if (!analyticsSharedState.sessionContext) {
    // With no token there is no identity to resolve: `me()` can only answer 401,
    // which the browser logs to the console before any handler here sees it. On
    // a public page that request is the sole reason an error appears, so skip
    // it. This is not memoized. A visitor who logs in later must still resolve.
    if (!userAuthModule.hasToken()) {
      return { user_id: null, session_id: getAnalyticsSessionId() };
    }

    if (!sessionContextPromise) {
      const sessionId = getAnalyticsSessionId();
      sessionContextPromise = userAuthModule
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
    const pending = sessionContextPromise;
    const context = await pending;
    // Publish only if this lookup is still the current one. A reset that lands
    // while the request is in flight nulls `sessionContextPromise`, and an
    // unconditional write here would put the pre-reset identity back and pin it
    // for the rest of the session. The awaited value is still returned: these
    // events were queued before the identity changed, so that is who they
    // belong to.
    if (sessionContextPromise === pending) {
      analyticsSharedState.sessionContext = context;
    }
    return context;
  }
  return analyticsSharedState.sessionContext;
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

// When the id can't be persisted (React Native has no `localStorage`), keep
// it stable for the process instead of minting a fresh one per call.
function getFallbackSessionId(): string {
  return (analyticsSharedState.fallbackSessionId ??= generateUuid());
}

export function getAnalyticsSessionId(): string {
  if (typeof window === "undefined") {
    return getFallbackSessionId();
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
    return getFallbackSessionId();
  }
}
