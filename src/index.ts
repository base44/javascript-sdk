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
  AppModule,
  AppPublicSettings,
  AppPublicSettingsResponse,
} from "./modules/app.types.js";

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

// Apple in-app purchase types.
//
// Type-only on purpose. The runtime lives behind the "@base44/sdk/iap" subpath
// export so a browser or React Native bundle never downloads certificate
// parsing or cryptography, while `dist/index.js` stays byte-identical — `tsc`
// erases an `export type` entirely. Naming these from "@base44/sdk" in shared
// front-end code therefore costs nothing at runtime.
export type {
  CreateIapClientOptions,
  IapInternalOptions,
} from "./iap/index.js";
export type {
  IapConfig,
  IapConfiguredProductType,
  IapModule,
  IapProductConfig,
  IapSetupReport,
} from "./iap/iap.types.js";
export type {
  IapEvent,
  IapEventHandler,
  IapEventType,
  IapExpiryReason,
  IapRenewReason,
  IapStartReason,
} from "./iap/events/events.types.js";
export type {
  EntitlementQuery,
  Entitlements,
  IapExpirationReason,
  IapRevocation,
  IapSubscriptionOffer,
  IapSubscriptionStatus,
  OwnedNonConsumable,
  OwnedNonRenewingSubscription,
  SubscriptionQuery,
  SubscriptionState,
  TransactionQuery,
} from "./iap/read/read.types.js";
export type { HandleNotificationResult } from "./iap/ingest/notifications.js";
export type {
  RecordTransactionOptions,
  RecordTransactionResult,
  SyncPayload,
  SyncResult,
} from "./iap/ingest/device.types.js";
export type {
  IapConsumptionOutcome,
  IapConsumptionRequestRecord,
  IapNotificationOutcome,
  IapNotificationRecord,
  IapRecordSource,
  IapSubscriptionRecord,
  IapTransactionRecord,
} from "./iap/store/rows.types.js";
export type {
  IapEntityName,
  IapEntitySchema,
  IapSchemaField,
} from "./iap/store/schemas.js";
export type {
  ConsumptionRequestBody,
  IapDeliveryStatus,
  IapRefundPreference,
  IapServerApiConfig,
  IapServerApiModule,
  SendAttempt,
  SendAttemptResult,
  TestNotificationResult,
  TestNotificationStatus,
} from "./iap/server-api/server-api.types.js";
export type {
  IapApiErrorCode,
  IapConfigErrorCode,
  IapSetupErrorCode,
  IapStoreErrorCode,
  IapVerificationErrorCode,
} from "./iap/errors.types.js";
export type {
  DecodedNotification,
  DecodedNotificationData,
  DecodedNotificationSummary,
  DecodedRenewalInfo,
  DecodedTransaction,
  IapAppleSubscriptionStatus,
  IapConsumptionRequestReason,
  IapEnvironment,
  IapExpirationIntent,
  IapOfferDiscountType,
  IapOfferType,
  IapOwnershipType,
  IapProductType,
  IapRevocationType,
  IapTransactionReason,
} from "./iap/verify/verify.types.js";
