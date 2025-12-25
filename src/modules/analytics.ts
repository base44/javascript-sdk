import { AxiosInstance } from "axios";
import {
  TrackEventParams,
  TrackEventData,
  AnalyticsApiRequestData,
  AnalyticsApiBatchRequest,
  TrackEventIntrinsicData,
  AnalyticsModuleOptions,
} from "./analytics.types";
import {
  getSharedInstance,
  getSharedInstanceRefCount,
} from "../utils/singleton";

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
  appId: string;
  options?: AnalyticsModuleOptions;
}

export const createAnalyticsModule = ({
  axiosClient,
  appId,
  options,
}: AnalyticsModuleArgs) => {
  // prevent overflow of events //
  const MAX_QUEUE_SIZE = 1000;
  const isEnabled = options?.enabled !== false;

  const track = (params: TrackEventParams) => {
    if (
      !isEnabled ||
      analyticsSharedState.requestsQueue.length >= MAX_QUEUE_SIZE
    ) {
      return;
    }
    const intrinsicData = getEventIntrinsicData();
    analyticsSharedState.requestsQueue.push({
      ...params,
      ...intrinsicData,
    });
  };

  const flush = async (eventsData: TrackEventData[]) => {
    const apiEvents = eventsData.map(transformEventDataToApiRequestData);
    await axiosClient.request({
      method: "POST",
      url: `/apps/${appId}/analytics/track/batch`,
      data: { events: apiEvents },
    } as AnalyticsApiBatchRequest);
  };

  // start analytics processor only if it's the first instance and analytics is enabled //
  if (
    getSharedInstanceRefCount(ANALYTICS_SHARED_STATE_NAME) <= 1 &&
    isEnabled
  ) {
    startAnalyticsProcessor(flush, options?.trackService);
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

function transformEventDataToApiRequestData(
  eventData: TrackEventData
): AnalyticsApiRequestData {
  return {
    event_name: eventData.eventName,
    properties: eventData.properties,
    timestamp: eventData.timestamp,
    page_url: eventData.pageUrl,
  };
}
