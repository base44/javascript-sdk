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
import { generateUuid, isReactNative } from "../utils/common.js";

export const USER_HEARTBEAT_EVENT_NAME = "__user_heartbeat_event__";
export const ANALYTICS_INITIALIZATION_EVENT_NAME = "__initialization_event__";
export const ANALYTICS_SESSION_DURATION_EVENT_NAME =
  "__session_duration_event__";
export const ANALYTICS_CONFIG_ENABLE_URL_PARAM_KEY = "analytics-enable";

export const ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY =
  "base44_analytics_session_id";

// Set by the Base44 server from the app owner's choice: "off" never tracks,
// "consent" waits for the page's Google Consent Mode `analytics_storage` grant,
// "on" tracks until that consent is denied. Absent: track as before.
export const ANALYTICS_MODE_META_NAME = "base44-analytics";

type AnalyticsMode = "off" | "consent" | "on";

function readAnalyticsMode(): AnalyticsMode | null {
  if (typeof document === "undefined") return null;
  try {
    const content = document
      .querySelector(`meta[name="${ANALYTICS_MODE_META_NAME}"]`)
      ?.getAttribute("content");
    return content === "off" || content === "consent" || content === "on"
      ? content
      : null;
  } catch {
    return null;
  }
}

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
    // Memoized session id for when `localStorage` can't persist one — see
    // getAnalyticsSessionId.
    fallbackSessionId: null as string | null,
    config: {
      ...defaultConfiguration,
      ...getAnalyticsConfigFromUrlParams(),
    } as Required<AnalyticsModuleOptions>,
  })
);

///////////////////////////////////////////////
//// visitor consent                       ////
///////////////////////////////////////////////

// Its own shared instance: an older SDK copy on the page may own "analytics".
const consentSharedState = getSharedInstance("analytics-consent", () => {
  const analyticsMode = readAnalyticsMode();
  return {
    analyticsMode,
    // Whether the visitor may be tracked and the session id stored.
    consentGranted: analyticsMode !== "consent",
    isWatchingConsent: false,
    listeners: [] as Array<(granted: boolean) => void>,
  };
});

/** Whether analytics may run and store the session id on this page. */
export function isAnalyticsAllowed(): boolean {
  const { analyticsMode, consentGranted } = consentSharedState;
  return analyticsMode !== "off" && consentGranted;
}

function setConsentGranted(granted: boolean) {
  if (consentSharedState.consentGranted === granted) return;
  consentSharedState.consentGranted = granted;
  if (!granted) {
    try {
      const sessionId = localStorage.getItem(
        ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY
      );
      // Same id for the rest of the tab, so an anonymous agent chat keeps its owner.
      if (sessionId) analyticsSharedState.fallbackSessionId ??= sessionId;
      localStorage.removeItem(ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY);
    } catch {
      // storage unavailable: nothing was stored
    }
  }
  for (const listener of [...consentSharedState.listeners]) {
    listener(granted);
  }
}

// Subscribes once to the consent listener Base44 injects next to the meta tag.
// Without it (e.g. a CSP blocked the inline script) "consent" never grants.
function watchAnalyticsConsent() {
  const state = consentSharedState;
  if (state.isWatchingConsent) return;
  state.isWatchingConsent = true;
  if (state.analyticsMode !== "consent" && state.analyticsMode !== "on") return;
  const b44Consent =
    typeof window !== "undefined" ? (window as any).__b44Consent : undefined;
  b44Consent?.on(
    "analytics_storage",
    () => setConsentGranted(true),
    () => setConsentGranted(false)
  );
}

function onConsentChange(listener: (granted: boolean) => void) {
  consentSharedState.listeners.push(listener);
  return () => {
    const listeners = consentSharedState.listeners;
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

///////////////////////////////////////////////

export interface AnalyticsModuleArgs {
  axiosClient: AxiosInstance;
  serverUrl: string;
  appId: string;
  userAuthModule: AuthModule;
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
  watchAnalyticsConsent();

  // Disable analytics on React Native. It defines `window` but not `document`,
  // so the per-callsite `typeof window` guards below aren't enough to keep it
  // from touching `document` (e.g. `document.referrer` on init). Node/SSR is
  // still handled by those `window` guards, so this doesn't affect it.
  if (
    !enabled ||
    !analyticsSharedState.config?.enabled ||
    isReactNative ||
    consentSharedState.analyticsMode === "off"
  ) {
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
    // Consent may have been withdrawn while these events waited.
    if (eventsData.length === 0 || !isAnalyticsAllowed()) return;

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
    if (
      !isAnalyticsAllowed() ||
      analyticsSharedState.requestsQueue.length >= maxQueueSize
    ) {
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

  let isStarted = false;

  const start = () => {
    if (isStarted) return;
    isStarted = true;
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
  };

  const stop = () => {
    isStarted = false;
    stopAnalyticsProcessor();
    clearHeartBeatProcessor?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };

  const stopWatchingConsent = onConsentChange((granted) => {
    if (granted) {
      start();
    } else {
      stop();
      analyticsSharedState.requestsQueue.splice(0);
    }
  });

  const cleanup = () => {
    stopWatchingConsent();
    stop();
  };

  if (isAnalyticsAllowed()) start();

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
      ...getAttributionParams(),
    },
  });
}

// Allowlist, never the whole query string: landing URLs carry PII
// (e.g. `utm_email`) and tokens.
const ATTRIBUTION_PARAM_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "gbraid", "wbraid", "gad_source", "gad_campaignid",
  "fbclid", "msclkid", "ttclid", "li_fat_id",
];

function getAttributionParams(): Record<string, string> {
  try {
    const params = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const key of ATTRIBUTION_PARAM_KEYS) {
      const value = params.get(key);
      if (value) out[key] = value.slice(0, 500);
    }
    return out;
  } catch {
    // React Native has no `window.location`.
    return {};
  }
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
  userAuthModule: AuthModule
): Promise<SessionContext> {
  if (!analyticsSharedState.sessionContext) {
    // With no token there is no identity to resolve: `me()` can only answer 401,
    // which the browser logs to the console before any handler here sees it. On
    // a public page that request is the sole reason an error appears, so skip
    // it. This is not memoized — a visitor who logs in later must still resolve.
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
  if (typeof window === "undefined" || !isAnalyticsAllowed()) {
    return getFallbackSessionId();
  }
  try {
    const sessionId = localStorage.getItem(
      ANALYTICS_SESSION_ID_LOCAL_STORAGE_KEY
    );
    if (!sessionId) {
      // An id used before consent was granted carries on, so it is stored now.
      const newSessionId = analyticsSharedState.fallbackSessionId ?? generateUuid();
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
