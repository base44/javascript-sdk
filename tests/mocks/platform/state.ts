export type PlatformRecord = Record<string, any> & { id: string };

export interface RecordedRequest {
  route: string;
  method: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

export type MultipartEntry =
  | { name: string; value: string }
  | {
      name: string;
      file: { name: string; type: string; size: number; bytes: number[] };
    };

export interface MultipartBody {
  type: "multipart";
  entries: MultipartEntry[];
}

export interface PlatformConversation extends PlatformRecord {
  agent_name: string;
  messages: PlatformRecord[];
}

export interface StoredConversation {
  appId: string;
  owner: { kind: "user" | "visitor"; id: string };
  record: PlatformConversation;
}

export interface PlatformRegistration {
  userId: string;
  otpTtlMinutes: number;
  countryCode: string | null;
}

export interface IntegrationEndpoint {
  kind: "email-delivery" | "file-upload" | "legacy-endpoint";
  nextId?: string;
}

export type CustomIntegrationOperation =
  | {
      kind: "github-issues";
      owner: string;
      repository: string;
      issues: Array<Record<string, unknown>>;
    }
  | { kind: "github-user"; user: Record<string, unknown> }
  | { kind: "available" }
  | { kind: "inventory"; items: Array<Record<string, unknown>> }
  | { kind: "request-inspector" }
  | { kind: "api-key-protected"; apiKey: string }
  | { kind: "workspace-identity" };

export interface ConnectorToken {
  accessToken: string;
  integrationType: string;
  connectionConfig?: Record<string, unknown> | null;
}

export type ConnectorProxyService =
  | {
      kind: "social";
      account: Record<string, unknown>;
      tweets: Array<Record<string, unknown>>;
      nextTweetId: number;
    }
  | {
      kind: "maps";
      staticMap: { bytes: number[]; contentType: string };
    }
  | { kind: "echo" };

export interface FunctionInvocation {
  appId: string;
  functionName: string;
  body: unknown;
  query: Record<string, string>;
  headers: Record<string, string>;
}

export type FunctionBehavior = (
  invocation: FunctionInvocation,
) => unknown | Promise<unknown>;

export type PlatformFault =
  | {
      kind: "integration-invalid-parameters";
      appId: string;
      packageName: string;
      endpointName: string;
    }
  | {
      kind: "custom-upstream-unavailable";
      workspaceId: string;
      slug: string;
      operationId: string;
    }
  | {
      kind: "connector-credits-exhausted";
      appId: string;
      integrationType: string;
    }
  | {
      kind: "metered-connector-token-refused";
      appId: string;
      integrationType: string;
    }
  | {
      kind:
        | "connector-upstream-rejected"
        | "connector-not-sent"
        | "connector-timed-out"
        | "connector-sent-unconfirmed";
      appId: string;
      integrationType: string;
    }
  | { kind: "auth-registration-rejected"; appId: string; email: string }
  | { kind: "function-internal-error"; appId: string; functionName: string }
  | { kind: "function-not-found"; appId: string; functionName: string }
  | {
      kind: "function-network-unavailable";
      appId: string;
      functionName: string;
    };

interface PlatformState {
  entities: Map<string, Map<string, PlatformRecord[]>>;
  conversations: Map<string, StoredConversation>;
  integrationEndpoints: Map<string, Map<string, IntegrationEndpoint>>;
  appWorkspaces: Map<string, string>;
  customIntegrations: Map<
    string,
    Map<string, Map<string, CustomIntegrationOperation>>
  >;
  connectorTokens: Map<string, Map<string, ConnectorToken>>;
  workspaceConnectorTokens: Map<string, Map<string, ConnectorToken>>;
  appUserConnectorTokens: Map<string, Map<string, Map<string, ConnectorToken>>>;
  appUserConnectorRedirects: Map<string, Map<string, Map<string, string>>>;
  connectorProxyServices: Map<string, Map<string, ConnectorProxyService>>;
  registrations: Map<string, PlatformRegistration>;
  functionBehaviors: Map<string, Map<string, FunctionBehavior>>;
  legacyFunctions: Set<string>;
  faults: PlatformFault[];
  nextEntityIds: Map<string, number>;
  nextConversationId: number;
  nextMessageId: number;
  requests: RecordedRequest[];
}

export const state: PlatformState = {
  entities: new Map(),
  conversations: new Map(),
  integrationEndpoints: new Map(),
  appWorkspaces: new Map(),
  customIntegrations: new Map(),
  connectorTokens: new Map(),
  workspaceConnectorTokens: new Map(),
  appUserConnectorTokens: new Map(),
  appUserConnectorRedirects: new Map(),
  connectorProxyServices: new Map(),
  registrations: new Map(),
  functionBehaviors: new Map(),
  legacyFunctions: new Set(),
  faults: [],
  nextEntityIds: new Map(),
  nextConversationId: 1,
  nextMessageId: 1,
  requests: [],
};

export function resetPlatformState() {
  state.entities.clear();
  state.conversations.clear();
  state.integrationEndpoints.clear();
  state.appWorkspaces.clear();
  state.customIntegrations.clear();
  state.connectorTokens.clear();
  state.workspaceConnectorTokens.clear();
  state.appUserConnectorTokens.clear();
  state.appUserConnectorRedirects.clear();
  state.connectorProxyServices.clear();
  state.registrations.clear();
  state.functionBehaviors.clear();
  state.legacyFunctions.clear();
  state.faults = [];
  state.nextEntityIds.clear();
  state.nextConversationId = 1;
  state.nextMessageId = 1;
  state.requests = [];
}

export async function recordRequest(
  route: string,
  request: Request,
): Promise<RecordedRequest> {
  const url = new URL(request.url);
  let body: unknown;
  if (request.body) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const text = await request.clone().text();
      body = text ? JSON.parse(text) : undefined;
    } else if (contentType.includes("multipart/form-data")) {
      const entries: MultipartEntry[] = [];
      for (const [name, value] of await request.clone().formData()) {
        if (typeof value === "string") {
          entries.push({ name, value });
        } else {
          entries.push({
            name,
            file: {
              name: value.name,
              type: value.type,
              size: value.size,
              bytes: [...new Uint8Array(await value.arrayBuffer())],
            },
          });
        }
      }
      body = { type: "multipart", entries } satisfies MultipartBody;
    } else {
      body = await request.clone().text();
    }
  }
  const recorded = {
    route,
    method: request.method,
    url: request.url,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(request.headers),
    body,
  } satisfies RecordedRequest;
  state.requests.push(recorded);
  return recorded;
}
