import { http, HttpResponse } from "msw";
import { recordRequest, state, type PlatformFault } from "./state";

const endpointKey = (packageName: string, endpointName: string) =>
  `${packageName}:${endpointName}`;

function takeFault(predicate: (fault: PlatformFault) => boolean) {
  const index = state.faults.findIndex(predicate);
  if (index < 0) return false;
  state.faults.splice(index, 1);
  return true;
}

export const integrationFixtures = {
  packageSucceeds(packageName: string, endpointName: string, result: Record<string, unknown> = {}) {
    state.integrationEndpoints.set(endpointKey(packageName, endpointName), {
      response: { success: true, ...result },
    });
  },
  emailDelivered(messageId = "123456") {
    this.packageSucceeds("Core", "SendEmail", { messageId });
  },
  fileUploaded(fileId = "file123") {
    this.packageSucceeds("Core", "UploadFile", { fileId });
  },
  llmResponds(response: unknown) {
    state.integrationEndpoints.set(endpointKey("Core", "InvokeLLM"), { response });
  },
};

export const integrationFaultFixtures = {
  invalidParameters(packageName: string, endpointName: string) {
    state.faults.push({ kind: "integration-invalid-parameters", packageName, endpointName });
  },
};

function invokeIntegration(packageName: string, endpointName: string) {
  const fault = takeFault(
    (item) =>
      item.kind === "integration-invalid-parameters" &&
      item.packageName === packageName &&
      item.endpointName === endpointName,
  );
  if (fault)
    return HttpResponse.json(
      { detail: "Invalid parameters", code: "INVALID_PARAMS" },
      { status: 400 },
    );
  const endpoint = state.integrationEndpoints.get(endpointKey(packageName, endpointName));
  if (!endpoint)
    return HttpResponse.json(
      { detail: `Integration endpoint '${packageName}.${endpointName}' not found`, code: "NOT_FOUND" },
      { status: 404 },
    );
  return HttpResponse.json(endpoint.response);
}

function parseCustomRoute(request: Request) {
  const match = new URL(request.url).pathname.match(
    /^\/api\/apps\/[^/]+\/integrations\/custom\/([^/]+)\/(.+)$/,
  );
  if (!match) return undefined;
  return { slug: decodeURIComponent(match[1]), operationId: decodeURIComponent(match[2]) };
}

export const customIntegrationFixtures = {
  operation(slug: string, operationId: string, data: unknown, statusCode = 200) {
    let operations = state.customIntegrations.get(slug);
    if (!operations) {
      operations = new Map();
      state.customIntegrations.set(slug, operations);
    }
    operations.set(operationId, { data, statusCode });
  },
};

export const customIntegrationFaultFixtures = {
  upstreamUnavailable(slug: string, operationId: string) {
    state.faults.push({ kind: "custom-upstream-unavailable", slug, operationId });
  },
};

export const integrationHandlers = [
  http.post(
    "*/api/apps/:appId/integration-endpoints/Core/:endpointName",
    async ({ params, request }) => {
      await recordRequest("integrations.invoke", request);
      return invokeIntegration("Core", String(params.endpointName));
    },
  ),
  http.post(
    // Legacy SDK compatibility: current Apper no longer exposes installable-package
    // integrations, but the SDK still promises this dynamic package route.
    "*/api/apps/:appId/integration-endpoints/installable/:packageName/integration-endpoints/:endpointName",
    async ({ params, request }) => {
      await recordRequest("integrations.invoke", request);
      return invokeIntegration(String(params.packageName), String(params.endpointName));
    },
  ),
  http.post(/^https?:\/\/[^/]+\/api\/apps\/[^/]+\/integrations\/custom\/.+$/, async ({ request }) => {
    await recordRequest("customIntegrations.call", request);
    const route = parseCustomRoute(request);
    if (!route)
      return HttpResponse.json({ detail: "Custom integration route not found" }, { status: 404 });
    const { slug, operationId } = route;
    const upstreamFault = takeFault(
      (item) =>
        item.kind === "custom-upstream-unavailable" &&
        item.slug === slug &&
        item.operationId === operationId,
    );
    if (upstreamFault)
      return HttpResponse.json({
        success: false,
        status_code: 502,
        data: { detail: "Failed to connect to external API: Connection refused" },
      });
    const operations = state.customIntegrations.get(slug);
    if (!operations)
      return HttpResponse.json(
        { detail: `Custom integration '${slug}' not found in workspace` },
        { status: 404 },
      );
    const operation = operations.get(operationId);
    if (!operation)
      return HttpResponse.json(
        { detail: `Operation '${operationId}' not found in integration '${slug}'` },
        { status: 404 },
      );
    return HttpResponse.json({
      success: true,
      status_code: operation.statusCode,
      data: operation.data,
    });
  }),
];
