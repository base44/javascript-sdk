import { http, HttpResponse } from "msw";
import { recordRequest } from "./state";

interface ActorDeployment {
  scriptId: string;
  websocketHost: string;
  issuedToken: string;
  tokenExpiresAt: string;
  mode: "prod" | "preview";
}
type ActorFault = "legacy-conflict" | "endpoint-unsupported" | "mint-failed";
const actors = new Map<string, ActorDeployment>();
const faults = new Map<string, ActorFault>();
const scoped = (appId: string, name: string) => `${appId}\u0000${name}`;

export function actorFixturesFor(appId: string) {
  return {
    deployed(name: string, deployment: ActorDeployment) {
      actors.set(scoped(appId, name), structuredClone(deployment));
    },
    fault(name: string, fault: ActorFault) {
      faults.set(scoped(appId, name), fault);
    },
  };
}

export function resetActorState() {
  actors.clear();
  faults.clear();
}

export const actorHandlers = [
  http.post(
    "*/api/apps/:appId/actors/:actorName/connection-token",
    async ({ params, request }) => {
      const recorded = await recordRequest(
        "actors.mintConnectionToken",
        request,
      );
      const appId = String(params.appId);
      const name = String(params.actorName);
      const fault = faults.get(scoped(appId, name));
      if (fault === "legacy-conflict")
        return HttpResponse.json(
          { message: "Actor must be migrated before connecting directly" },
          { status: 409 },
        );
      if (fault === "endpoint-unsupported")
        return HttpResponse.json(
          {
            error_type: "HTTPException",
            message: "Method Not Allowed",
            detail: "Method Not Allowed",
          },
          { status: 405 },
        );
      if (fault === "mint-failed")
        return HttpResponse.json({ message: "mint exploded" }, { status: 500 });
      const deployment = actors.get(scoped(appId, name));
      const body = recorded.body as { room: string; connection_id: string };
      return deployment
        ? HttpResponse.json({
            websocket_url: `${deployment.websocketHost}/v1/actors/${deployment.scriptId}/rooms/${encodeURIComponent(body.room)}?_pk=${encodeURIComponent(body.connection_id)}`,
            token: deployment.issuedToken,
            expires_at: deployment.tokenExpiresAt,
            mode: deployment.mode,
          })
        : HttpResponse.json(
            { detail: "Actor not found", code: "NOT_FOUND" },
            { status: 404 },
          );
    },
  ),
];
