import { http, HttpResponse } from "msw";
import {
  recordRequest,
  state,
  type ConnectorProxyOutcome,
  type ConnectorToken,
  type PlatformFault,
} from "./state";
import { principalFor } from "./auth";

function takeFault(predicate: (fault: PlatformFault) => boolean) {
  const index = state.faults.findIndex(predicate);
  if (index < 0) return false;
  state.faults.splice(index, 1);
  return true;
}

function token(
  integrationType: string,
  accessToken: string,
  connectionConfig?: Record<string, unknown> | null,
): ConnectorToken {
  return {
    integrationType,
    accessToken,
    ...(connectionConfig === undefined ? {} : { connectionConfig }),
  };
}

function appStore<T>(stores: Map<string, Map<string, T>>, appId: string) {
  let store = stores.get(appId);
  if (!store) {
    store = new Map();
    stores.set(appId, store);
  }
  return store;
}

function appUserStore(appId: string, userId: string) {
  const users = appStore(state.appUserConnectorTokens, appId);
  let store = users.get(userId);
  if (!store) {
    store = new Map();
    users.set(userId, store);
  }
  return store;
}

function appUserRedirectStore(appId: string, userId: string) {
  const users = appStore(state.appUserConnectorRedirects, appId);
  let store = users.get(userId);
  if (!store) {
    store = new Map();
    users.set(userId, store);
  }
  return store;
}

export function connectorFixturesFor(appId: string) {
  return {
    connection(
      integrationType: string,
      accessToken: string,
      connectionConfig?: Record<string, unknown> | null,
    ) {
      appStore(state.connectorTokens, appId).set(
        integrationType,
        token(integrationType, accessToken, connectionConfig),
      );
    },
    workspaceConnection(
      connectorId: string,
      integrationType: string,
      accessToken: string,
      connectionConfig?: Record<string, unknown> | null,
    ) {
      appStore(state.workspaceConnectorTokens, appId).set(
        connectorId,
        token(integrationType, accessToken, connectionConfig),
      );
    },
    appUserConnection(
      userId: string,
      connectorId: string,
      integrationType: string,
      accessToken: string,
      connectionConfig?: Record<string, unknown> | null,
    ) {
      appUserStore(appId, userId).set(
        connectorId,
        token(integrationType, accessToken, connectionConfig),
      );
    },
    appUserAuthorization(
      userId: string,
      connectorId: string,
      redirectUrl: string,
    ) {
      appUserRedirectStore(appId, userId).set(connectorId, redirectUrl);
    },
    proxyOutcome(integrationType: string, outcome: ConnectorProxyOutcome) {
      appStore(state.connectorProxyOutcomes, appId).set(
        integrationType,
        structuredClone(outcome),
      );
    },
  };
}

export function connectorFaultFixturesFor(appId: string) {
  return {
    creditsExhausted(integrationType: string) {
      state.faults.push({
        kind: "connector-credits-exhausted",
        appId,
        integrationType,
      });
    },
    meteredTokenRequiresProxy(integrationType: string) {
      state.faults.push({
        kind: "metered-connector-token-refused",
        appId,
        integrationType,
      });
    },
  };
}

function unauthorized() {
  return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
}

function serviceOnly() {
  return HttpResponse.json(
    { detail: "This endpoint is only accessible to service tokens" },
    { status: 403 },
  );
}

function tokenResponse(value: ConnectorToken | undefined) {
  if (!value)
    return HttpResponse.json(
      { detail: "Connector connection not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  return HttpResponse.json({
    access_token: value.accessToken,
    integration_type: value.integrationType,
    ...(value.connectionConfig === undefined
      ? {}
      : { connection_config: value.connectionConfig }),
  });
}

export const connectorHandlers = [
  http.get(
    "*/api/apps/:appId/external-auth/tokens/connectors/:connectorId",
    async ({ params, request }) => {
      await recordRequest("connectors.getWorkspaceConnection", request);
      const appId = String(params.appId);
      const principal = principalFor(appId, request)?.principal;
      if (!principal) return unauthorized();
      if (principal.kind !== "service") return serviceOnly();
      return tokenResponse(
        state.workspaceConnectorTokens
          .get(appId)
          ?.get(String(params.connectorId)),
      );
    },
  ),
  http.get(
    "*/api/apps/:appId/external-auth/tokens/:integrationType",
    async ({ params, request }) => {
      await recordRequest("connectors.getConnection", request);
      const appId = String(params.appId);
      const principal = principalFor(appId, request)?.principal;
      if (!principal) return unauthorized();
      if (principal.kind !== "service") return serviceOnly();
      const integrationType = String(params.integrationType);
      const metered = takeFault(
        (item) =>
          item.kind === "metered-connector-token-refused" &&
          item.appId === appId &&
          item.integrationType === integrationType,
      );
      if (metered)
        return HttpResponse.json(
          {
            detail: `Connector '${integrationType}' is metered — raw access tokens are not available for it. Call POST /api/apps/${String(params.appId)}/connectors/${integrationType}/call instead.`,
          },
          {
            status: 403,
            headers: {
              "X-Base44-Connector-Error": "metered_connector_requires_proxy",
            },
          },
        );
      return tokenResponse(
        state.connectorTokens.get(appId)?.get(integrationType),
      );
    },
  ),
  http.get(
    "*/api/apps/:appId/app-user-auth/connectors/:connectorId/token",
    async ({ params, request }) => {
      await recordRequest("connectors.getCurrentAppUserConnection", request);
      const appId = String(params.appId);
      const principal = principalFor(appId, request)?.principal;
      if (!principal) return unauthorized();
      if (principal.kind !== "service") return serviceOnly();
      const user = principalFor(appId, request, "on-behalf-of")?.principal.user;
      if (!user) return unauthorized();
      return tokenResponse(
        state.appUserConnectorTokens
          .get(appId)
          ?.get(user.id)
          ?.get(String(params.connectorId)),
      );
    },
  ),
  http.post(
    "*/api/apps/:appId/connectors/:integrationType/call",
    async ({ params, request }) => {
      await recordRequest("connectors.callApi", request);
      const appId = String(params.appId);
      const principal = principalFor(appId, request)?.principal;
      if (!principal) return unauthorized();
      if (principal.kind !== "service") return serviceOnly();
      const integrationType = String(params.integrationType);
      const exhausted = takeFault(
        (item) =>
          item.kind === "connector-credits-exhausted" &&
          item.appId === appId &&
          item.integrationType === integrationType,
      );
      if (exhausted)
        return HttpResponse.json(
          {
            message:
              "You have reached the limit of integrations for this month",
            extra_data: { reason: "integration_credits_limit_reached" },
          },
          { status: 402 },
        );
      const outcome = state.connectorProxyOutcomes
        .get(appId)
        ?.get(integrationType);
      if (!outcome)
        return HttpResponse.json(
          { detail: "Connector proxy not configured", code: "NOT_FOUND" },
          { status: 404 },
        );
      return HttpResponse.json({
        success: outcome.success,
        phase: outcome.phase,
        status_code: outcome.status,
        data: outcome.data,
        ...(outcome.dataBase64 === undefined
          ? {}
          : { data_base64: outcome.dataBase64 }),
        ...(outcome.contentType === undefined
          ? {}
          : { content_type: outcome.contentType }),
        headers: outcome.headers ?? {},
        credits_charged: outcome.creditsCharged ?? 0,
      });
    },
  ),
  http.post(
    "*/api/apps/:appId/app-user-auth/connectors/:connectorId/initiate",
    async ({ params, request }) => {
      await recordRequest("connectors.connectAppUser", request);
      const appId = String(params.appId);
      const user = principalFor(appId, request)?.principal.user;
      if (!user) return unauthorized();
      const redirectUrl = state.appUserConnectorRedirects
        .get(appId)
        ?.get(user.id)
        ?.get(String(params.connectorId));
      return redirectUrl
        ? HttpResponse.json({
            redirect_url: redirectUrl,
            connection_id: `connection-${String(params.connectorId)}`,
            already_authorized: false,
          })
        : HttpResponse.json(
            {
              detail: "Connector authorization not configured",
              code: "NOT_FOUND",
            },
            { status: 404 },
          );
    },
  ),
  http.delete(
    "*/api/apps/:appId/app-user-auth/connectors/:connectorId",
    async ({ params, request }) => {
      await recordRequest("connectors.disconnectAppUser", request);
      const appId = String(params.appId);
      const user = principalFor(appId, request)?.principal.user;
      if (!user) return unauthorized();
      const disconnected =
        state.appUserConnectorTokens
          .get(appId)
          ?.get(user.id)
          ?.delete(String(params.connectorId)) ?? false;
      return disconnected
        ? HttpResponse.json({
            status: "disconnected",
            connector_id: String(params.connectorId),
          })
        : HttpResponse.json(
            { detail: "No active connection found for this connector" },
            { status: 404 },
          );
    },
  ),
];
