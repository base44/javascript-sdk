import { http, HttpResponse } from "msw";
import { recordRequest } from "./state";

export const analyticsHandlers = [
  http.post("*/api/apps/:appId/analytics/track/batch", async ({ request }) => {
    await recordRequest("analytics.trackBatch", request);
    const recorded = (await request.clone().json()) as { events?: unknown[] };
    return HttpResponse.json({ accepted: recorded.events?.length ?? 0 });
  }),
];
