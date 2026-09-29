import type { RequestOptions } from "../types.js";

/** Public build state. Unrecognized server states map to unknown. */
export type AppState = "ready" | "processing" | "error" | "unknown";
/** Projected app metadata. No source files, author identity, billing or raw status details. */
export interface PlatformApp {
  /** Base44 app ID. */
  id: string;
  /** App display name, or null if absent. */
  name: string | null;
  /** Public URL slug, or null if absent. */
  slug: string | null;
  /** Build state; unknown when missing or newly introduced by the server. */
  state: AppState;
  /** ISO 8601 update timestamp, or null. */
  updatedAt: string | null;
  /** Preview screenshot URL, or null. */
  previewScreenshotUrl: string | null;
  /** App logo URL, or null. */
  logoUrl: string | null;
  /** ISO 8601 last deployment timestamp, or null. */
  lastDeployedAt: string | null;
  /** Current code revision, or null; permits comparing edits with the deployed version. */
  currentRevision: string | null;
  /** Last deployed code revision, or null. */
  deployedRevision: string | null;
  /** Whether persisted custom instructions are nonempty. Does not return their contents. */
  hasCustomInstructions: boolean;
}
/** App listing options; this is not a partner-user authorization filter. */
export interface ListAppsInput {
  /** Optional Base44 folder ID; omitted means no folder restriction. */
  folderId?: string;
  /** Maximum results; integer > 0, defaults to 20. No total count is returned. */
  limit?: number;
  /** Number of results to skip; integer >= 0, defaults to 0. */
  skip?: number;
}
/** App creation, including the first build. Subsequent chat is not part of this SDK. */
export interface CreateAppInput {
  /** Initial build prompt; required, nonempty. Also used as the app description. */
  prompt: string;
  /** Optional display name; omitted lets the server choose. */
  name?: string;
  /** Optional persisted instructions applied starting with the initial build. */
  customInstructions?: string;
  /** Server-resolved secret name/value pairs installed before the build. Never accept browser-supplied values blindly. */
  secrets?: Record<string, string>;
  /** App access policy; omitted leaves the server default. */
  publicSettings?: "private_with_login" | "public_with_login" | "public_without_login" | "workspace_with_login";
  /** Whether to block iframe embedding; omitted leaves the server default. Starter sets false. */
  preventIframeEmbedding?: boolean;
}
/** Preview access. Credential-bearing fields must not be logged or cached. */
export interface PreviewResult {
  /** Preview URL for unpublished changes. May itself include authorization material. */
  url: string;
  /** Short-lived preview credential, or null when not needed. Not a platform access token. */
  token: string | null;
}
/** Completed deployment response; identifies the version published by this request. */
export interface DeployResult {
  /** Deployed app ID. */
  appId: string;
  /** Associated saved-version ID, or null. */
  checkpointId: string | null;
  /** Exact published code revision. */
  revision: string;
  /** ISO 8601 deployment timestamp. */
  deployedAt: string;
}
/** App operations performed as the user bound by asUser. */
export interface AppsModule {
  /** List apps newest-updated first, excluding agent apps; returns a bare array. */
  list(input?: ListAppsInput, options?: RequestOptions): Promise<PlatformApp[]>;
  /** Create and start the first build. No automatic retry, filing or local ownership write. */
  create(input: CreateAppInput, options?: RequestOptions): Promise<PlatformApp>;
  /** Read projected metadata for an authorized app. */
  get(appId: string, options?: RequestOptions): Promise<PlatformApp>;
  /** Rename only; whitespace around the name is trimmed. */
  rename(appId: string, name: string, options?: RequestOptions): Promise<PlatformApp>;
  /** Move apps into a folder. Separate from creation; failure leaves created apps intact. */
  addToFolder(folderId: string, appIds: string[], options?: RequestOptions): Promise<void>;
  /** Boot or reuse a preview; request fresh access each time it is needed. */
  getPreviewUrl(appId: string, options?: RequestOptions): Promise<PreviewResult>;
  /** Publish the current main version. No polling or chat subscription is started. */
  deploy(appId: string, options?: RequestOptions): Promise<DeployResult>;
}
