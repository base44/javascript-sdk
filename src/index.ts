import {
  createClient,
  createClientFromRequest,
  type Base44Client,
  type CreateClientConfig,
  type CreateClientOptions,
} from "./client.js";
import { Base44Error, type Base44ErrorJSON } from "./utils/axios-client.js";
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

export type {
  Base44Client,
  CreateClientConfig,
  CreateClientOptions,
  Base44ErrorJSON,
};

export * from "./types.js";

// Module types
export type {
  EntitiesModule,
  EntityHandler,
  RealtimeEventType,
  RealtimeEvent,
  RealtimeCallback,
  SubscribeOptions,
  Subscription,
} from "./modules/entities.types.js";

export type {
  AuthModule,
  LoginResponse,
  RegisterParams,
  VerifyOtpParams,
  ChangePasswordParams,
  ResetPasswordParams,
  User,
} from "./modules/auth.types.js";

export type {
  IntegrationsModule,
  IntegrationPackage,
  IntegrationEndpointFunction,
  CoreIntegrations,
  InvokeLLMParams,
  GenerateImageParams,
  GenerateImageResult,
  UploadFileParams,
  UploadFileResult,
  SendEmailParams,
  SendEmailResult,
  ExtractDataFromUploadedFileParams,
  ExtractDataFromUploadedFileResult,
  UploadPrivateFileParams,
  UploadPrivateFileResult,
  CreateFileSignedUrlParams,
  CreateFileSignedUrlResult,
} from "./modules/integrations.types.js";

export type { FunctionsModule } from "./modules/functions.types.js";

export type {
  AgentsModule,
  AgentConversation,
  AgentMessage,
  AgentMessageReasoning,
  AgentMessageToolCall,
  AgentMessageUsage,
  AgentMessageCustomContext,
  AgentMessageMetadata,
  CreateConversationParams,
} from "./modules/agents.types.js";

export type { AppLogsModule } from "./modules/app-logs.types.js";

export type { SsoModule, SsoAccessTokenResponse } from "./modules/sso.types.js";

export type { ConnectorsModule } from "./modules/connectors.types.js";

export type {
  CustomIntegrationsModule,
  CustomIntegrationCallParams,
  CustomIntegrationCallResponse,
} from "./modules/custom-integrations.types.js";

// Auth utils types
export type {
  GetAccessTokenOptions,
  SaveAccessTokenOptions,
  RemoveAccessTokenOptions,
  GetLoginUrlOptions,
} from "./utils/auth-utils.types.js";
