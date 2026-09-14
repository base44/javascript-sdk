import type { AxiosError, AxiosInstance } from "axios";
import { v4 as uuid } from "uuid";
import { isAnalyticsEnabled } from "./analytics.js";

const DELIVERY_BUDGET_MS = 5000;

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
    settled: boolean;
    pending?: Promise<void>;
  };
  const entries = new Map<string, Entry>();

  function send(entry: Entry): Promise<void> {
    if (entry.pending) return entry.pending;
    const controller = new AbortController();
    const deadline = new Promise<void>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), DELIVERY_BUDGET_MS);
    const delivery = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          if (controller.signal.aborted) return;
          await axiosClient.request({
            method: "POST",
            url: `/apps/${appId}/analytics/track/batch`,
            headers: { Authorization: entry.authorization },
            data: entry.data,
            timeout: DELIVERY_BUDGET_MS,
            signal: controller.signal,
          });
          return;
        } catch (error) {
          const status = (error as AxiosError).response?.status ?? (error as AxiosError).status;
          if (controller.signal.aborted || attempt === 2 || (status !== undefined && (status < 500 || status >= 600))) return;
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 100 : 500));
        }
      }
    })();
    // Also settle flush when a stalled transport ignores cancellation.
    const pending = Promise.race([delivery, deadline]).finally(() => {
      clearTimeout(timeout);
      controller.abort();
      entry.settled = true;
      entry.pending = undefined;
    });
    entry.pending = pending;
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
          settled: false,
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
      if (!entry.settled) void send(entry);
    },
    async flush(): Promise<void> {
      await Promise.all([...entries.values()].filter((entry) => !entry.settled).map(send));
    },
  };
}
