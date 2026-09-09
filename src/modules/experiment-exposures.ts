import type { AxiosInstance } from "axios";
import { isAnalyticsEnabled } from "./analytics.js";

/** @internal */
export function createExposureTracker({
  axiosClient,
  appId,
  enabled,
}: {
  axiosClient: AxiosInstance;
  appId: string;
  enabled: boolean;
}) {
  const exposed = new Set<string>();

  return {
    track(
      assignment: {
        experiment_id: string;
        run_version: number;
        variant_key: string;
      },
      identity: { visitorId: string; userId: string | null },
    ): void {
      if (typeof window === "undefined" || !isAnalyticsEnabled(enabled)) return;

      const { experiment_id, run_version, variant_key } = assignment;
      const key = JSON.stringify([
        experiment_id,
        run_version,
        variant_key,
        identity.userId,
        identity.visitorId,
      ]);
      if (exposed.has(key)) return;
      exposed.add(key);

      // Pin the event's auth before an account change can alter Axios defaults.
      const authorization = identity.userId
        ? (axiosClient.defaults.headers.common.Authorization ?? null)
        : null;
      void axiosClient
        .request({
          method: "POST",
          url: `/apps/${appId}/analytics/track/batch`,
          headers: { Authorization: authorization },
          data: {
            events: [
              {
                event_name: "__experiment_exposure__",
                timestamp: new Date().toISOString(),
                session_id: identity.visitorId,
                page_url: window.location.pathname,
                properties: { experiment_id, run_version, variant_key },
              },
            ],
          },
        })
        .catch(() => exposed.delete(key));
    },
  };
}
