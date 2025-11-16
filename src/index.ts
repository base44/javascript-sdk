import {
  createClient,
  createClientFromRequest,
  type Base44Client,
  type CreateClientConfig,
  type CreateClientOptions,
} from "./client.js";
import { Base44Error } from "./utils/axios-client.js";
import {
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
} from "./utils/auth-utils.js";

export {
  createClient,
  createClientFromRequest,
  Base44Error,
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
};

export type { Base44Client, CreateClientConfig, CreateClientOptions };

export * from "./types.js";

// Module types
export type {
  EntitiesModule,
  EntityHandler,
} from "./modules/entities.types.js";

export type {
  AuthModule,
  LoginResponse,
  RegisterPayload,
} from "./modules/auth.types.js";

export type {
  IntegrationsModule,
  IntegrationPackage,
  IntegrationEndpointFunction,
} from "./modules/integrations.types.js";

export type { FunctionsModule } from "./modules/functions.types.js";

export type { AgentsModule } from "./modules/agents.types.js";

export type { AppLogsModule } from "./modules/app-logs.types.js";

export type { SsoModule, SsoAccessTokenResponse } from "./modules/sso.types.js";

export type { ConnectorsModule } from "./modules/connectors.types.js";

// Auth utils types
export type {
  GetAccessTokenOptions,
  SaveAccessTokenOptions,
  RemoveAccessTokenOptions,
  GetLoginUrlOptions,
} from "./utils/auth-utils.types.js";
