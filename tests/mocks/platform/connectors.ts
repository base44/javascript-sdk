import { http, HttpResponse } from "msw";
import {
  recordRequest,
  state,
  type ConnectorProxyService,
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
    socialApi(
      integrationType: string,
      account: Record<string, unknown> = { id: "mock-account" },
    ) {
      appStore(state.connectorProxyServices, appId).set(integrationType, {
        kind: "social",
        account: structuredClone(account),
        tweets: [],
        nextTweetId: 1,
      });
    },
    mapsApi(
      integrationType: string,
      staticMap: { bytes: number[]; contentType: string },
    ) {
      appStore(state.connectorProxyServices, appId).set(integrationType, {
        kind: "maps",
        staticMap: structuredClone(staticMap),
      });
    },
    echoApi(integrationType: string) {
      appStore(state.connectorProxyServices, appId).set(integrationType, {
        kind: "echo",
      });
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
    upstreamRejected(integrationType: string) {
      state.faults.push({
        kind: "connector-upstream-rejected",
        appId,
        integrationType,
      });
    },
    notSent(integrationType: string) {
      state.faults.push({ kind: "connector-not-sent", appId, integrationType });
    },
    timedOut(integrationType: string) {
      state.faults.push({
        kind: "connector-timed-out",
        appId,
        integrationType,
      });
    },
    sentUnconfirmed(integrationType: string) {
      state.faults.push({
        kind: "connector-sent-unconfirmed",
        appId,
        integrationType,
      });
    },
  };
}

function proxyEnvelope(
  service: ConnectorProxyService,
  requestBody: Record<string, any>,
) {
  if (service.kind === "social") {
    if (requestBody.method === "POST" && requestBody.path === "/2/tweets") {
      if (typeof requestBody.body?.text !== "string")
        return {
          success: false,
          phase: "responded",
          status_code: 400,
          data: { title: "Tweet text is required" },
          headers: {},
          credits_charged: 3,
        };
      const tweet = {
        id: String(service.nextTweetId++),
        text: requestBody.body?.text,
      };
      service.tweets.push(tweet);
      return {
        success: true,
        phase: "responded",
        status_code: 201,
        data: { data: tweet },
        headers: { "x-rate-limit-remaining": "42" },
        credits_charged: 3,
      };
    }
    if (requestBody.path === "/2/tweets/search/recent")
      return {
        success: true,
        phase: "responded",
        status_code: 200,
        data: { data: structuredClone(service.tweets) },
        headers: { "x-rate-limit-remaining": "42" },
        credits_charged: 3,
      };
    if (requestBody.path === "/2/users/me" || requestBody.path === "/scope")
      return {
        success: true,
        phase: "responded",
        status_code: 200,
        data: { data: structuredClone(service.account) },
        headers: { "x-rate-limit-remaining": "42" },
        credits_charged: 3,
      };
    return {
      success: false,
      phase: "responded",
      status_code: 404,
      data: { title: "Upstream resource not found" },
      headers: {},
      credits_charged: 3,
    };
  }
  if (service.kind === "maps") {
    const isStaticMap = String(requestBody.path).includes("staticmap");
    return {
      success: true,
      phase: "responded",
      status_code: 200,
      data: isStaticMap ? null : { location: "Mock place" },
      ...(isStaticMap
        ? {
            data_base64: btoa(String.fromCharCode(...service.staticMap.bytes)),
            content_type: service.staticMap.contentType,
          }
        : {}),
      headers: {},
      credits_charged: 1,
    };
  }
  return {
    success: true,
    phase: "responded",
    status_code: 200,
    data: { received: structuredClone(requestBody) },
    headers: {},
    credits_charged: 0,
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
      const recorded = await recordRequest("connectors.callApi", request);
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
      const upstreamRejected = takeFault(
        (item) =>
          item.kind === "connector-upstream-rejected" &&
          item.appId === appId &&
          item.integrationType === integrationType,
      );
      if (upstreamRejected)
        return HttpResponse.json({
          success: false,
          phase: "responded",
          status_code: 400,
          data: { title: "Invalid Request" },
          headers: {},
          credits_charged: 3,
        });
      const uncertain = state.faults.findIndex(
        (item) =>
          [
            "connector-not-sent",
            "connector-timed-out",
            "connector-sent-unconfirmed",
          ].includes(item.kind) &&
          "appId" in item &&
          item.appId === appId &&
          "integrationType" in item &&
          item.integrationType === integrationType,
      );
      if (uncertain >= 0) {
        const [fault] = state.faults.splice(uncertain, 1);
        const phase =
          fault.kind === "connector-not-sent"
            ? "not_sent"
            : fault.kind === "connector-timed-out"
              ? "timed_out"
              : "sent_unconfirmed";
        return HttpResponse.json({
          success: false,
          phase,
          status_code: null,
          data: { error: "request outcome unknown" },
          headers: {},
          credits_charged: phase === "not_sent" ? 0 : 3,
        });
      }
      const service = state.connectorProxyServices
        .get(appId)
        ?.get(integrationType);
      if (!service)
        return HttpResponse.json(
          { detail: "Connector proxy not configured", code: "NOT_FOUND" },
          { status: 404 },
        );
      return HttpResponse.json(
        proxyEnvelope(service, recorded.body as Record<string, any>),
      );
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
