import type { AxiosError, AxiosInstance } from "axios";
import type { AnalyticsApiRequestData, AnalyticsModuleOptions } from "./analytics.types.js";

const DELIVERY_BUDGET_MS = 5000;
type Event = AnalyticsApiRequestData & { event_id?: string };
type Entry = { event: Promise<Event | undefined>; authorization: string | null; userId: Promise<string | null> };
type PreparedEntry = { event: Event; authorization: string | null; userId: string | null };
const queues = new WeakMap<AxiosInstance, ReturnType<typeof createAnalyticsQueue>>();

/** @internal One transport queue per client, shared by goals and exposures. */
export function getAnalyticsQueue(axiosClient: AxiosInstance, appId: string, config: AnalyticsModuleOptions) {
  let queue = queues.get(axiosClient);
  if (!queue) {
    queue = createAnalyticsQueue(axiosClient, appId, config);
    queues.set(axiosClient, queue);
  }
  return queue;
}

function createAnalyticsQueue(axiosClient: AxiosInstance, appId: string, config: AnalyticsModuleOptions) {
  const entries: Entry[] = [];
  const pending = new Set<Promise<void>>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function deliver(batch: Entry[]) {
    const controller = new AbortController();
    const deadlineAt = Date.now() + DELIVERY_BUDGET_MS;
    const deadline = new Promise<void>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), DELIVERY_BUDGET_MS);
    function send(prepared: PreparedEntry[]) {
      const groups = new Map<string, PreparedEntry[]>();
      for (const entry of prepared) {
        const key = JSON.stringify([entry.authorization, entry.userId, entry.event.session_id]);
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
      }
      return Promise.all([...groups.values()].map(async (group) => {
        const events = group.map(({ event }) => event);
        const exposures = events.filter((event) => event.event_name === "__experiment_exposure__");
        const attempts = exposures.length ? 3 : 1;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            if (controller.signal.aborted) return;
            await axiosClient.request({
              method: "POST", url: `/apps/${appId}/analytics/track/batch`,
              headers: { Authorization: group[0].authorization },
              // Ordinary goals have no backend deduplication and remain single-attempt.
              data: { events: attempt === 0 ? events : exposures },
              timeout: Math.max(1, deadlineAt - Date.now()), signal: controller.signal,
            });
            return;
          } catch (error) {
            const status = (error as AxiosError).response?.status ?? (error as AxiosError).status;
            if (controller.signal.aborted || attempt === attempts - 1 ||
              (status !== undefined && (status < 500 || status >= 600))) return;
            await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 100 : 500));
          }
        }
      }));
    }
    const delivery = (async () => {
      const ready: PreparedEntry[] = [];
      const requests: Promise<void[]>[] = [];
      let wake = () => {};
      let preparedAll = false;
      const preparation = Promise.all(batch.map(async (entry) => {
        const [event, userId] = await Promise.all([entry.event, entry.userId]);
        if (event && !controller.signal.aborted) ready.push({ event, userId, authorization: entry.authorization });
        wake();
      })).then(() => { preparedAll = true; wake(); });
      while (!preparedAll || ready.length) {
        if (!ready.length && !preparedAll) await Promise.race([
          new Promise<void>((resolve) => { wake = resolve; }), deadline,
        ]);
        if (controller.signal.aborted) return;
        // Coalesce this turn's resolved identities without waiting for unrelated auth I/O.
        let turnTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([preparation, new Promise<void>((resolve) => { turnTimer = setTimeout(resolve, 0); })]);
        clearTimeout(turnTimer);
        if (ready.length) requests.push(send(ready.splice(0)));
      }
      await Promise.all(requests);
    })();
    // Identity lookup and transports that ignore cancellation must also be bounded.
    const settlement = Promise.race([delivery, deadline]).catch(() => {}).finally(() => {
      clearTimeout(timeout);
      controller.abort();
      pending.delete(settlement);
    });
    pending.add(settlement);
  }

  function schedule() {
    if (timer || entries.length === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      deliver(entries.splice(0, config.batchSize ?? 30));
      schedule();
    }, config.throttleTime ?? 1000);
  }

  return {
    enqueue(event: Event | Promise<Event>, authorization: string | null, userId: string | null | Promise<string | null>) {
      if (entries.length >= (config.maxQueueSize ?? 1000)) return;
      entries.push({ event: Promise.resolve(event).catch(() => undefined), authorization,
        userId: Promise.resolve(userId).catch(() => null) });
      schedule();
    },
    async flush() {
      clearTimeout(timer);
      timer = undefined;
      while (entries.length) deliver(entries.splice(0, config.batchSize ?? 30));
      await Promise.all([...pending]);
    },
    cleanup() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
