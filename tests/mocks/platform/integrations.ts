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

function integrationStore(appId: string) {
  let endpoints = state.integrationEndpoints.get(appId);
  if (!endpoints) {
    endpoints = new Map();
    state.integrationEndpoints.set(appId, endpoints);
  }
  return endpoints;
}

export function integrationFixturesFor(appId: string) {
  return {
    legacyEndpoint(packageName: string, endpointName: string) {
      integrationStore(appId).set(endpointKey(packageName, endpointName), {
        kind: "legacy-endpoint",
      });
    },
    emailDelivered(messageId = "123456") {
      integrationStore(appId).set(endpointKey("Core", "SendEmail"), {
        kind: "email-delivery",
        nextId: messageId,
      });
    },
    fileUploaded(fileId = "file123") {
      integrationStore(appId).set(endpointKey("Core", "UploadFile"), {
        kind: "file-upload",
        nextId: fileId,
      });
    },
  };
}

export function integrationFaultFixturesFor(appId: string) {
  return {
    invalidParameters(packageName: string, endpointName: string) {
      state.faults.push({
        kind: "integration-invalid-parameters",
        appId,
        packageName,
        endpointName,
      });
    },
  };
}

function invokeIntegration(
  appId: string,
  packageName: string,
  endpointName: string,
  body: unknown,
) {
  const fault = takeFault(
    (item) =>
      item.kind === "integration-invalid-parameters" &&
      item.appId === appId &&
      item.packageName === packageName &&
      item.endpointName === endpointName,
  );
  if (fault)
    return HttpResponse.json(
      { detail: "Invalid parameters", code: "INVALID_PARAMS" },
      { status: 400 },
    );
  // This deterministic transport contract does not simulate model behavior.
  // It only proves that the SDK forwards LLM options and returns JSON/text.
  if (packageName === "Core" && endpointName === "InvokeLLM")
    return HttpResponse.json(
      (body as Record<string, unknown>)?.response_json_schema
        ? { mock: true, kind: "structured" }
        : "Mock LLM text response",
    );
  const endpoint = integrationStore(appId).get(
    endpointKey(packageName, endpointName),
  );
  if (!endpoint)
    return HttpResponse.json(
      {
        detail: `Integration endpoint '${packageName}.${endpointName}' not found`,
        code: "NOT_FOUND",
      },
      { status: 404 },
    );
  switch (endpoint.kind) {
    case "email-delivery":
      return HttpResponse.json({ success: true, messageId: endpoint.nextId });
    case "file-upload":
      return HttpResponse.json({ success: true, fileId: endpoint.nextId });
    case "legacy-endpoint":
      return HttpResponse.json({ success: true, received: body });
  }
}

function parseCustomRoute(request: Request) {
  const match = new URL(request.url).pathname.match(
    /^\/api\/apps\/([^/]+)\/integrations\/custom\/([^/]+)\/(.+)$/,
  );
  if (!match) return undefined;
  return {
    appId: decodeURIComponent(match[1]),
    slug: decodeURIComponent(match[2]),
    operationId: decodeURIComponent(match[3]),
  };
}

function workspaceOperations(workspaceId: string, slug: string) {
  let integrations = state.customIntegrations.get(workspaceId);
  if (!integrations) {
    integrations = new Map();
    state.customIntegrations.set(workspaceId, integrations);
  }
  let operations = integrations.get(slug);
  if (!operations) {
    operations = new Map();
    integrations.set(slug, operations);
  }
  return operations;
}

function workspaceFor(appId: string) {
  const workspaceId = state.appWorkspaces.get(appId);
  if (!workspaceId)
    throw new Error(`Arrange a workspace for app '${appId}' first`);
  return workspaceId;
}

export function customIntegrationFixturesFor(appId: string) {
  return {
    githubRepository(
      slug: string,
      owner: string,
      repository: string,
      issues: Array<Record<string, unknown>>,
    ) {
      workspaceOperations(workspaceFor(appId), slug).set(
        "get:/repos/{owner}/{repo}/issues",
        {
          kind: "github-issues",
          owner,
          repository,
          issues: structuredClone(issues),
        },
      );
    },
    githubUser(slug: string, user: Record<string, unknown>) {
      const operations = workspaceOperations(workspaceFor(appId), slug);
      operations.set("getAuthenticatedUser", {
        kind: "github-user",
        user: structuredClone(user),
      });
      operations.set("get:/users/{username}", {
        kind: "github-user",
        user: structuredClone(user),
      });
    },
    operationAvailable(slug: string, operationId: string) {
      workspaceOperations(workspaceFor(appId), slug).set(operationId, {
        kind: "available",
      });
    },
    inventory(slug: string) {
      const items: Array<Record<string, unknown>> = [];
      const operations = workspaceOperations(workspaceFor(appId), slug);
      operations.set("bulkCreate", { kind: "inventory", items });
      operations.set("listItems", { kind: "inventory", items });
    },
    requestInspector(slug: string) {
      workspaceOperations(workspaceFor(appId), slug).set("getData", {
        kind: "request-inspector",
      });
    },
    apiKeyProtected(slug: string, apiKey: string) {
      workspaceOperations(workspaceFor(appId), slug).set("secureEndpoint", {
        kind: "api-key-protected",
        apiKey,
      });
    },
    workspaceIdentity(slug: string) {
      workspaceOperations(workspaceFor(appId), slug).set("whoami", {
        kind: "workspace-identity",
      });
    },
  };
}

function customOperationData(
  workspaceId: string,
  operationId: string,
  operation: import("./state").CustomIntegrationOperation,
  body: Record<string, any>,
) {
  switch (operation.kind) {
    case "github-issues":
      return {
        issues:
          body.path_params?.owner === operation.owner &&
          body.path_params?.repo === operation.repository
            ? structuredClone(operation.issues).filter(
                (issue) =>
                  !body.query_params?.state ||
                  issue.state === body.query_params.state,
              )
            : [],
      };
    case "github-user":
      return structuredClone(operation.user);
    case "available":
      return { available: true };
    case "inventory": {
      if (operationId === "bulkCreate") {
        const incoming = Array.isArray(body.payload?.items)
          ? body.payload.items
          : [];
        operation.items.push(...structuredClone(incoming));
        return { created: incoming.length, total: operation.items.length };
      }
      return { items: structuredClone(operation.items) };
    }
    case "request-inspector":
      return { receivedHeaders: structuredClone(body.headers ?? {}) };
    case "api-key-protected":
      return {
        authenticated: body.headers?.["X-API-Key"] === operation.apiKey,
      };
    case "workspace-identity":
      return { workspaceId };
  }
}

export function customIntegrationFaultFixturesFor(appId: string) {
  return {
    upstreamUnavailable(slug: string, operationId: string) {
      state.faults.push({
        kind: "custom-upstream-unavailable",
        workspaceId: workspaceFor(appId),
        slug,
        operationId,
      });
    },
  };
}

export const integrationHandlers = [
  http.post(
    "*/api/apps/:appId/integration-endpoints/Core/:endpointName",
    async ({ params, request }) => {
      const recorded = await recordRequest("integrations.invoke", request);
      return invokeIntegration(
        String(params.appId),
        "Core",
        String(params.endpointName),
        recorded.body,
      );
    },
  ),
  http.post(
    // Legacy SDK compatibility: current Apper no longer exposes installable-package
    // integrations, but the SDK still promises this dynamic package route.
    "*/api/apps/:appId/integration-endpoints/installable/:packageName/integration-endpoints/:endpointName",
    async ({ params, request }) => {
      const recorded = await recordRequest("integrations.invoke", request);
      return invokeIntegration(
        String(params.appId),
        String(params.packageName),
        String(params.endpointName),
        recorded.body,
      );
    },
  ),
  http.post(
    /^https?:\/\/[^/]+\/api\/apps\/[^/]+\/integrations\/custom\/.+$/,
    async ({ request }) => {
      const recorded = await recordRequest("customIntegrations.call", request);
      const route = parseCustomRoute(request);
      if (!route)
        return HttpResponse.json(
          { detail: "Custom integration route not found" },
          { status: 404 },
        );
      const { appId, slug, operationId } = route;
      const workspaceId = state.appWorkspaces.get(appId);
      if (!workspaceId)
        return HttpResponse.json(
          { detail: `Custom integration '${slug}' not found in workspace` },
          { status: 404 },
        );
      const upstreamFault = takeFault(
        (item) =>
          item.kind === "custom-upstream-unavailable" &&
          item.workspaceId === workspaceId &&
          item.slug === slug &&
          item.operationId === operationId,
      );
      if (upstreamFault)
        return HttpResponse.json(
          { detail: "Failed to connect to external API: Connection refused" },
          { status: 502 },
        );
      const operations = state.customIntegrations.get(workspaceId)?.get(slug);
      if (!operations)
        return HttpResponse.json(
          { detail: `Custom integration '${slug}' not found in workspace` },
          { status: 404 },
        );
      const operation = operations.get(operationId);
      if (!operation)
        return HttpResponse.json(
          {
            detail: `Operation '${operationId}' not found in integration '${slug}'`,
          },
          { status: 404 },
        );
      return HttpResponse.json({
        success: true,
        status_code: 200,
        data: customOperationData(
          workspaceId,
          operationId,
          operation,
          (recorded.body ?? {}) as Record<string, any>,
        ),
      });
    },
  ),
];
