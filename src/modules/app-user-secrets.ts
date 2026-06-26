import type { AxiosInstance } from "axios";

import type {
  AppUserSecretsModule,
  AppUserSecretStatus,
} from "./app-user-secrets.types.js";

const SECRET_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function assertSecretKey(key: string): void {
  if (typeof key !== "string" || !SECRET_KEY_PATTERN.test(key)) {
    throw new Error(
      "Secret key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores"
    );
  }
}

export function createAppUserSecretsModule(
  userAxios: AxiosInstance,
  readAxios: AxiosInstance,
  appId: string,
  serviceToken?: string
): AppUserSecretsModule {
  const basePath = `/apps/${appId}/app-user-secrets`;

  return {
    async list(): Promise<AppUserSecretStatus[]> {
      return await userAxios.get(basePath);
    },

    async set(key: string, value: string): Promise<void> {
      assertSecretKey(key);
      if (typeof value !== "string" || value.length === 0) {
        throw new Error("Secret value is required and must be a non-empty string");
      }
      await userAxios.put(`${basePath}/${key}`, { value });
    },

    async consent(key: string): Promise<void> {
      assertSecretKey(key);
      await userAxios.post(`${basePath}/${key}/consent`);
    },

    async delete(key: string): Promise<void> {
      assertSecretKey(key);
      await userAxios.delete(`${basePath}/${key}`);
    },

    async get(key: string): Promise<string> {
      assertSecretKey(key);
      if (!serviceToken) {
        throw new Error(
          "App user secrets can only be read from a Base44 backend function created with createClientFromRequest(request)"
        );
      }
      const response = await readAxios.get<{ value: string }>(
        `${basePath}/${key}/value`
      );
      const data = response as unknown as { value: string };
      return data.value;
    },
  };
}
