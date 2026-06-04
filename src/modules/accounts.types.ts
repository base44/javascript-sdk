/**
 * Types for the {@link AccountsModule | accounts} module (multi-tenancy).
 *
 * An Account groups the app's end-users into an isolated tenant (a company,
 * team, or organization). Users join accounts via membership and act inside one
 * active account at a time. Account-scoped entities are transparently isolated
 * to the active account (carried by the `X-Active-Account-Id` header, read from
 * stored client state in localStorage, keyed per app).
 */

/** Account-management role. Distinct from the app's business roles. */
export type AccountRole = "owner" | "admin" | "member";

/** Assignable (non-owner) role used for invites/role changes. */
export type AssignableAccountRole = "admin" | "member";

export type AccountStatus = "active" | "suspended";
export type AccountMembershipStatus = "pending" | "active";

/** An account (tenant) within the app. */
export interface Account {
  id: string;
  app_id: string;
  name: string;
  status: AccountStatus;
  plan_id?: string | null;
  billing_status?: string;
  /** The current user's role in this account (present on `listMine()` results). */
  my_role?: AccountRole;
  /** Builder-defined custom fields. */
  data?: Record<string, unknown>;
  created_date?: string;
}

/** The accounts the current user belongs to, plus the active one. */
export interface MyAccountsResponse {
  accounts: Account[];
  active_account_id: string | null;
}

/**
 * Public, unauthenticated view of an account (its landing page), resolved by
 * slug. Carries identity plus only the builder-designated public custom fields.
 */
export interface PublicAccount {
  id: string;
  name: string;
  slug: string | null;
  /** Builder-flagged public companion fields (e.g. logo, tagline). */
  data: Record<string, unknown>;
}

/** A user's membership in an account. */
export interface AccountMembership {
  id: string;
  account_id: string;
  email: string;
  role: AccountRole;
  status: AccountMembershipStatus;
}

/** A subscription plan/tier offered to accounts. */
export interface AccountPlan {
  id: string;
  name: string;
  description?: string | null;
  price_amount: number;
  currency: string;
  interval: "month" | "year";
  is_active: boolean;
}

/** A provider checkout session. */
export interface CheckoutSession {
  url: string;
  session_id: string;
}

/** Parameters for starting a subscription checkout. */
export interface CheckoutParams {
  plan_id: string;
  success_url: string;
  cancel_url: string;
}

/** The current subscription state of an account. */
export interface AccountSubscription {
  account_id: string;
  /** The active plan id, or `null` when the account has no subscription. */
  plan_id: string | null;
  /** Lifecycle status: "none" | "active" | "past_due" | "canceled". */
  billing_status: string;
  /** The payment rail backing the subscription, or `null`. */
  billing_provider: string | null;
  /** The current plan, or `null` when the account has no subscription. */
  plan: AccountPlan | null;
  /** When the current paid period ends / renews (ISO 8601), or `null`. */
  current_period_end: string | null;
  /** True when the subscription will not renew at period end. */
  cancel_at_period_end: boolean;
  /** When the subscription was canceled (ISO 8601), or `null`. */
  canceled_at: string | null;
  /** When the subscription started (ISO 8601), or `null`. */
  started_at: string | null;
}

/**
 * The accounts module — manage multi-tenancy ("Accounts") from inside the app.
 *
 * Access via `base44.accounts`. Available when the app has multi-tenancy enabled.
 */
export interface AccountsModule {
  /** The active account id, read from stored client state (or `undefined`). */
  getActiveAccountId(): string | undefined;
  /**
   * Switch the active account by persisting it to stored client state and
   * reloading the page so all data follows the new account.
   * @param accountId - The account to switch to.
   */
  switchAccount(accountId: string): void;
  /**
   * Persist the active account WITHOUT reloading the page.
   *
   * Use on the public landing page to select the account before redirecting to
   * login, so the app resolves that account after the visitor returns. For
   * switching accounts inside the running app, use {@link switchAccount} (which
   * reloads so all data follows the new account).
   */
  setActiveAccount(accountId: string): void;
  /** Clear the stored active account (the backend falls back to the default). */
  clearActiveAccount(): void;
  /** List the accounts the current user belongs to, plus the active one. */
  listMine(): Promise<MyAccountsResponse>;
  /**
   * Resolve a public account by its slug (unauthenticated) for its landing page.
   * @param slug - The account's URL slug.
   */
  getPublicAccount(slug: string): Promise<PublicAccount>;
  /**
   * Self-join an account by slug (the current user becomes a member). Requires
   * login and that the app enables public joining; otherwise rejects.
   * @param slug - The account's URL slug.
   */
  joinAccount(slug: string): Promise<AccountMembership>;
  /** Create a new account; the current user becomes its owner. */
  create(params: { name: string; data?: Record<string, unknown> }): Promise<Account>;
  /** Rename and/or update an account's custom fields (managers only). */
  update(
    accountId: string,
    params: { name?: string; data?: Record<string, unknown> }
  ): Promise<Account>;
  /**
   * List an account's members (any active member).
   * @param accountId - Defaults to the active account when omitted.
   */
  listMembers(accountId?: string): Promise<AccountMembership[]>;
  /** Invite a user by email to an account (managers only). */
  invite(
    accountId: string,
    email: string,
    role?: AssignableAccountRole
  ): Promise<AccountMembership>;
  /** Accept a pending invite to an account for the current user. */
  acceptInvite(accountId: string): Promise<AccountMembership>;
  /** Change a member's role (managers only; not for the owner). */
  changeMemberRole(
    accountId: string,
    email: string,
    role: AssignableAccountRole
  ): Promise<AccountMembership>;
  /** Remove a member from an account (managers only; not the owner). */
  removeMember(accountId: string, email: string): Promise<{ removed: boolean }>;
  /** Transfer ownership to another active member (owner only). */
  transferOwnership(
    accountId: string,
    email: string
  ): Promise<{ transferred: boolean }>;
  /** Per-account billing. */
  billing: {
    /**
     * List the active plans available to an account.
     * @param accountId - Defaults to the active account when omitted.
     */
    listPlans(accountId?: string): Promise<AccountPlan[]>;
    /**
     * Get the current subscription state (plan + status) of an account.
     * @param accountId - Defaults to the active account when omitted.
     */
    getSubscription(accountId?: string): Promise<AccountSubscription>;
    /**
     * Start a subscription checkout session for a plan, then redirect the
     * browser to the returned `url`. The account defaults to the active one.
     */
    startCheckout(params: CheckoutParams): Promise<CheckoutSession>;
    startCheckout(
      accountId: string,
      params: CheckoutParams
    ): Promise<CheckoutSession>;
  };
}
