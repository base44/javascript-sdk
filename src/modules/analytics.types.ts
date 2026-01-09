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

export type SessionContext = {
  user_id?: string | null;
  session_id?: string | null;
};

export type AnalyticsApiRequestData = {
  event_name: string;
  properties?: TrackEventProperties;
  timestamp?: string;
  page_url?: string | null;
} & SessionContext;

export type AnalyticsApiBatchRequest = {
  method: "POST";
  url: `/apps/${string}/analytics/track/batch`;
  data: {
    events: AnalyticsApiRequestData[];
  };
};

export type AnalyticsModuleOptions = {
  enabled?: boolean;
  maxQueueSize?: number;
  throttleTime?: number;
  batchSize?: number;
  // used for live users count tracking
  heartBeatInterval?: number;
};

export type AnalyticsModule = {
  track: (params: TrackEventParams) => void;
};
