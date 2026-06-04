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

  // The active-account behavior (getActiveAccountId + the per-request
  // X-Active-Account-Id header) is browser-only — `getStoredActiveAccountId`
  // is gated on a module-load `typeof window` check, so it is exercised in the
  // browser/app context, not this node-environment test suite.
  test("getActiveAccountId returns undefined outside a browser", () => {
    expect(base44.accounts.getActiveAccountId()).toBeUndefined();
  });
});
