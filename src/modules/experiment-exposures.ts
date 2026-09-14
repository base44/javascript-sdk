import type { AxiosInstance } from "axios";
import { v4 as uuid } from "uuid";
import { getAnalyticsState, isAnalyticsEnabled } from "./analytics.js";
import { getAnalyticsQueue } from "./analytics-queue.js";

/** @internal */
export function createExposureTracker({
  axiosClient, appId, enabled, source = "browser", pageUrl,
}: {
  axiosClient: AxiosInstance;
  appId: string;
  enabled: boolean;
  source?: "browser" | "backend";
  pageUrl?: string;
}) {
  const state = getAnalyticsState(axiosClient);
  const queue = getAnalyticsQueue(axiosClient, appId, state.config);
  const tracked = new Set<string>();

  return {
    track(
      assignment: { experiment_id: string; run_version: number; variant_key: string },
      identity: { visitorId: string; userId: string | null },
    ): void {
      if ((source === "browser" && typeof window === "undefined") || !isAnalyticsEnabled(enabled, state)) return;
      const { experiment_id, run_version, variant_key } = assignment;
      const key = JSON.stringify([experiment_id, run_version, variant_key, identity.userId, identity.visitorId]);
      if (tracked.has(key)) return;
      tracked.add(key);
      const authorization = identity.userId ? axiosClient.defaults.headers.common.Authorization : null;
      queue.enqueue({
        event_id: uuid(),
        event_name: "__experiment_exposure__",
        timestamp: new Date().toISOString(),
        session_id: identity.visitorId,
        page_url: pageUrl ?? (typeof window === "undefined" ? "/" : window.location.pathname),
        properties: { experiment_id, run_version, variant_key, source },
      }, typeof authorization === "string" ? authorization : null, identity.userId);
    },
    flush: queue.flush,
  };
}
