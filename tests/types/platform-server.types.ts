import type { Base44PlatformClient, PlatformApp, TokenStore } from "@base44/sdk/platform/server";

function contracts(client: Base44PlatformClient) {
  // @ts-expect-error App operations require a user identity.
  client.apps.get("app");
  // @ts-expect-error Chat belongs to a later SDK phase.
  client.asUser("u").apps.sendMessage("app", "hello");
  // @ts-expect-error External IDs are required.
  client.asUser();
  // @ts-expect-error A second key is not part of the constructor.
  new (client.constructor as typeof Base44PlatformClient)({ apiKey: "key", workspaceId: "w", provisionApiKey: "other" });
  const app: Promise<PlatformApp> = client.asUser("u").apps.get("app");
  return app;
}
function storage(store: TokenStore) {
  // @ts-expect-error The storage key must include platform and workspace.
  return store.get({ externalId: "u" });
}
void contracts;
void storage;
