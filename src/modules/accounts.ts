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
  AssignableAccountRole,
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

    async listMembers(accountId: string): Promise<AccountMembership[]> {
      return axios.get(`${base}/${accountId}/members`);
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
      async listPlans(accountId: string): Promise<AccountPlan[]> {
        return axios.get(`${base}/${accountId}/billing/plans`);
      },

      async startCheckout(
        accountId: string,
        params: { plan_id: string; success_url: string; cancel_url: string }
      ): Promise<CheckoutSession> {
        return axios.post(`${base}/${accountId}/billing/checkout`, params);
      },
    },
  };
}
