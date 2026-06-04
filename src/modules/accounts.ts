import { AxiosInstance } from "axios";

import {
  getStoredActiveAccountId,
  setStoredActiveAccountId,
} from "../utils/common.js";
import type {
  Account,
  AccountMembership,
  AccountPlan,
  AccountsModule,
  AccountSubscription,
  AssignableAccountRole,
  CheckoutParams,
  CheckoutSession,
  MyAccountsResponse,
} from "./accounts.types.js";

/**
 * Creates the accounts module (multi-tenancy) for the Base44 SDK.
 *
 * @param axios - Axios instance (responses are unwrapped to data).
 * @param appId - Application ID.
 * @returns The accounts module.
 * @internal
 */
export function createAccountsModule(
  axios: AxiosInstance,
  appId: string
): AccountsModule {
  const base = `/apps/${appId}/accounts`;
  const enc = encodeURIComponent;

  // Resolve the account id to operate on: an explicit id wins, then the
  // explicitly-stored client selection, then the server-resolved default
  // (the sole-account case). Throws a clear error when none can be found so
  // callers never silently send `/accounts/undefined/...` (which 404s as
  // "Account not found").
  const resolveAccountId = async (provided?: string | null): Promise<string> => {
    if (provided) return provided;
    const stored = getStoredActiveAccountId(appId);
    if (stored) return stored;
    const mine: MyAccountsResponse = await axios.get(`${base}/me`);
    if (mine.active_account_id) return mine.active_account_id;
    throw new Error(
      "No active account: pass an accountId, or have the user select or create an account first."
    );
  };

  return {
    getActiveAccountId(): string | undefined {
      return getStoredActiveAccountId(appId);
    },

    switchAccount(accountId: string): void {
      setStoredActiveAccountId(appId, accountId);
      if (typeof window === "undefined") return;
      window.location.reload();
    },

    clearActiveAccount(): void {
      setStoredActiveAccountId(appId, null);
    },

    async listMine(): Promise<MyAccountsResponse> {
      return axios.get(`${base}/me`);
    },

    async create(params: {
      name: string;
      data?: Record<string, unknown>;
    }): Promise<Account> {
      return axios.post(base, params);
    },

    async update(
      accountId: string,
      params: { name?: string; data?: Record<string, unknown> }
    ): Promise<Account> {
      return axios.patch(`${base}/${accountId}`, params);
    },

    async listMembers(accountId?: string): Promise<AccountMembership[]> {
      const id = await resolveAccountId(accountId);
      return axios.get(`${base}/${id}/members`);
    },

    async invite(
      accountId: string,
      email: string,
      role: AssignableAccountRole = "member"
    ): Promise<AccountMembership> {
      return axios.post(`${base}/${accountId}/invites`, { email, role });
    },

    async acceptInvite(accountId: string): Promise<AccountMembership> {
      return axios.post(`${base}/${accountId}/accept`, {});
    },

    async changeMemberRole(
      accountId: string,
      email: string,
      role: AssignableAccountRole
    ): Promise<AccountMembership> {
      return axios.patch(`${base}/${accountId}/members/${enc(email)}/role`, {
        role,
      });
    },

    async removeMember(
      accountId: string,
      email: string
    ): Promise<{ removed: boolean }> {
      return axios.delete(`${base}/${accountId}/members/${enc(email)}`);
    },

    async transferOwnership(
      accountId: string,
      email: string
    ): Promise<{ transferred: boolean }> {
      return axios.post(`${base}/${accountId}/transfer-ownership`, { email });
    },

    billing: {
      async listPlans(accountId?: string): Promise<AccountPlan[]> {
        const id = await resolveAccountId(accountId);
        return axios.get(`${base}/${id}/billing/plans`);
      },

      async getSubscription(accountId?: string): Promise<AccountSubscription> {
        const id = await resolveAccountId(accountId);
        return axios.get(`${base}/${id}/billing/subscription`);
      },

      async startCheckout(
        accountIdOrParams: string | CheckoutParams,
        maybeParams?: CheckoutParams
      ): Promise<CheckoutSession> {
        const explicitId =
          typeof accountIdOrParams === "string" ? accountIdOrParams : undefined;
        const params =
          typeof accountIdOrParams === "string"
            ? maybeParams
            : accountIdOrParams;
        const id = await resolveAccountId(explicitId);
        return axios.post(`${base}/${id}/billing/checkout`, params);
      },
    },
  };
}
