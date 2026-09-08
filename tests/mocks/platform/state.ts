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

export interface PlatformRegistration {
  id: string;
  message: string;
  otpExpiresInMinutes: number;
  countryCode: string | null;
}

export interface IntegrationEndpoint {
  response: unknown;
}

export interface CustomIntegrationOperation {
  data: unknown;
  statusCode: number;
}

export interface ConnectorToken {
  accessToken: string;
  integrationType: string;
  connectionConfig?: Record<string, unknown> | null;
}

export interface ConnectorProxyOutcome {
  success: boolean;
  phase: "responded" | "not_sent" | "timed_out" | "sent_unconfirmed";
  status: number | null;
  data: unknown;
  dataBase64?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  creditsCharged?: number;
}

export type PlatformFault =
  | { kind: "integration-invalid-parameters"; packageName: string; endpointName: string }
  | { kind: "custom-upstream-unavailable"; slug: string; operationId: string }
  | { kind: "connector-credits-exhausted"; integrationType: string }
  | { kind: "metered-connector-token-refused"; integrationType: string }
  | { kind: "auth-registration-rejected"; email: string }
  | { kind: "auth-reset-token-expired"; resetToken: string }
  | { kind: "function-internal-error"; functionName: string }
  | { kind: "function-not-found"; functionName: string }
  | { kind: "function-network-unavailable"; functionName: string };

interface PlatformState {
  entities: Map<string, PlatformRecord[]>;
  conversations: PlatformConversation[];
  integrationEndpoints: Map<string, IntegrationEndpoint>;
  customIntegrations: Map<string, Map<string, CustomIntegrationOperation>>;
  connectorTokens: Map<string, ConnectorToken>;
  workspaceConnectorTokens: Map<string, ConnectorToken>;
  appUserConnectorTokens: Map<string, ConnectorToken>;
  connectorProxyOutcomes: Map<string, ConnectorProxyOutcome>;
  registrations: Map<string, PlatformRegistration>;
  passwordResetRequestMessages: Map<string, string>;
  passwordResetUsers: Map<string, PlatformRecord>;
  functionResults: Map<string, unknown>;
  rawFunctions: Map<string, string>;
  faults: PlatformFault[];
  nextEntityId: number;
  nextConversationId: number;
  nextMessageId: number;
  requests: RecordedRequest[];
}

export const state: PlatformState = {
  entities: new Map(),
  conversations: [],
  integrationEndpoints: new Map(),
  customIntegrations: new Map(),
  connectorTokens: new Map(),
  workspaceConnectorTokens: new Map(),
  appUserConnectorTokens: new Map(),
  connectorProxyOutcomes: new Map(),
  registrations: new Map(),
  passwordResetRequestMessages: new Map(),
  passwordResetUsers: new Map(),
  functionResults: new Map(),
  rawFunctions: new Map(),
  faults: [],
  nextEntityId: 1,
  nextConversationId: 1,
  nextMessageId: 1,
  requests: [],
};

export function resetPlatformState() {
  state.entities.clear();
  state.conversations = [];
  state.integrationEndpoints.clear();
  state.customIntegrations.clear();
  state.connectorTokens.clear();
  state.workspaceConnectorTokens.clear();
  state.appUserConnectorTokens.clear();
  state.connectorProxyOutcomes.clear();
  state.registrations.clear();
  state.passwordResetRequestMessages.clear();
  state.passwordResetUsers.clear();
  state.functionResults.clear();
  state.rawFunctions.clear();
  state.faults = [];
  state.nextEntityId = 1;
  state.nextConversationId = 1;
  state.nextMessageId = 1;
  state.requests = [];
}

export async function recordRequest(route: string, request: Request) {
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
  state.requests.push({
    route,
    method: request.method,
    url: request.url,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(request.headers),
    body,
  });
}
