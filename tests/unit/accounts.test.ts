import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";

describe("Accounts module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const ACCT = "a".repeat(24);
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("listMine GETs /accounts/me", async () => {
    const payload = { accounts: [{ id: ACCT, name: "Acme", my_role: "owner" }], active_account_id: ACCT };
    scope.get(`/api/apps/${appId}/accounts/me`).reply(200, payload);
    const res = await base44.accounts.listMine();
    expect(res).toEqual(payload);
    expect(scope.isDone()).toBe(true);
  });

  test("create POSTs the account name", async () => {
    scope.post(`/api/apps/${appId}/accounts`, { name: "Acme" }).reply(200, { id: ACCT, name: "Acme" });
    const res = await base44.accounts.create({ name: "Acme" });
    expect(res.id).toBe(ACCT);
    expect(scope.isDone()).toBe(true);
  });

  test("invite POSTs email + role and url-encodes member email on role change", async () => {
    scope.post(`/api/apps/${appId}/accounts/${ACCT}/invites`, { email: "a@b.com", role: "admin" }).reply(200, {});
    await base44.accounts.invite(ACCT, "a@b.com", "admin");
    scope.patch(`/api/apps/${appId}/accounts/${ACCT}/members/a%2Bx%40b.com/role`, { role: "member" }).reply(200, {});
    await base44.accounts.changeMemberRole(ACCT, "a+x@b.com", "member");
    expect(scope.isDone()).toBe(true);
  });

  test("billing.listPlans GETs the account plans", async () => {
    scope.get(`/api/apps/${appId}/accounts/${ACCT}/billing/plans`).reply(200, []);
    const res = await base44.accounts.billing.listPlans(ACCT);
    expect(res).toEqual([]);
    expect(scope.isDone()).toBe(true);
  });

  test("billing.listPlans without an id resolves the active account via /me", async () => {
    scope.get(`/api/apps/${appId}/accounts/me`).reply(200, { accounts: [], active_account_id: ACCT });
    scope.get(`/api/apps/${appId}/accounts/${ACCT}/billing/plans`).reply(200, []);
    const res = await base44.accounts.billing.listPlans();
    expect(res).toEqual([]);
    expect(scope.isDone()).toBe(true);
  });

  test("billing.getSubscription GETs the subscription endpoint (resolving active account)", async () => {
    const payload = {
      account_id: ACCT,
      plan_id: "p1",
      billing_status: "active",
      billing_provider: "stripe_connect",
      plan: { id: "p1", name: "Pro", price_amount: 1000, currency: "usd", interval: "month", is_active: true },
      current_period_end: "2026-07-01T00:00:00+00:00",
      cancel_at_period_end: false,
      canceled_at: null,
      started_at: "2026-06-01T00:00:00+00:00",
    };
    scope.get(`/api/apps/${appId}/accounts/me`).reply(200, { accounts: [], active_account_id: ACCT });
    scope.get(`/api/apps/${appId}/accounts/${ACCT}/billing/subscription`).reply(200, payload);
    const sub = await base44.accounts.billing.getSubscription();
    expect(sub).toEqual(payload);
    expect(scope.isDone()).toBe(true);
  });

  test("billing.getSubscription(accountId) uses the explicit id (no /me)", async () => {
    const payload = {
      account_id: ACCT, plan_id: null, billing_status: "none", billing_provider: null,
      plan: null, current_period_end: null, cancel_at_period_end: false, canceled_at: null, started_at: null,
    };
    scope.get(`/api/apps/${appId}/accounts/${ACCT}/billing/subscription`).reply(200, payload);
    const sub = await base44.accounts.billing.getSubscription(ACCT);
    expect(sub).toEqual(payload);
    expect(scope.isDone()).toBe(true);
  });

  test("billing.startCheckout(params) resolves the active account", async () => {
    const params = { plan_id: "p1", success_url: "https://x/ok", cancel_url: "https://x/no" };
    scope.get(`/api/apps/${appId}/accounts/me`).reply(200, { accounts: [], active_account_id: ACCT });
    scope.post(`/api/apps/${appId}/accounts/${ACCT}/billing/checkout`, params).reply(200, { url: "https://pay", session_id: "s1" });
    const res = await base44.accounts.billing.startCheckout(params);
    expect(res.url).toBe("https://pay");
    expect(scope.isDone()).toBe(true);
  });

  test("billing.startCheckout(accountId, params) uses the explicit id (no /me)", async () => {
    const params = { plan_id: "p1", success_url: "https://x/ok", cancel_url: "https://x/no" };
    scope.post(`/api/apps/${appId}/accounts/${ACCT}/billing/checkout`, params).reply(200, { url: "https://pay", session_id: "s1" });
    const res = await base44.accounts.billing.startCheckout(ACCT, params);
    expect(res.url).toBe("https://pay");
    expect(scope.isDone()).toBe(true);
  });

  test("listMembers without an id resolves the active account via /me", async () => {
    scope.get(`/api/apps/${appId}/accounts/me`).reply(200, { accounts: [], active_account_id: ACCT });
    scope.get(`/api/apps/${appId}/accounts/${ACCT}/members`).reply(200, []);
    const res = await base44.accounts.listMembers();
    expect(res).toEqual([]);
    expect(scope.isDone()).toBe(true);
  });

  test("resolveAccountId throws a clear error when there is no active account", async () => {
    scope.get(`/api/apps/${appId}/accounts/me`).reply(200, { accounts: [], active_account_id: null });
    await expect(base44.accounts.billing.listPlans()).rejects.toThrow(/No active account/);
    expect(scope.isDone()).toBe(true);
  });

  test("getPublicAccount GETs the public by-slug endpoint (unauthenticated)", async () => {
    const payload = { id: ACCT, name: "Acme", slug: "acme", data: { tagline: "Hi" } };
    scope.get(`/api/apps/${appId}/accounts/public/by-slug/acme`).reply(200, payload);
    const res = await base44.accounts.getPublicAccount("acme");
    expect(res).toEqual(payload);
    expect(scope.isDone()).toBe(true);
  });

  test("getPublicAccount url-encodes the slug", async () => {
    scope.get(`/api/apps/${appId}/accounts/public/by-slug/a%2Fb`).reply(200, { id: ACCT, name: "x", slug: "a-b", data: {} });
    await base44.accounts.getPublicAccount("a/b");
    expect(scope.isDone()).toBe(true);
  });

  test("joinAccount POSTs to the by-slug join endpoint", async () => {
    scope.post(`/api/apps/${appId}/accounts/by-slug/acme/join`, {}).reply(200, { id: "m1", account_id: ACCT, email: "a@b.com", role: "member", status: "active" });
    const res = await base44.accounts.joinAccount("acme");
    expect(res.status).toBe("active");
    expect(scope.isDone()).toBe(true);
  });

  // The active-account behavior (getActiveAccountId + the per-request
  // X-Active-Account-Id header) is browser-only — `getStoredActiveAccountId`
  // is gated on a module-load `typeof window` check, so it is exercised in the
  // browser/app context, not this node-environment test suite.
  test("getActiveAccountId returns undefined outside a browser", () => {
    expect(base44.accounts.getActiveAccountId()).toBeUndefined();
  });

  test("setActiveAccount does not throw outside a browser (no reload)", () => {
    expect(() => base44.accounts.setActiveAccount(ACCT)).not.toThrow();
  });
});
