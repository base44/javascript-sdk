import { http, HttpResponse } from "msw";
import {
  recordRequest,
  state,
  type ConnectorProxyOutcome,
  type ConnectorToken,
  type PlatformFault,
} from "./state";

function takeFault(predicate: (fault: PlatformFault) => boolean) {
  const index = state.faults.findIndex(predicate);
  if (index < 0) return false;
  state.faults.splice(index, 1);
  return true;
}

function token(integrationType: string, accessToken: string, connectionConfig?: Record<string, unknown> | null): ConnectorToken {
  return { integrationType, accessToken, ...(connectionConfig === undefined ? {} : { connectionConfig }) };
}

export const connectorFixtures = {
  connection(integrationType: string, accessToken: string, connectionConfig?: Record<string, unknown> | null) {
    state.connectorTokens.set(integrationType, token(integrationType, accessToken, connectionConfig));
  },
  workspaceConnection(connectorId: string, integrationType: string, accessToken: string, connectionConfig?: Record<string, unknown> | null) {
    state.workspaceConnectorTokens.set(connectorId, token(integrationType, accessToken, connectionConfig));
  },
  appUserConnection(connectorId: string, integrationType: string, accessToken: string, connectionConfig?: Record<string, unknown> | null) {
    state.appUserConnectorTokens.set(connectorId, token(integrationType, accessToken, connectionConfig));
  },
  proxyOutcome(integrationType: string, outcome: ConnectorProxyOutcome) {
    state.connectorProxyOutcomes.set(integrationType, structuredClone(outcome));
  },
};

export const connectorFaultFixtures = {
  creditsExhausted(integrationType: string) {
    state.faults.push({ kind: "connector-credits-exhausted", integrationType });
  },
  meteredTokenRequiresProxy(integrationType: string) {
    state.faults.push({ kind: "metered-connector-token-refused", integrationType });
  },
};

function tokenResponse(value: ConnectorToken | undefined) {
  if (!value)
    return HttpResponse.json({ detail: "Connector connection not found", code: "NOT_FOUND" }, { status: 404 });
  return HttpResponse.json({
    access_token: value.accessToken,
    integration_type: value.integrationType,
    ...(value.connectionConfig === undefined ? {} : { connection_config: value.connectionConfig }),
  });
}

export const connectorHandlers = [
  http.get("*/api/apps/:appId/external-auth/tokens/connectors/:connectorId", async ({ params, request }) => {
    await recordRequest("connectors.getWorkspaceConnection", request);
    return tokenResponse(state.workspaceConnectorTokens.get(String(params.connectorId)));
  }),
  http.get("*/api/apps/:appId/external-auth/tokens/:integrationType", async ({ params, request }) => {
    await recordRequest("connectors.getConnection", request);
    const integrationType = String(params.integrationType);
    const metered = takeFault(
      (item) => item.kind === "metered-connector-token-refused" && item.integrationType === integrationType,
    );
    if (metered)
      return HttpResponse.json(
        { detail: `Connector '${integrationType}' is metered — raw access tokens are not available for it. Call POST /api/apps/${String(params.appId)}/connectors/${integrationType}/call instead.` },
        { status: 403, headers: { "X-Base44-Connector-Error": "metered_connector_requires_proxy" } },
      );
    return tokenResponse(state.connectorTokens.get(integrationType));
  }),
  http.get("*/api/apps/:appId/app-user-auth/connectors/:connectorId/token", async ({ params, request }) => {
    await recordRequest("connectors.getCurrentAppUserConnection", request);
    return tokenResponse(state.appUserConnectorTokens.get(String(params.connectorId)));
  }),
  http.post("*/api/apps/:appId/connectors/:integrationType/call", async ({ params, request }) => {
    await recordRequest("connectors.callApi", request);
    const integrationType = String(params.integrationType);
    const exhausted = takeFault(
      (item) => item.kind === "connector-credits-exhausted" && item.integrationType === integrationType,
    );
    if (exhausted)
      return HttpResponse.json(
        {
          message: "You have reached the limit of integrations for this month",
          extra_data: { reason: "integration_credits_limit_reached" },
        },
        { status: 402 },
      );
    const outcome = state.connectorProxyOutcomes.get(integrationType);
    if (!outcome)
      return HttpResponse.json({ detail: "Connector proxy not configured", code: "NOT_FOUND" }, { status: 404 });
    return HttpResponse.json({
      success: outcome.success,
      phase: outcome.phase,
      status_code: outcome.status,
      data: outcome.data,
      ...(outcome.dataBase64 === undefined ? {} : { data_base64: outcome.dataBase64 }),
      ...(outcome.contentType === undefined ? {} : { content_type: outcome.contentType }),
      headers: outcome.headers ?? {},
      credits_charged: outcome.creditsCharged ?? 0,
    });
  }),
];
