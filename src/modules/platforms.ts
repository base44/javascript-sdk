import type { AxiosInstance } from "axios";
import type {
  DeprovisionResult,
  PlatformsModule,
  ProvisionPrincipalParams,
  ServicePrincipal,
} from "./platforms.types.js";

/** The wire shape of a principal, which is snake_case. */
interface ServiceUserResponse {
  service_external_id: string;
  user_id: string;
  email: string;
  role: string;
  created: boolean;
}

interface ServiceUserDeprovisionResponse {
  service_external_id: string;
  removed: boolean;
}

/**
 * Creates the platforms module.
 *
 * Takes the *provision* client specifically, not the mint client. The two keys
 * are separated so that no code path holding the hot-path key can create or
 * destroy principals, and passing one client here is what keeps that true.
 *
 * @param axios - An Axios instance carrying the `service_users:provision` key.
 * @returns The platforms module.
 * @internal
 */
export function createPlatformsModule(axios: AxiosInstance): PlatformsModule {
  return {
    async provisionPrincipal(
      params: ProvisionPrincipalParams
    ): Promise<ServicePrincipal> {
      const body: Record<string, unknown> = {
        service_external_id: params.externalId,
      };
      // Omitted rather than sent as null: the server applies its own defaults
      // for both, and `role` in particular is clamped to a ceiling.
      if (params.displayName !== undefined) body.display_name = params.displayName;
      if (params.role !== undefined) body.role = params.role;

      const response: ServiceUserResponse = await axios.post(
        "/api/service/users",
        body
      );
      return {
        externalId: response.service_external_id,
        userId: response.user_id,
        email: response.email,
        role: response.role,
        created: response.created,
      };
    },

    async deprovisionPrincipal(externalId: string): Promise<DeprovisionResult> {
      const response: ServiceUserDeprovisionResponse = await axios.delete(
        `/api/service/users/${encodeURIComponent(externalId)}`
      );
      return {
        externalId: response.service_external_id,
        removed: response.removed,
      };
    },
  };
}
