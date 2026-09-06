/**
 * Reading purchase state back.
 *
 * Everything here derives from stored signed tokens against the clock, so a
 * read is always current without anything having to keep a status column up to
 * date.
 *
 * Two deliberate asymmetries:
 *
 * - **`hasActiveSubscription` never throws.** It is the one call a feature gate
 *   makes, and a gate that throws is a gate that fails open somewhere. Any
 *   failure answers "not entitled" and is reported.
 * - **Everything else does throw.** A caller reading a customer's history wants
 *   to know the read failed, rather than being handed a plausible-looking empty
 *   list.
 *
 * A stored token that no longer verifies denies **that row** and does not fail
 * the call, so one bad row cannot lock a customer out of everything they own.
 *
 * @internal
 */
import type { ResolvedIapConfig } from "../config.js";
import type { Clock } from "../runtime/clock.js";
import type { IapStore } from "../store/store.types.js";
import {
  CONSUMPTION_DESCRIPTOR,
  SUBSCRIPTION_DESCRIPTOR,
  TRANSACTION_DESCRIPTOR,
} from "../store/descriptors.js";
import type {
  IapConsumptionRequestRecord,
  IapSubscriptionRecord,
  IapTransactionRecord,
} from "../store/rows.types.js";
import type { Verifier } from "../verify/verifier.js";
import type {
  DecodedRenewalInfo,
  DecodedTransaction,
} from "../verify/verify.types.js";
import {
  deriveSubscriptionState,
  environmentCounts,
  statusDisagrees,
} from "./derive.js";
import type {
  EntitlementQuery,
  Entitlements,
  SubscriptionQuery,
  SubscriptionState,
  TransactionQuery,
} from "./read.types.js";

/** How many decoded tokens to remember. */
const VERDICT_CACHE_LIMIT = 200;

/** What the read layer needs. */
export interface ReadContext {
  readonly store: IapStore;
  readonly verifier: Verifier;
  readonly config: ResolvedIapConfig;
  readonly clock: Clock;
  /** Called when a read fails or a stored token no longer verifies. */
  readonly report?: (what: string, error: unknown) => void;
}

/** The read surface. */
export interface Reader {
  getSubscriptionState(
    appUserId: string,
    query?: SubscriptionQuery
  ): Promise<SubscriptionState[]>;
  hasActiveSubscription(appUserId: string, query?: EntitlementQuery): Promise<boolean>;
  getEntitlements(appUserId: string): Promise<Entitlements>;
  getPurchase(transactionId: string): Promise<IapTransactionRecord | null>;
  listTransactions(
    appUserId: string,
    query?: TransactionQuery
  ): Promise<IapTransactionRecord[]>;
  listRefunds(appUserId: string): Promise<IapTransactionRecord[]>;
  listPendingConsumptionRequests(): Promise<IapConsumptionRequestRecord[]>;
}

export function createReader(context: ReadContext): Reader {
  /**
   * Decoded tokens, keyed by the token itself.
   *
   * Safe to cache because with offline certificate checks a verdict is a pure
   * function of the bytes: the same token always decodes the same way, and
   * validity is evaluated at the payload's own `signedDate` rather than now.
   *
   * Only *verdicts* are cached, never rows. A cached row would make a
   * subscription that has since been refunded still look live.
   */
  const verdicts = new Map<string, unknown>();

  function remember(token: string, value: unknown): void {
    if (verdicts.size >= VERDICT_CACHE_LIMIT) {
      const oldest = verdicts.keys().next().value;
      if (oldest !== undefined) verdicts.delete(oldest);
    }
    verdicts.set(token, value);
  }

  async function decodeTransaction(
    token: string | null
  ): Promise<DecodedTransaction | undefined> {
    if (!token) return undefined;
    const cached = verdicts.get(token);
    if (cached !== undefined) return cached as DecodedTransaction | undefined;
    try {
      const decoded = await context.verifier.verifyTransaction(token);
      remember(token, decoded);
      return decoded;
    } catch (error) {
      // Deny this row, keep the call. A token that will not verify is not
      // evidence of anything, but it is also not a reason to hide the rest of
      // what the customer owns.
      context.report?.("stored transaction token failed to verify", error);
      remember(token, undefined);
      return undefined;
    }
  }

  async function decodeRenewal(
    token: string | null
  ): Promise<DecodedRenewalInfo | undefined> {
    if (!token) return undefined;
    const cached = verdicts.get(token);
    if (cached !== undefined) return cached as DecodedRenewalInfo | undefined;
    try {
      const decoded = await context.verifier.verifyRenewalInfo(token);
      remember(token, decoded);
      return decoded;
    } catch (error) {
      context.report?.("stored renewal token failed to verify", error);
      remember(token, undefined);
      return undefined;
    }
  }

  async function stateFor(
    row: IapSubscriptionRecord,
    now: number
  ): Promise<SubscriptionState> {
    const [transaction, renewal] = await Promise.all([
      decodeTransaction(row.latestTransactionJws),
      decodeRenewal(row.latestRenewalInfoJws),
    ]);

    const state = deriveSubscriptionState({
      originalTransactionId: row.originalTransactionId,
      transaction,
      renewal,
      environment: row.environment,
      appleStatus: row.appleStatus,
      now,
    });

    if (statusDisagrees(state.status, row.appleStatus)) {
      // Not an error: Apple's code was true when it was sent and this is
      // derived from now. Worth surfacing, because a persistent disagreement
      // means stored data is stale.
      context.report?.(
        `derived status ${state.status} disagrees with Apple's ${row.appleStatus} ` +
          `for subscription ${row.originalTransactionId}`,
        undefined
      );
    }

    return state;
  }

  async function getSubscriptionState(
    appUserId: string,
    query: SubscriptionQuery = {}
  ): Promise<SubscriptionState[]> {
    const filter: Record<string, unknown> = { appUserId };
    if (query.subscriptionGroupId) {
      filter.subscriptionGroupIdentifier = query.subscriptionGroupId;
    }
    if (query.productId) filter.productId = query.productId;

    const page = await context.store.query(SUBSCRIPTION_DESCRIPTOR, filter, {
      limit: 200,
    });

    const now = context.clock();
    const states = await Promise.all(page.rows.map((row) => stateFor(row, now)));

    // A customer can hold several: one they bought, one shared with them by a
    // family member, one per subscription group.
    return states.filter((state) =>
      environmentCounts(state.environment, context.config)
    );
  }

  async function hasActiveSubscription(
    appUserId: string,
    query: EntitlementQuery = {}
  ): Promise<boolean> {
    try {
      if (!appUserId) return false;

      const states = await getSubscriptionState(appUserId, {
        subscriptionGroupId: query.subscriptionGroupId,
      });

      const wanted = query.productIds;
      return states.some((state) => {
        if (!state.entitled) return false;
        if (!wanted || wanted.length === 0) return true;
        return state.productId !== null && wanted.includes(state.productId);
      });
    } catch (error) {
      // Deny by default, and say so. An app whose entities were never created
      // looks exactly like an app with no paying customers, so a silent false
      // here would hide a setup mistake indefinitely.
      context.report?.("hasActiveSubscription failed, denying access", error);
      return false;
    }
  }

  async function getEntitlements(appUserId: string): Promise<Entitlements> {
    const now = context.clock();

    const [nonConsumablePage, nonRenewingPage, subscriptions] = await Promise.all([
      // Consumables are deliberately never queried: once used up they are the
      // app's business, and Apple's own entitlements list omits them too.
      context.store.query(
        TRANSACTION_DESCRIPTOR,
        { appUserId, type: "Non-Consumable", revocationDate: null },
        { limit: 500 }
      ),
      context.store.query(
        TRANSACTION_DESCRIPTOR,
        { appUserId, type: "Non-Renewing Subscription", revocationDate: null },
        { limit: 500 }
      ),
      getSubscriptionState(appUserId),
    ]);

    return {
      nonConsumables: nonConsumablePage.rows
        .filter((row) => environmentCounts(row.environment, context.config))
        .map((row) => ({
          productId: row.productId,
          transactionId: row.transactionId,
          originalTransactionId: row.originalTransactionId,
          purchaseDate: row.purchaseDate,
          isFamilyShared: row.inAppOwnershipType === "FAMILY_SHARED",
        })),

      nonRenewingSubscriptions: nonRenewingPage.rows
        .filter((row) => environmentCounts(row.environment, context.config))
        .map((row) => ({
          productId: row.productId,
          transactionId: row.transactionId,
          purchaseDate: row.purchaseDate,
          // Apple never expires these, so the configured duration is the only
          // thing that decides.
          expiresAt: row.appDefinedExpiresDate,
          active:
            row.appDefinedExpiresDate === null
              ? true
              : row.appDefinedExpiresDate > now,
        })),

      subscriptions,
      asOf: now,
    };
  }

  async function getPurchase(
    transactionId: string
  ): Promise<IapTransactionRecord | null> {
    return context.store.getByKey(TRANSACTION_DESCRIPTOR, transactionId);
  }

  async function listTransactions(
    appUserId: string,
    query: TransactionQuery = {}
  ): Promise<IapTransactionRecord[]> {
    const filter: Record<string, unknown> = { appUserId };
    if (query.type) filter.type = query.type;
    if (query.productId) filter.productId = query.productId;
    if (query.environment) filter.environment = query.environment;
    if (query.revoked === true) filter.revocationDate = { $ne: null };
    if (query.revoked === false) filter.revocationDate = null;

    if (query.since !== undefined || query.until !== undefined) {
      const range: Record<string, number> = {};
      if (query.since !== undefined) range.$gte = query.since;
      if (query.until !== undefined) range.$lt = query.until;
      filter.purchaseDate = range;
    }

    const page = await context.store.query(TRANSACTION_DESCRIPTOR, filter, {
      // Sorted on an immutable column. Sorting on something a concurrent write
      // can change makes a row shift between pages, so it is seen twice or
      // missed entirely.
      sort: "-purchaseDate",
      limit: query.limit ?? 1000,
    });
    return page.rows;
  }

  async function listRefunds(appUserId: string): Promise<IapTransactionRecord[]> {
    const page = await context.store.query(
      TRANSACTION_DESCRIPTOR,
      { appUserId, revocationDate: { $ne: null } },
      { sort: "-purchaseDate", limit: 500 }
    );
    return page.rows;
  }

  async function listPendingConsumptionRequests(): Promise<
    IapConsumptionRequestRecord[]
  > {
    const now = context.clock();
    const page = await context.store.query(
      CONSUMPTION_DESCRIPTOR,
      { respondedAt: null, deadlineAt: { $gt: now } },
      { sort: "deadlineAt", limit: 200 }
    );
    return page.rows;
  }

  return {
    getSubscriptionState,
    hasActiveSubscription,
    getEntitlements,
    getPurchase,
    listTransactions,
    listRefunds,
    listPendingConsumptionRequests,
  };
}
