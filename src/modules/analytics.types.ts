export type TrackEventProperties = {
  [key: string]: string | number | boolean | null | undefined;
};

export type TrackEventParams = {
  eventName: string;
  properties?: TrackEventProperties;
};

export type TrackEventIntrinsicData = {
  timestamp: string;
  pageUrl?: string | null;
};

export type TrackEventData = {
  properties?: TrackEventProperties;
  eventName: string;
} & TrackEventIntrinsicData;

export type AnalyticsApiRequestData = {
  event_name: string;
  properties?: TrackEventProperties;
  timestamp?: string;
  page_url?: string | null;
};

export type AnalyticsApiBatchRequest = {
  method: "POST";
  url: `/apps/${string}/analytics/track/batch`;
  data: {
    events: AnalyticsApiRequestData[];
  };
};

export type AnalyticsModuleOptions = {
  enabled?: boolean;
  trackService?: {
    throttleTime: number;
    batchSize: number;
  };
};
