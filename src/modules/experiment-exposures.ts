import type { AxiosInstance } from "axios";
import { v4 as uuid } from "uuid";
import { isAnalyticsEnabled } from "./analytics.js";

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
  type Entry = {
    data: { events: Record<string, unknown>[] };
    authorization: string | null;
    acknowledged: boolean;
    pending?: Promise<void>;
  };
  const entries = new Map<string, Entry>();

  function send(entry: Entry): Promise<void> {
    if (entry.pending) return entry.pending;
    const pending = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await axiosClient.request<unknown, { accepted: number }>({
            method: "POST",
            url: `/apps/${appId}/analytics/track/batch`,
            headers: { Authorization: entry.authorization },
            data: entry.data,
          });
          if (response.accepted !== 1) throw new Error("Experiment exposure was not accepted");
          entry.acknowledged = true;
          return;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 100 : 500));
        }
      }
    })().finally(() => { entry.pending = undefined; });
    entry.pending = pending;
    // Reads stay synchronous; flush() lets request handlers observe delivery failures.
    void pending.catch(() => {});
    return pending;
  }

  return {
    track(
      assignment: { experiment_id: string; run_version: number; variant_key: string },
      identity: { visitorId: string; userId: string | null },
    ): void {
      if ((source === "browser" && typeof window === "undefined") || !isAnalyticsEnabled(enabled)) return;
      const { experiment_id, run_version, variant_key } = assignment;
      const key = JSON.stringify([experiment_id, run_version, variant_key, identity.userId, identity.visitorId]);
      let entry = entries.get(key);
      if (!entry) {
        const authorization = identity.userId ? axiosClient.defaults.headers.common.Authorization : null;
        entry = {
          acknowledged: false,
          authorization: typeof authorization === "string" ? authorization : null,
          data: { events: [{
            event_id: uuid(),
            event_name: "__experiment_exposure__",
            timestamp: new Date().toISOString(),
            session_id: identity.visitorId,
            page_url: pageUrl ?? (typeof window === "undefined" ? "/" : window.location.pathname),
            properties: { experiment_id, run_version, variant_key, source },
          }] },
        };
        entries.set(key, entry);
      }
      if (!entry.acknowledged) void send(entry);
    },
    async flush(): Promise<void> {
      await Promise.all([...entries.values()].filter((entry) => !entry.acknowledged).map(send));
    },
  };
}
