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
import {
  getSharedInstance,
  getSharedInstanceRefCount,
} from "../utils/singleton";
import type { AuthModule } from "./auth.types";

///////////////////////////////////////////////
//// shared queue for analytics events     ////
///////////////////////////////////////////////
type AnalyticsSharedState = {
  requestsQueue: TrackEventData[];
};

const ANALYTICS_SHARED_STATE_NAME = "analytics";
// shared state//
const analyticsSharedState = getSharedInstance<AnalyticsSharedState>(
  ANALYTICS_SHARED_STATE_NAME,
  () => ({
    requestsQueue: [],
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
  const {
    enabled = true,
    maxQueueSize = 1000,
    throttleTime = 1000,
    batchSize = 30,
  } = getAnalyticsModuleOptionsFromUrlParams() ?? {};

  const trackBatchUrl = `${serverUrl}/api/apps/${appId}/analytics/track/batch`;
  let sessionContext: SessionContext | null = null;

  const getSessionContext = async () => {
    if (sessionContext) return sessionContext;
    const user = await userAuthModule.me();
    sessionContext = {
      user_id: user.id,
    };
    return sessionContext;
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
    const sessionContext_ = sessionContext ?? (await getSessionContext());
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

  if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", () => {
      //  flush entire queue on visibility change and hope for the best //
      const eventsData = analyticsSharedState.requestsQueue.splice(0);
      flush(eventsData);
    });
  }

  // start analytics processor only if it's the first instance and analytics is enabled //
  if (getSharedInstanceRefCount(ANALYTICS_SHARED_STATE_NAME) <= 1 && enabled) {
    startAnalyticsProcessor(flush, {
      throttleTime,
      batchSize,
    });
  }

  return {
    track,
  };
};

async function startAnalyticsProcessor(
  handleTrack: (trackRequest: TrackEventData[]) => Promise<void>,
  options?: {
    throttleTime: number;
    batchSize: number;
  }
) {
  const { throttleTime = 1000, batchSize = 30 } = options ?? {};
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, throttleTime));
    const requests = analyticsSharedState.requestsQueue.splice(0, batchSize);
    if (requests.length > 0) {
      try {
        await handleTrack(requests);
      } catch (error) {
        // TODO: think about retries if needed
        console.error("Error processing analytics request:", error);
      }
    }
  }
}

function getEventIntrinsicData(): TrackEventIntrinsicData {
  return {
    timestamp: new Date().toISOString(),
    pageUrl: typeof window !== "undefined" ? window.location.href : null,
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
  const urlParams = new URLSearchParams(window.location.search);
  const jsonString = urlParams.get("analytics");
  if (!jsonString) return undefined;
  try {
    return JSON.parse(jsonString);
  } catch {
    return undefined;
  }
}
