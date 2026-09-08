import { http, HttpResponse } from "msw";
import { recordRequest } from "./state";

interface ActorConfig {
  websocketUrl: string;
  token: string;
  expiresAt: string;
  mode: "prod" | "preview";
}
type ActorFault = "legacy-conflict" | "endpoint-unsupported" | "mint-failed";
const actors = new Map<string, ActorConfig>();
const faults = new Map<string, ActorFault>();

export const actorFixtures = {
  available(name: string, config: ActorConfig) {
    actors.set(name, structuredClone(config));
  },
  fault(name: string, fault: ActorFault) {
    faults.set(name, fault);
  },
};

export function resetActorState() {
  actors.clear();
  faults.clear();
}

export const actorHandlers = [
  http.post("*/api/apps/:appId/actors/:actorName/connection-token", async ({ params, request }) => {
    await recordRequest("actors.mintConnectionToken", request);
    const name = String(params.actorName);
    const fault = faults.get(name);
    if (fault === "legacy-conflict")
      return HttpResponse.json({ message: "Actor must be migrated before connecting directly" }, { status: 409 });
    if (fault === "endpoint-unsupported")
      return HttpResponse.json({ error_type: "HTTPException", message: "Method Not Allowed", detail: "Method Not Allowed" }, { status: 405 });
    if (fault === "mint-failed")
      return HttpResponse.json({ message: "mint exploded" }, { status: 500 });
    const config = actors.get(name);
    return config
      ? HttpResponse.json({
          websocket_url: config.websocketUrl,
          token: config.token,
          expires_at: config.expiresAt,
          mode: config.mode,
        })
      : HttpResponse.json({ detail: "Actor not found", code: "NOT_FOUND" }, { status: 404 });
  }),
];
