import { Base44Error } from "../utils/axios-client.js";
import type { DynamicAgentsModuleConfig } from "./dynamic-agents.types.js";

/**
 * Resolves the AI Gateway connection from a client config.
 * @internal
 */
export function resolveConnection(config: DynamicAgentsModuleConfig): {
  baseURL: string;
  apiKey: string;
} {
  const { serverUrl, getToken } = config;
  // No appId in the path: the gateway resolves the app by request Host.
  return {
    baseURL: `${serverUrl}/api/ai/unified/v1`,
    apiKey: getToken() ?? "",
  };
}

/**
 * Creates the gateway transport. Owns the single HTTP call to the OpenAI-compatible
 * `/chat/completions` endpoint. Shaped so a streaming `.stream()` method can be added
 * later without changing callers of `.complete()`.
 * @internal
 */
export function createGatewayTransport(config: DynamicAgentsModuleConfig) {
  return {
    async complete(
      body: Record<string, unknown>,
      opts: { signal?: AbortSignal } = {}
    ): Promise<any> {
      const { baseURL, apiKey } = resolveConnection(config);
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const err = (json && json.error) || {};
        throw new Base44Error(
          err.message || `AI Gateway request failed with status ${res.status}`,
          res.status,
          err.code || err.type || "ai_gateway_error",
          json,
          null
        );
      }
      return json;
    },
  };
}
