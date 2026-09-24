import { http, HttpResponse } from "msw";
import { recordRequest } from "./state";

const idTokens = new Map<string, Map<string, string>>();
const accessTokens = new Map<string, Map<string, string>>();

// These legacy SDK routes were not found in apper d9ae151. Keep their
// compatibility behavior centralized and explicitly avoid claiming fidelity.

function appTokens(store: Map<string, Map<string, string>>, appId: string) {
  let tokens = store.get(appId);
  if (!tokens) {
    tokens = new Map();
    store.set(appId, tokens);
  }
  return tokens;
}

export function ssoFixturesFor(appId: string) {
  return {
    tokens(userId: string, value: { idToken?: string; accessToken?: string }) {
      if (value.idToken !== undefined)
        appTokens(idTokens, appId).set(userId, value.idToken);
      if (value.accessToken !== undefined)
        appTokens(accessTokens, appId).set(userId, value.accessToken);
    },
  };
}

export function resetSsoState() {
  idTokens.clear();
  accessTokens.clear();
}

function tokenHandler(kind: "id" | "access") {
  return async ({
    params,
    request,
  }: {
    params: Record<string, string | readonly string[] | undefined>;
    request: Request;
  }) => {
    await recordRequest(
      kind === "id" ? "sso.getIdToken" : "sso.getAccessToken",
      request,
    );
    const token = (kind === "id" ? idTokens : accessTokens)
      .get(String(params.appId))
      ?.get(String(params.userId));
    return token === undefined
      ? HttpResponse.json(
          {
            detail: `No ${kind === "id" ? "ID" : "access"} token stored`,
            code: "NOT_FOUND",
          },
          { status: 404 },
        )
      : HttpResponse.json(token);
  };
}

export const ssoHandlers = [
  http.get("*/api/apps/:appId/auth/sso/idtoken/:userId", tokenHandler("id")),
  http.get(
    "*/api/apps/:appId/auth/sso/accesstoken/:userId",
    tokenHandler("access"),
  ),
];
