import { actorFixtures, actorHandlers, resetActorState } from "./actors";
import { agentHandlers } from "./agents";
import { analyticsHandlers } from "./analytics";
import { appFixtures, appHandlers, resetAppState } from "./app";
import {
  authFaultFixtures,
  authFixtures,
  authHandlers,
  resetAuthState,
} from "./auth";
import {
  connectorFaultFixtures,
  connectorFixtures,
  connectorHandlers,
} from "./connectors";
import { entityHandlers } from "./entities";
import { functionHandlers } from "./functions";
import { genericFixtures, genericHandlers, resetGenericState } from "./generic";
import {
  customIntegrationFaultFixtures,
  customIntegrationFixtures,
  integrationFaultFixtures,
  integrationFixtures,
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

export const platform = {
  reset,
  given: {
    entities: {
      records(entityName: string, records: PlatformRecord[]) {
        state.entities.set(entityName, clone(records));
        const numericIds = records
          .map((record) => Number(record.id))
          .filter(Number.isFinite);
        state.nextEntityId = Math.max(
          state.nextEntityId,
          ...numericIds.map((id) => id + 1),
        );
      },
    },
    agents: {
      conversations(conversations: PlatformConversation[]) {
        state.conversations = clone(conversations);
        const numericIds = conversations
          .map((conversation) => Number(conversation.id.match(/\d+$/)?.[0]))
          .filter(Number.isFinite);
        state.nextConversationId = Math.max(
          state.nextConversationId,
          ...numericIds.map((id) => id + 1),
        );
      },
    },
    auth: {
      ...authFixtures,
      registration(email: string, registration: PlatformRegistration) {
        state.registrations.set(email, clone(registration));
      },
      passwordResetRequest(email: string, message = "Request accepted") {
        state.passwordResetRequestMessages.set(email, message);
      },
      passwordReset(resetToken: string, user: PlatformRecord) {
        state.passwordResetUsers.set(resetToken, clone(user));
      },
    },
    functions: {
      result(functionName: string, result: unknown) {
        state.functionResults.set(functionName, clone(result));
      },
      raw(functionPath: string, response = "ok") {
        state.rawFunctions.set(functionPath.replace(/^\//, ""), response);
      },
    },
    integrations: integrationFixtures,
    customIntegrations: customIntegrationFixtures,
    connectors: connectorFixtures,
    actors: actorFixtures,
    app: appFixtures,
    sso: ssoFixtures,
    generic: genericFixtures,
    faults: {
      auth: {
        ...authFaultFixtures,
        registrationRejected(email: string) {
          state.faults.push({ kind: "auth-registration-rejected", email });
        },
        resetTokenExpired(resetToken: string) {
          state.faults.push({ kind: "auth-reset-token-expired", resetToken });
        },
      },
      functions: {
        internalError(functionName: string) {
          state.faults.push({ kind: "function-internal-error", functionName });
        },
        notFound(functionName: string) {
          state.faults.push({ kind: "function-not-found", functionName });
        },
        networkUnavailable(functionName: string) {
          state.faults.push({
            kind: "function-network-unavailable",
            functionName,
          });
        },
      },
      integrations: integrationFaultFixtures,
      customIntegrations: customIntegrationFaultFixtures,
      connectors: connectorFaultFixtures,
    },
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
