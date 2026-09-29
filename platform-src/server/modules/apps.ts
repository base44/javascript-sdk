import { Transport, checkAbort, waitFor } from "../transport.js";
import { Tokens } from "../tokens.js";
import type { RequestOptions } from "../types.js";
import { object, identifier, requiredString, nullableString, badResponse, invalid } from "../validation.js";
import type { AppsModule, PlatformApp } from "./apps.types.js";

function projectApp(value: unknown): PlatformApp {
  const data = object(value);
  const state = data.status && typeof data.status === "object" ? object(data.status).state : undefined;
  return {
    id: requiredString(data.id), name: nullableString(data.name), slug: nullableString(data.slug),
    state: state === "ready" || state === "processing" || state === "error" ? state : "unknown",
    updatedAt: nullableString(data.updated_date), previewScreenshotUrl: nullableString(data.preview_screenshot_url),
    logoUrl: nullableString(data.logo_url), lastDeployedAt: nullableString(data.last_deployed_at),
    currentRevision: nullableString(data.last_git_commit_hash), deployedRevision: nullableString(data.last_deployed_git_commit_hash),
    hasCustomInstructions: typeof data.custom_instructions === "string" && data.custom_instructions.length > 0,
  };
}
export function createApps(transport: Transport, tokens: Tokens, id: string, workspaceId: string, buildTimeoutMs: number): AppsModule {
  async function request(path: string, method: string, body?: unknown, options: RequestOptions = {}) {
    checkAbort(options.signal);
    const token = await waitFor(tokens.get(id), options.signal);
    return transport.request(path, method, {
      Authorization: `Bearer ${token}`, "X-Active-Workspace-Id": workspaceId, "Content-Type": "application/json",
    }, body, options);
  }
  return {
    async list(input = {}, options) {
      const limit = input.limit ?? 20, skip = input.skip ?? 0;
      if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(skip) || skip < 0) invalid("limit must be positive and skip nonnegative integers.");
      const query = new URLSearchParams({ q: JSON.stringify({ app_type: { $nin: ["user_agent"] } }), sort: "-updated_date", limit: String(limit), skip: String(skip), filter_mode: "all_apps_workspace" });
      if (input.folderId !== undefined) { identifier(input.folderId); query.set("folder_id", input.folderId); }
      const data = await request(`/api/apps?${query}`, "GET", undefined, options);
      return Array.isArray(data) ? data.map(projectApp) : badResponse();
    },
    async create(input, options) {
      if (typeof input.prompt !== "string" || !input.prompt.trim()) invalid("An initial prompt is required.");
      return projectApp(await request("/api/apps", "POST", {
        name: input.name, user_description: input.prompt, organization_id: workspaceId,
        public_settings: input.publicSettings, prevent_iframe_embedding: input.preventIframeEmbedding,
        custom_instructions: input.customInstructions,
        secrets: input.secrets === undefined ? undefined : Object.fromEntries(Object.entries(input.secrets).map(([key, value]) => [key, { type: "value", value }])),
        initial_message: { content: input.prompt },
      }, { timeoutMs: buildTimeoutMs, ...options }));
    },
    async get(appId, options) { return projectApp(await request(`/api/apps/${identifier(appId)}`, "GET", undefined, options)); },
    async rename(appId, name, options) {
      if (typeof name !== "string" || !name.trim()) invalid("A nonempty app name is required.");
      return projectApp(await request(`/api/apps/${identifier(appId)}`, "PUT", { name: name.trim() }, options));
    },
    async addToFolder(folderId, appIds, options) {
      appIds.forEach(identifier);
      await request(`/api/app-folders/${identifier(folderId)}/items`, "POST", { app_ids: appIds }, options);
    },
    async getPreviewUrl(appId, options) {
      const data = object(await request(`/api/apps/${identifier(appId)}/sandbox/preview-url`, "GET", undefined, options));
      return { url: requiredString(data.preview_url), token: nullableString(data.preview_token) };
    },
    async deploy(appId, options) {
      const data = object(await request(`/api/apps/${identifier(appId)}/deploy`, "POST", {}, { timeoutMs: buildTimeoutMs, ...options }));
      return { appId: requiredString(data.app_id), checkpointId: nullableString(data.checkpoint_id), revision: requiredString(data.git_commit_hash), deployedAt: requiredString(data.deployed_at) };
    },
  };
}
