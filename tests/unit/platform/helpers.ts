import { Base44PlatformClient, type PlatformClientConfig } from "../../../platform-src/server/index.js";
export type Call = { url: URL; method: string; headers: Headers; body: unknown; init: RequestInit };
export const json = (value: unknown, status = 200) => Response.json(value, { status });
export const mint = (id: string, lifetime = 3600) => json({ access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_in: lifetime });
export const app = { id: "app1", name: "Tracker", status: { state: "ready", paywall_context: { secret: "private" } }, pages: { source: "private" }, owner_id: "private", custom_instructions: "private instructions" };
export function harness(handler: (call: Call) => Response | Promise<Response>, overrides: Partial<PlatformClientConfig> = {}) {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const raw = init.body;
    const call: Call = { url: new URL(String(input)), method: init.method ?? "GET", headers: new Headers(init.headers), body: raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw ? JSON.parse(String(raw)) : undefined, init };
    calls.push(call);
    return handler(call);
  };
  return { calls, client: new Base44PlatformClient({ apiKey: "workspace-secret", workspaceId: "workspace1", serverUrl: "https://platform.example", fetch: fetcher, ...overrides }) };
}
