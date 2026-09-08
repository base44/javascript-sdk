import { delay, http, HttpResponse } from "msw";
import { recordRequest, state, type PlatformFault } from "./state";

type User = Record<string, any> & { id: string };
type MeOutcome =
  | { kind: "user"; user: User; delayMs?: number }
  | { kind: "unauthorized"; delayMs?: number }
  | { kind: "network-error"; delayMs?: number };

interface LoginAccount {
  email: string;
  password: string;
  accessToken: string;
  user: User;
  countryCode?: string;
}

let currentUser: User | null = null;
let meOutcomes: MeOutcome[] = [];
let loginAccounts: LoginAccount[] = [];
let rejectedUpdates = 0;
let invalidLogins = new Set<string>();
let unavailableLogins = new Set<string>();

export function resetAuthState() {
  currentUser = null;
  meOutcomes = [];
  loginAccounts = [];
  rejectedUpdates = 0;
  invalidLogins = new Set();
  unavailableLogins = new Set();
}

export const authFixtures = {
  user(user: User) {
    currentUser = structuredClone(user);
  },
  meSequence(outcomes: ({ user: User } | { unauthorized: true } | { networkError: true })[], delayMs = 0) {
    meOutcomes = outcomes.map((outcome) => {
      if ("user" in outcome)
        return { kind: "user", user: structuredClone(outcome.user), delayMs };
      if ("unauthorized" in outcome)
        return { kind: "unauthorized", delayMs };
      return { kind: "network-error", delayMs };
    });
  },
  login(account: LoginAccount) {
    loginAccounts.push(structuredClone(account));
  },
};

export const authFaultFixtures = {
  unauthorizedMe() {
    meOutcomes.push({ kind: "unauthorized" });
  },
  networkUnavailableMe() {
    meOutcomes.push({ kind: "network-error" });
  },
  rejectedUpdate() {
    rejectedUpdates += 1;
  },
  invalidCredentials(email: string) {
    invalidLogins.add(email);
  },
  networkUnavailableLogin(email: string) {
    unavailableLogins.add(email);
  },
};

function takeFault(predicate: (fault: PlatformFault) => boolean) {
  const index = state.faults.findIndex(predicate);
  if (index < 0) return false;
  state.faults.splice(index, 1);
  return true;
}

export const authHandlers = [
  http.get(
    "*/api/apps/:appId/entities/User/me",
    async ({ request }) => {
      await recordRequest("auth.me", request);
      const outcome = meOutcomes.shift();
      if (outcome?.delayMs) await delay(outcome.delayMs);
      if (outcome?.kind === "network-error") return HttpResponse.error();
      if (outcome?.kind === "unauthorized" || (!outcome && !currentUser))
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      const user = outcome?.kind === "user" ? outcome.user : currentUser!;
      currentUser = structuredClone(user);
      return HttpResponse.json(user);
    },
  ),
  http.put(
    "*/api/apps/:appId/entities/User/me",
    async ({ request }) => {
      await recordRequest("auth.updateMe", request);
      if (rejectedUpdates > 0) {
        rejectedUpdates -= 1;
        return HttpResponse.json(
          { detail: "Invalid email format" },
          { status: 400 },
        );
      }
      const updates = (await request.clone().json()) as Record<string, any>;
      currentUser = { ...(currentUser ?? { id: "user-1" }), ...updates } as User;
      return HttpResponse.json(currentUser);
    },
  ),
  http.post(
    "*/api/apps/:appId/auth/login",
    async ({ request }) => {
      await recordRequest("auth.login", request);
      const body = (await request.clone().json()) as {
        email: string;
        password: string;
      };
      if (unavailableLogins.delete(body.email)) return HttpResponse.error();
      if (invalidLogins.delete(body.email))
        return HttpResponse.json(
          { detail: "Invalid credentials" },
          { status: 400 },
        );
      const account = loginAccounts.find(
        (candidate) =>
          candidate.email === body.email && candidate.password === body.password,
      );
      if (!account)
        return HttpResponse.json(
          { detail: "Invalid credentials" },
          { status: 400 },
        );
      currentUser = structuredClone(account.user);
      return HttpResponse.json({
        access_token: account.accessToken,
        country_code: account.countryCode ?? null,
        success: true,
        user: account.user,
      });
    },
  ),
  http.post(
    "*/api/apps/:appId/auth/register",
    async ({ request }) => {
      await recordRequest("auth.register", request);
      const body = (await request.clone().json()) as { email: string };
      if (
        takeFault(
          (fault) =>
            fault.kind === "auth-registration-rejected" &&
            fault.email === body.email,
        )
      ) {
        return HttpResponse.json(
          { detail: "Registration rejected" },
          { status: 400 },
        );
      }
      const registration = state.registrations.get(body.email);
      if (!registration)
        return HttpResponse.json(
          { detail: "Registration fixture not found" },
          { status: 404 },
        );
      return HttpResponse.json({
        id: registration.id,
        message: registration.message,
        otp_expires_in_minutes: registration.otpExpiresInMinutes,
        country_code: registration.countryCode,
      });
    },
  ),
  http.post(
    "*/api/apps/:appId/auth/reset-password-request",
    async ({ request }) => {
      await recordRequest("auth.resetPasswordRequest", request);
      const body = (await request.clone().json()) as { email: string };
      return HttpResponse.json({
        message:
          state.passwordResetRequestMessages.get(body.email) ??
          "Request accepted",
      });
    },
  ),
  http.post(
    "*/api/apps/:appId/auth/reset-password",
    async ({ request }) => {
      await recordRequest("auth.resetPassword", request);
      const body = (await request.clone().json()) as { reset_token: string };
      if (
        takeFault(
          (fault) =>
            fault.kind === "auth-reset-token-expired" &&
            fault.resetToken === body.reset_token,
        )
      ) {
        return HttpResponse.json(
          { detail: "Reset token expired" },
          { status: 400 },
        );
      }
      const user = state.passwordResetUsers.get(body.reset_token);
      return user
        ? HttpResponse.json(structuredClone(user))
        : HttpResponse.json(
            { detail: "Reset token invalid" },
            { status: 400 },
          );
    },
  ),
];
