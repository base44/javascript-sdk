import { actorFixtures, actorHandlers, resetActorState } from "./actors";
import { agentHandlers } from "./agents";
import { analyticsHandlers } from "./analytics";
import { appFixtures, appHandlers, resetAppState } from "./app";
import {
  authFaultFixturesFor,
  authFixturesFor,
  authHandlers,
  resetAuthState,
} from "./auth";
import {
  connectorFaultFixturesFor,
  connectorFixturesFor,
  connectorHandlers,
} from "./connectors";
import { entityHandlers } from "./entities";
import { functionHandlers } from "./functions";
import { genericFixtures, genericHandlers, resetGenericState } from "./generic";
import {
  customIntegrationFaultFixturesFor,
  customIntegrationFixturesFor,
  integrationFaultFixturesFor,
  integrationFixturesFor,
  integrationHandlers,
} from "./integrations";
import { resetSsoState, ssoFixtures, ssoHandlers } from "./sso";
import {
  resetPlatformState,
  state,
  type PlatformConversation,
  type PlatformRegistration,
  type PlatformRecord,
  type RecordedRequest,
  type FunctionBehavior,
  type MultipartBody,
} from "./state";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const platformHandlers = [
  ...authHandlers,
  ...entityHandlers,
  ...agentHandlers,
  ...functionHandlers,
  ...integrationHandlers,
  ...connectorHandlers,
  ...analyticsHandlers,
  ...actorHandlers,
  ...appHandlers,
  ...ssoHandlers,
  ...genericHandlers,
];

function reset() {
  resetPlatformState();
  resetAuthState();
  resetActorState();
  resetAppState();
  resetSsoState();
  resetGenericState();
}

function functionStore(appId: string) {
  let functions = state.functionBehaviors.get(appId);
  if (!functions) {
    functions = new Map();
    state.functionBehaviors.set(appId, functions);
  }
  return functions;
}

function registerFunction(
  appId: string,
  functionName: string,
  behavior: FunctionBehavior,
) {
  functionStore(appId).set(functionName, behavior);
}

function multipart(body: unknown) {
  return body as MultipartBody;
}

function forApp(appId: string) {
  const auth = authFixturesFor(appId);
  const authFaults = authFaultFixturesFor(appId);
  const integrations = integrationFixturesFor(appId);
  const customIntegrations = customIntegrationFixturesFor(appId);
  const connectors = connectorFixturesFor(appId);
  return {
    workspace(workspaceId: string) {
      state.appWorkspaces.set(appId, workspaceId);
    },
    agents: {
      conversationsForUser(
        userId: string,
        conversations: PlatformConversation[],
      ) {
        arrangeConversations(
          appId,
          { kind: "user", id: userId },
          conversations,
        );
      },
      conversationsForVisitor(
        visitorId: string,
        conversations: PlatformConversation[],
      ) {
        arrangeConversations(
          appId,
          { kind: "visitor", id: visitorId },
          conversations,
        );
      },
    },
    entities: {
      records(entityName: string, records: PlatformRecord[]) {
        let appEntities = state.entities.get(appId);
        if (!appEntities) {
          appEntities = new Map();
          state.entities.set(appId, appEntities);
        }
        appEntities.set(entityName, clone(records));
        const numericIds = records
          .map((record) => Number(record.id))
          .filter(Number.isFinite);
        state.nextEntityIds.set(
          appId,
          Math.max(
            state.nextEntityIds.get(appId) ?? 1,
            ...numericIds.map((id) => id + 1),
          ),
        );
      },
    },
    auth: {
      ...auth,
      registration(email: string, registration: PlatformRegistration) {
        state.registrations.set(`${appId}\u0000${email}`, clone(registration));
      },
    },
    functions: {
      notificationDelivery(nextMessageId: string) {
        registerFunction(appId, "sendNotification", ({ body }) => ({
          success: true,
          messageId: nextMessageId,
          recipientId: (body as any).userId,
        }));
      },
      serviceHealth(timestamp: string) {
        registerFunction(appId, "getStatus", () => ({
          status: "healthy",
          timestamp,
        }));
      },
      userProcessor(functionName = "processData") {
        registerFunction(appId, functionName, ({ body }) => ({
          processed: true,
          userId: (body as any)?.user?.id,
        }));
      },
      fileStore(functionName: string, nextFileId: string) {
        registerFunction(appId, functionName, ({ body }) => {
          const file = multipart(body).entries.find(
            (entry) => "file" in entry,
          )?.file;
          return { fileId: nextFileId, filename: file?.name, size: file?.size };
        });
      },
      documentProcessor(nextDocumentId: string, extractedText: string) {
        registerFunction(appId, "processDocument", () => ({
          documentId: nextDocumentId,
          processed: true,
          extractedText,
        }));
      },
      formSubmissions(functionName: string, nextFormId: string) {
        registerFunction(appId, functionName, () => ({
          formId: nextFormId,
          submitted: true,
        }));
      },
      uploadAcceptance(functionName: string) {
        registerFunction(appId, functionName, ({ body }) => ({
          ok: multipart(body).entries.some((entry) => "file" in entry),
          success: true,
        }));
      },
      inputReceipt(functionName: string) {
        registerFunction(appId, functionName, ({ body }) => ({
          received: true,
          values: body,
        }));
      },
      arrayProcessor(functionName: string) {
        registerFunction(appId, functionName, ({ body }) => ({
          processed: true,
          count: Object.values(body as Record<string, unknown>).filter(
            Array.isArray,
          ).length,
        }));
      },
      authenticatedProbe(functionName: string) {
        registerFunction(appId, functionName, ({ headers }) => ({
          success: true,
          authenticated: headers.authorization?.startsWith("Bearer ") ?? false,
        }));
      },
      serviceExecution(functionName: string) {
        registerFunction(appId, functionName, ({ body }) => ({
          result:
            (body as any)?.param === "test" ? "function executed" : "ignored",
        }));
      },
    },
    integrations,
    customIntegrations,
    connectors,
    faults: {
      auth: {
        ...authFaults,
        registrationRejected(email: string) {
          state.faults.push({
            kind: "auth-registration-rejected",
            appId,
            email,
          });
        },
      },
      functions: {
        internalError(functionName: string) {
          state.faults.push({
            kind: "function-internal-error",
            appId,
            functionName,
          });
        },
        notFound(functionName: string) {
          state.faults.push({
            kind: "function-not-found",
            appId,
            functionName,
          });
        },
        networkUnavailable(functionName: string) {
          state.faults.push({
            kind: "function-network-unavailable",
            appId,
            functionName,
          });
        },
      },
      integrations: integrationFaultFixturesFor(appId),
      customIntegrations: customIntegrationFaultFixturesFor(appId),
      connectors: connectorFaultFixturesFor(appId),
    },
  };
}

function arrangeConversations(
  appId: string,
  owner: { kind: "user" | "visitor"; id: string },
  conversations: PlatformConversation[],
) {
  for (const conversation of conversations)
    state.conversations.set(conversation.id, {
      appId,
      owner: clone(owner),
      record: clone(conversation),
    });
  const numericIds = conversations
    .map((conversation) => Number(conversation.id.match(/\d+$/)?.[0]))
    .filter(Number.isFinite);
  state.nextConversationId = Math.max(
    state.nextConversationId,
    ...numericIds.map((id) => id + 1),
  );
}

const appGiven = Object.assign(forApp, appFixtures);

export const platform = {
  reset,
  given: {
    app: appGiven,
    functions: {
      legacyEndpoint(functionPath: string) {
        state.legacyFunctions.add(functionPath.replace(/^\//, ""));
      },
    },
    actors: actorFixtures,
    sso: ssoFixtures,
    generic: genericFixtures,
    faults: {},
  },
  requests: {
    all(route?: string): RecordedRequest[] {
      const requests = route
        ? state.requests.filter((request) => request.route === route)
        : state.requests;
      return clone(requests);
    },
    last(route: string): RecordedRequest {
      const request = state.requests.findLast((item) => item.route === route);
      if (!request) throw new Error(`No request recorded for ${route}`);
      return clone(request);
    },
    count(route: string): number {
      return state.requests.filter((request) => request.route === route).length;
    },
  },
};

export type {
  MultipartBody,
  MultipartEntry,
  PlatformConversation,
  PlatformRegistration,
  PlatformRecord,
  RecordedRequest,
} from "./state";
