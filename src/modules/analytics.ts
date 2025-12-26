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
import { getSharedInstance } from "../utils/sharedInstance";
import type { AuthModule } from "./auth.types";

const defaultConfiguration: AnalyticsModuleOptions = {
  enabled: true,
  maxQueueSize: 1000,
  throttleTime: 1000,
  batchSize: 30,
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
    sessionContext: null as SessionContext | null,
    config: {
      ...defaultConfiguration,
      ...getAnalyticsModuleOptionsFromUrlParams(),
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
  const { enabled, maxQueueSize, throttleTime, batchSize } =
    analyticsSharedState.config;

  const trackBatchUrl = `${serverUrl}/api/apps/${appId}/analytics/track/batch`;

  const getSessionContext = async () => {
    if (!analyticsSharedState.sessionContext) {
      const user = await userAuthModule.me();
      analyticsSharedState.sessionContext = {
        user_id: user.id,
      };
    }
    return analyticsSharedState.sessionContext;
  };

  const track = (params: TrackEventParams) => {
    if (!enabled || analyticsSharedState.requestsQueue.length >= maxQueueSize) {
      return;
    }
    const intrinsicData = getEventIntrinsicData();
    analyticsSharedState.requestsQueue.push({
      ...params,
      ...intrinsicData,
    });
  };

  const batchRequestFallback = async (events: AnalyticsApiRequestData[]) => {
    await axiosClient.request({
      method: "POST",
      url: `/apps/${appId}/analytics/track/batch`,
      data: { events },
    } as AnalyticsApiBatchRequest);
  };

  const flush = async (eventsData: TrackEventData[]) => {
    const sessionContext_ = await getSessionContext();
    const events = eventsData.map(
      transformEventDataToApiRequestData(sessionContext_)
    );
    const beaconPayload = JSON.stringify({ events });

    if (
      typeof navigator === "undefined" ||
      beaconPayload.length > 60000 ||
      !navigator.sendBeacon(trackBatchUrl, beaconPayload)
    ) {
      // beacon didn't work, fallback to axios
      await batchRequestFallback(events);
    }
  };

  const onDocHidden = () => {
    stopAnalyticsProcessor();
    //  flush entire queue on visibility change and hope for the best //
    const eventsData = analyticsSharedState.requestsQueue.splice(0);
    flush(eventsData);
  };

  const onDocVisible = () => {
    startAnalyticsProcessor(flush, {
      throttleTime,
      batchSize,
    });
  };

  const onVisibilityChange = () => {
    if (typeof window === "undefined") return;
    if (document.visibilityState === "hidden") {
      onDocHidden();
    } else if (document.visibilityState === "visible") {
      onDocVisible();
    }
  };

  if (typeof window !== "undefined" && enabled) {
    window.addEventListener("visibilitychange", onVisibilityChange);
  }

  // start analytics processor only if it's the first instance and analytics is enabled //
  if (enabled) {
    startAnalyticsProcessor(flush, {
      throttleTime,
      batchSize,
    });
  }

  const cleanup = () => {
    if (typeof window === "undefined") return;
    window.removeEventListener("visibilitychange", onVisibilityChange);
    stopAnalyticsProcessor();
  };

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
    return;
  }
  analyticsSharedState.isProcessing = true;
  const { throttleTime = 1000, batchSize = 30 } = options ?? {};
  while (analyticsSharedState.isProcessing) {
    const requests = analyticsSharedState.requestsQueue.splice(0, batchSize);
    if (requests.length > 0) {
      try {
        await handleTrack(requests);
      } catch (error) {
        // TODO: think about retries if needed
        console.error("Error processing analytics request:", error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, throttleTime));
  }
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

export function getAnalyticsModuleOptionsFromUrlParams():
  | AnalyticsModuleOptions
  | undefined {
  if (typeof window === "undefined") return undefined;
  const urlParams = new URLSearchParams(window.location.search);
  const jsonString = urlParams.get("analytics");
  if (!jsonString) return undefined;
  try {
    return JSON.parse(jsonString);
  } catch {
    return undefined;
  }
}
