/**
 * Mapping a Base44 user to the UUID Apple signs into their purchases.
 *
 * StoreKit accepts a UUID at purchase time (`appAccountToken`) and Apple
 * returns the same value in every resulting transaction — including renewals
 * years later. That signed round trip is the entire attribution mechanism: it
 * is the only way to know whose purchase a transaction is, without trusting
 * anything the client claims.
 *
 * The mapping is a deterministic version-5 UUID of the user id under a fixed
 * namespace, so it is a pure function. The shell, the web app and the backend
 * all derive the same UUID from the same user id with no lookup table to keep
 * in sync, and nothing to migrate.
 *
 * Two consequences worth knowing:
 *
 * - The namespace is part of the contract. Changing it orphans every purchase
 *   already attributed under the old one.
 * - The mapping is one-way in practice. Recovering a user id means deriving
 *   the UUID for a candidate user and comparing, not inverting the hash.
 *
 * @internal
 */
import { v5 as uuidv5 } from "uuid";

/**
 * The namespace every Base44 in-app purchase account token is derived under.
 *
 * A fixed, arbitrary version-4 UUID. It must never change: the native shell
 * derives the same value independently, and Apple has already signed the
 * results into transactions that will keep renewing.
 */
export const IAP_APP_ACCOUNT_TOKEN_NAMESPACE =
  "8f2b6a1e-4c5d-4e7a-9b3f-6d1a2c8e5f04";

/**
 * Derives the account token for a Base44 user id.
 *
 * @throws {TypeError} when the user id is empty.
 */
export function appAccountTokenFor(base44UserId: string): string {
  if (typeof base44UserId !== "string" || base44UserId.length === 0) {
    throw new TypeError("a Base44 user id is required to derive an account token");
  }
  return uuidv5(base44UserId, IAP_APP_ACCOUNT_TOKEN_NAMESPACE);
}
