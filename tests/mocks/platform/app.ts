import { http, HttpResponse } from "msw";
import { recordRequest } from "./state";

type PublicSettings = { id: string; public_settings: string };

const settings = new Map<string, PublicSettings>();
const accessFaults = new Map<string, "auth_required" | "user_not_registered">();

export const appFixtures = {
  publicSettings(value: PublicSettings) {
    settings.set(value.id, structuredClone(value));
  },
  /** Legacy edge response retained to verify SDK error compatibility; current
   * apper's deployment settings route documents 404/500 instead. */
  legacyAccessDenied(appId: string, reason: "auth_required" | "user_not_registered") {
    accessFaults.set(appId, reason);
  },
};

export function resetAppState() {
  settings.clear();
  accessFaults.clear();
}

export const appHandlers = [
  http.get("*/api/apps/public/prod/public-settings/by-id/:appId", async ({ params, request }) => {
    await recordRequest("app.getPublicSettings", request);
    const appId = String(params.appId);
    const reason = accessFaults.get(appId);
    if (reason)
      return HttpResponse.json({ extra_data: { app_id: appId, reason } }, { status: 403 });
    const value = settings.get(appId);
    return value
      ? HttpResponse.json({ id: value.id, public_settings: value.public_settings })
      : HttpResponse.json({ detail: "App not found", code: "NOT_FOUND" }, { status: 404 });
  }),
];
