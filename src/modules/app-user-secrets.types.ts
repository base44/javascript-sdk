export interface AppUserSecretStatus {
  id: string;
  key: string;
  label: string;
  description: string;
  allowed_backend_functions: string[];
  version: number;
  is_active: boolean;
  configured: boolean;
  requires_reentry: boolean;
}

export interface AppUserSecretsModule {
  /** Lists the secret definitions available to the current app user. */
  list(): Promise<AppUserSecretStatus[]>;

  /** Stores or replaces the current app user's value for a declared secret. */
  set(key: string, value: string): Promise<void>;

  /** Deletes the current app user's value for a declared secret. */
  delete(key: string): Promise<void>;

  /**
   * Reads the current app user's secret value.
   *
   * Available only in a user-authenticated Base44 backend-function invocation
   * created with `createClientFromRequest(request)`.
   */
  get(key: string): Promise<string>;
}
