import { http, HttpResponse } from "msw";
import { recordRequest } from "./state";

const accessPolicies = new Map<string, string>();
const accessFaults = new Map<string, "auth_required" | "user_not_registered">();

export function appFixturesFor(appId: string) {
  return {
    deploymentAccess(policy: string) {
      accessPolicies.set(appId, policy);
    },
    /** Legacy edge response retained to verify SDK error compatibility; current
     * apper's deployment settings route documents 404/500 instead. */
    legacyAccessDenied(reason: "auth_required" | "user_not_registered") {
      accessFaults.set(appId, reason);
    },
  };
}

export function resetAppState() {
  accessPolicies.clear();
  accessFaults.clear();
}

export const appHandlers = [
  http.get(
    "*/api/apps/public/prod/public-settings/by-id/:appId",
    async ({ params, request }) => {
      await recordRequest("app.getPublicSettings", request);
      const appId = String(params.appId);
      const reason = accessFaults.get(appId);
      if (reason)
        return HttpResponse.json(
          { extra_data: { app_id: appId, reason } },
          { status: 403 },
        );
      const policy = accessPolicies.get(appId);
      return policy
        ? HttpResponse.json({ id: appId, public_settings: policy })
        : HttpResponse.json(
            { detail: "App not found", code: "NOT_FOUND" },
            { status: 404 },
          );
    },
  ),
];
