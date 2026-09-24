import {
  Base44PlatformClient, Base44PlatformError,
  type TokenKey, type TokenRecord, type TokenStore,
} from "@base44/sdk/platform/server";

/** Minimal setup: the default memory cache needs no configuration. */
export async function createForCustomer(apiKey: string, workspaceId: string) {
  const platform = new Base44PlatformClient({ apiKey, workspaceId });
  await platform.users.provision({ externalId: "customer_42", displayName: "Customer 42" });
  const user = platform.asUser("customer_42");
  const app = await user.apps.create({ name: "Tracker", prompt: "Build a project tracker" });
  return user.apps.deploy(app.id);
}

/** Adapt your own server-side database; methods must protect credential records. */
interface CredentialDatabase {
  read(key: string): Promise<TokenRecord | null>;
  replace(key: string, record: TokenRecord): Promise<void>;
  remove(key: string): Promise<void>;
}
export function persistentClient(apiKey: string, workspaceId: string, db: CredentialDatabase) {
  const keyOf = (key: TokenKey) => JSON.stringify([key.serverUrl, key.workspaceId, key.externalId]);
  const tokenStore: TokenStore = {
    get: key => db.read(keyOf(key)),
    set: (key, record) => db.replace(keyOf(key), record),
    delete: key => db.remove(keyOf(key)),
  };
  return new Base44PlatformClient({ apiKey, workspaceId, tokenStore });
}

/** Authenticate your own user before passing their stable external ID. */
export async function listForCustomer(platform: Base44PlatformClient, externalId: string, signal: AbortSignal) {
  try {
    return await platform.asUser(externalId).apps.list({ limit: 20, skip: 0 }, { signal });
  } catch (error) {
    if (error instanceof Base44PlatformError) console.error(error.toJSON());
    throw error;
  }
}

export async function disconnect(platform: Base44PlatformClient, externalId: string) {
  // Not offboarding: the principal remains and a later call can mint again.
  await platform.asUser(externalId).revokeToken();
}
export async function offboard(platform: Base44PlatformClient, externalId: string) {
  return platform.users.deprovision(externalId);
}
