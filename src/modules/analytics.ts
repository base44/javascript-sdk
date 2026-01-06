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
import type { AuthModule } from "./auth.types";
import { generateUuid } from "../utils/common.js";

export const USER_HEARTBEAT_EVENT_NAME = "__user_heartbeat_event__";
export const ANALYTICS_INITIALIZTION_EVENT_NAME = "__initialization_event__";
export const ANALYTICS_SESSION_DURATION_EVENT_NAME =
  "__session_duration_event__";
export const ANALYTICS_CONFIG_ENABLE_URL_PARAM_KEY = "analytics-enable";

export const ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY =
  "base44_analytics_session_id";

const defaultConfiguration: AnalyticsModuleOptions = {
  // default to disabled //
  enabled: false,
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
  userAuthModule: AuthModule;
}

export const createAnalyticsModule = ({
  axiosClient,
  serverUrl,
  appId,
  userAuthModule,
}: AnalyticsModuleArgs) => {
  // prevent overflow of events //
  const { maxQueueSize, throttleTime, batchSize } = analyticsSharedState.config;

  if (!analyticsSharedState.config?.enabled) {
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
  if (
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
  )
    return;
  analyticsSharedState.wasInitializationTracked = true;
  track({
    eventName: ANALYTICS_INITIALIZTION_EVENT_NAME,
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
    pageUrl: typeof window !== "undefined" ? window.location.pathname : null,
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
async function getSessionContext(
  userAuthModule: AuthModule
): Promise<SessionContext> {
  if (!analyticsSharedState.sessionContext) {
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
    analyticsSharedState.sessionContext = await sessionContextPromise;
  }
  return analyticsSharedState.sessionContext;
}

export function getAnalyticsConfigFromUrlParams():
  | AnalyticsModuleOptions
  | undefined {
  if (typeof window === "undefined") return undefined;
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

export function getAnalyticsSessionId(): string {
  if (typeof window === "undefined") {
    return generateUuid();
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
    return generateUuid();
  }
}
