import {
  createClient,
  createClientFromRequest,
  type Base44Client,
  type CreateClientAnalyticsConfig,
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
  CreateClientAnalyticsConfig,
  CreateClientConfig,
  CreateClientOptions,
  Base44ErrorJSON,
};

export * from "./types.js";

// Module types
export type {
  DeleteManyResult,
  DeleteResult,
  EntitiesModule,
  EntityFilterOperators,
  EntityFilterQuery,
  EntityFilterValue,
  EntityHandler,
  EntityRecord,
  EntityTypeRegistry,
  ImportResult,
  RealtimeEventType,
  RealtimeEvent,
  RealtimeCallback,
  SortField,
  UpdateManyResult,
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

export type {
  FunctionsModule,
  FunctionName,
  FunctionNameRegistry,
} from "./modules/functions.types.js";

export type {
  AgentsModule,
  AgentName,
  AgentNameRegistry,
  AgentConversation,
  AgentMessage,
  AgentMessageReasoning,
  AgentMessageToolCall,
  AgentMessageUsage,
  AgentMessageCustomContext,
  AgentMessageMetadata,
  CreateConversationParams,
} from "./modules/agents.types.js";

export type {
  AiGatewayModule,
  AiGatewayConnection,
} from "./modules/ai-gateway.types.js";

export type { AppLogsModule } from "./modules/app-logs.types.js";

export type {
  ActorsModule,
  ActorClient,
  ActorRef,
  Connection,
  ActorSubscription,
  ActorConnectOptions,
  ActorNameRegistry,
  ActorRegistry,
} from "./modules/actors.types.js";

export type { SsoModule, SsoAccessTokenResponse } from "./modules/sso.types.js";

export { Actor, type Conn } from "./actor.js";

export type {
  ConnectorsModule,
  UserConnectorsModule,
  ConnectorApiRequest,
  ConnectorApiResponse,
  ConnectorApiResponsePhase,
} from "./modules/connectors.types.js";

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
