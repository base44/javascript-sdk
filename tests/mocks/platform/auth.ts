import { delay, http, HttpResponse } from "msw";
import { recordRequest, state, type PlatformFault } from "./state";

export type User = Record<string, any> & { id: string; email?: string };

export interface LoginAccount {
  email: string;
  password: string;
  accessToken: string;
  user: User;
  countryCode?: string;
}

interface Principal {
  appId: string;
  user: User;
  kind: "user" | "service";
}
interface ResetToken {
  email: string;
  expired: boolean;
  consumed: boolean;
}

const accounts = new Map<string, Map<string, LoginAccount>>();
const principals = new Map<string, Principal>();
const resetTokens = new Map<string, Map<string, ResetToken>>();
const meLatencies = new Map<string, number>();
let rejectedUpdates = new Map<string, number>();
let invalidLogins = new Set<string>();
let unavailableLogins = new Set<string>();
let unavailableMe = new Set<string>();

const scoped = (appId: string, value: string) => `${appId}\u0000${value}`;

function accountStore(appId: string) {
  let appAccounts = accounts.get(appId);
  if (!appAccounts) {
    appAccounts = new Map();
    accounts.set(appId, appAccounts);
  }
  return appAccounts;
}

function resetTokenStore(appId: string) {
  let appTokens = resetTokens.get(appId);
  if (!appTokens) {
    appTokens = new Map();
    resetTokens.set(appId, appTokens);
  }
  return appTokens;
}

function bearerToken(request: Request, headerName = "authorization") {
  const authorization = request.headers.get(headerName);
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
}

export function principalFor(
  appId: string,
  request: Request,
  headerName = "authorization",
) {
  const token = bearerToken(request, headerName);
  if (!token) return undefined;
  const principal = principals.get(token);
  return principal?.appId === appId ? { token, principal } : undefined;
}

function unauthorized() {
  return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
}

export function resetAuthState() {
  accounts.clear();
  principals.clear();
  resetTokens.clear();
  meLatencies.clear();
  rejectedUpdates = new Map();
  invalidLogins = new Set();
  unavailableLogins = new Set();
  unavailableMe = new Set();
}

export function authFixturesFor(appId: string) {
  return {
    account(account: LoginAccount) {
      const stored = structuredClone(account);
      accountStore(appId).set(account.email, stored);
      principals.set(account.accessToken, {
        appId,
        user: stored.user,
        kind: "user",
      });
    },
    principal(token: string, user: User) {
      const stored = structuredClone(user);
      principals.set(token, { appId, user: stored, kind: "user" });
    },
    servicePrincipal(token: string, user: User) {
      const stored = structuredClone(user);
      principals.set(token, { appId, user: stored, kind: "service" });
    },
    meLatency(token: string, delayMs: number) {
      meLatencies.set(scoped(appId, token), delayMs);
    },
    resetToken(
      resetToken: string,
      email: string,
      options: { expired?: boolean } = {},
    ) {
      resetTokenStore(appId).set(resetToken, {
        email,
        expired: options.expired ?? false,
        consumed: false,
      });
    },
  };
}

export function authFaultFixturesFor(appId: string) {
  return {
    networkUnavailableMe(token: string) {
      unavailableMe.add(scoped(appId, token));
    },
    rejectedUpdate(token: string) {
      const key = scoped(appId, token);
      rejectedUpdates.set(key, (rejectedUpdates.get(key) ?? 0) + 1);
    },
    invalidCredentials(email: string) {
      invalidLogins.add(scoped(appId, email));
    },
    networkUnavailableLogin(email: string) {
      unavailableLogins.add(scoped(appId, email));
    },
    resetTokenExpired(resetToken: string) {
      resetTokenStore(appId).set(resetToken, {
        email: "",
        expired: true,
        consumed: false,
      });
    },
  };
}

function takeFault(predicate: (fault: PlatformFault) => boolean) {
  const index = state.faults.findIndex(predicate);
  if (index < 0) return false;
  state.faults.splice(index, 1);
  return true;
}

export const authHandlers = [
  http.get(
    "*/api/apps/:appId/entities/User/me",
    async ({ params, request }) => {
      await recordRequest("auth.me", request);
      const appId = String(params.appId);
      const resolved = principalFor(appId, request);
      if (!resolved) return unauthorized();
      const key = scoped(appId, resolved.token);
      const delayMs = meLatencies.get(key);
      if (delayMs) await delay(delayMs);
      if (unavailableMe.delete(key)) return HttpResponse.error();
      return HttpResponse.json(structuredClone(resolved.principal.user));
    },
  ),
  http.put(
    "*/api/apps/:appId/entities/User/me",
    async ({ params, request }) => {
      await recordRequest("auth.updateMe", request);
      const appId = String(params.appId);
      const resolved = principalFor(appId, request);
      if (!resolved) return unauthorized();
      const key = scoped(appId, resolved.token);
      if ((rejectedUpdates.get(key) ?? 0) > 0) {
        rejectedUpdates.set(key, rejectedUpdates.get(key)! - 1);
        return HttpResponse.json(
          { detail: "Invalid email format" },
          { status: 400 },
        );
      }
      const updates = (await request.clone().json()) as Record<string, any>;
      Object.assign(resolved.principal.user, updates);
      return HttpResponse.json(structuredClone(resolved.principal.user));
    },
  ),
  http.post("*/api/apps/:appId/auth/login", async ({ params, request }) => {
    await recordRequest("auth.login", request);
    const appId = String(params.appId);
    const body = (await request.clone().json()) as {
      email: string;
      password: string;
    };
    const key = scoped(appId, body.email);
    if (unavailableLogins.delete(key)) return HttpResponse.error();
    if (invalidLogins.delete(key))
      return HttpResponse.json(
        { detail: "Invalid credentials" },
        { status: 400 },
      );
    const account = accountStore(appId).get(body.email);
    if (!account || account.password !== body.password)
      return HttpResponse.json(
        { detail: "Invalid credentials" },
        { status: 400 },
      );
    principals.set(account.accessToken, {
      appId,
      user: account.user,
      kind: "user",
    });
    return HttpResponse.json({
      access_token: account.accessToken,
      country_code: account.countryCode ?? null,
      success: true,
      user: structuredClone(account.user),
    });
  }),
  http.post("*/api/apps/:appId/auth/register", async ({ params, request }) => {
    await recordRequest("auth.register", request);
    const appId = String(params.appId);
    const body = (await request.clone().json()) as { email: string };
    if (
      takeFault(
        (fault) =>
          fault.kind === "auth-registration-rejected" &&
          fault.appId === appId &&
          fault.email === body.email,
      )
    )
      return HttpResponse.json(
        { detail: "Registration rejected" },
        { status: 400 },
      );
    const registration = state.registrations.get(scoped(appId, body.email));
    if (!registration)
      return HttpResponse.json(
        { detail: "Registration fixture not found" },
        { status: 404 },
      );
    return HttpResponse.json({
      id: registration.userId,
      message: "Verification required",
      otp_expires_in_minutes: registration.otpTtlMinutes,
      country_code: registration.countryCode,
    });
  }),
  http.post(
    "*/api/apps/:appId/auth/reset-password-request",
    async ({ request }) => {
      await recordRequest("auth.resetPasswordRequest", request);
      await request.clone().json();
      return HttpResponse.json({ message: "Request accepted" });
    },
  ),
  http.post(
    "*/api/apps/:appId/auth/reset-password",
    async ({ params, request }) => {
      await recordRequest("auth.resetPassword", request);
      const appId = String(params.appId);
      const body = (await request.clone().json()) as {
        reset_token: string;
        new_password: string;
      };
      const resetToken = resetTokenStore(appId).get(body.reset_token);
      if (!resetToken || resetToken.expired || resetToken.consumed)
        return HttpResponse.json(
          {
            detail: resetToken?.expired
              ? "Reset token expired"
              : "Reset token invalid",
          },
          { status: 400 },
        );
      const account = accountStore(appId).get(resetToken.email);
      if (!account)
        return HttpResponse.json(
          { detail: "Reset token invalid" },
          { status: 400 },
        );
      account.password = body.new_password;
      resetToken.consumed = true;
      return HttpResponse.json(structuredClone(account.user));
    },
  ),
];
