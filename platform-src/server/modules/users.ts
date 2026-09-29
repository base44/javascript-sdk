import type { UsersModule } from "./users.types.js";
import { Transport } from "../transport.js";
import { Tokens } from "../tokens.js";
import { Base44PlatformError } from "../errors.js";
import { externalId, object, requiredString, boolean, badResponse } from "../validation.js";

export function createUsers(transport: Transport, tokens: Tokens, apiKey: string): UsersModule {
  const headers = { Authorization: apiKey, "Content-Type": "application/json" };
  return {
    async provision(input, options) {
      const id = externalId(input.externalId);
      return tokens.exclusive(id, async () => {
        const data = object(await transport.request("/api/service/users", "POST", headers, {
          service_external_id: id, display_name: input.displayName,
        }, options));
        const email = requiredString(data.email);
        const domain = email.split("@")[1]?.toLowerCase();
        if (!domain || !(domain === "svc.base44.invalid" || domain.endsWith(".svc.base44.invalid"))) return badResponse();
        return {
          externalId: requiredString(data.service_external_id), userId: requiredString(data.user_id),
          email, role: requiredString(data.role), created: boolean(data.created),
        };
      });
    },
    async deprovision(value, options) {
      const id = externalId(value);
      return tokens.exclusive(id, async () => {
        let removed: boolean;
        try {
          const data = object(await transport.request(`/api/service/users/${encodeURIComponent(id)}`, "DELETE", headers, undefined, options));
          removed = boolean(data.removed);
        } catch (error) {
          if (!(error instanceof Base44PlatformError) || error.status !== 404) throw error;
          removed = false;
        }
        await tokens.remove(id);
        return { removed };
      });
    },
  };
}
