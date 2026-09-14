import type { RequestOptions } from "../types.js";

/** Input for an explicitly requested provisioning operation. */
export interface ProvisionUserInput {
  /** Stable ID from your system; trimmed and lowercased, never a Base44 user ID. */
  externalId: string;
  /** Optional display label visible to workspace administrators; avoid personal data. */
  displayName?: string;
}
/** Synthetic service identity returned by provisioning, not a login-capable account. */
export interface ProvisionedUser {
  /** Canonical ID from your system. */
  externalId: string;
  /** Base44-assigned user ID. */
  userId: string;
  /** Synthetic, non-routable service address; not your customer's email. */
  email: string;
  /** Workspace role returned by Base44; this SDK never requests an elevated role. */
  role: string;
  /** True if created by this request, false if it already existed. */
  created: boolean;
}
/** Outcome of removing a service identity. */
export interface DeprovisionResult {
  /** False if already absent; true if removed. */
  removed: boolean;
}
/** Workspace-level identity operations, authenticated with the configured API key. */
export interface UsersModule {
  /** Explicitly create or return a principal; idempotent within its workspace. */
  provision(input: ProvisionUserInput, options?: RequestOptions): Promise<ProvisionedUser>;
  /** Offboard and clear local tokens. Owned apps may transfer to the workspace owner. */
  deprovision(externalId: string, options?: RequestOptions): Promise<DeprovisionResult>;
}
