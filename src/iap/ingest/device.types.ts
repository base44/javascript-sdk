/**
 * What the native shell sends the backend.
 *
 * Two calls, both from the shell rather than the web app: one when a purchase
 * completes, and one at launch to reconcile whatever the device knows against
 * whatever the server knows. The web app never sends purchase tokens itself.
 */
import type { DecodedTransaction, IapEnvironment } from "../verify/verify.types.js";
import type { Entitlements } from "../read/read.types.js";

/** Extra context for recording a purchase. */
export interface RecordTransactionOptions {
  /**
   * The Base44 user making the request.
   *
   * When given, it is checked against the UUID Apple signed into the
   * transaction, and the call is rejected if they disagree — so one customer
   * cannot claim another's purchase by replaying their token.
   */
  appUserId?: string;
}

/** What recording a purchase did. */
export interface RecordTransactionResult {
  /** Whether the purchase is now stored. Always true when this resolves. */
  recorded: boolean;
  /** Apple's transaction id. */
  transactionId: string;
  /**
   * Whether this transaction was already stored.
   *
   * The double-delivery guard. StoreKit re-delivers an unfinished transaction
   * at every launch, so a consumable must only be granted when this is
   * `false`.
   */
  duplicate: boolean;
  /** The verified contents of the token. */
  decoded: DecodedTransaction;
}

/** What the shell knows about the device's purchases. */
export interface SyncPayload {
  /** Signed transactions from StoreKit's current entitlements. */
  entitlements?: string[];
  /** Signed transactions StoreKit still considers unfinished. */
  unfinished?: string[];
  /**
   * Subscription status pairs, one per subscription group.
   *
   * The pairing matters: current entitlements carry a transaction but no
   * renewal information, and renewal information is where the grace period and
   * the auto-renew flag live.
   */
  statuses?: { transactionJws: string; renewalInfoJws: string }[];
  /** The signed app transaction, if the shell has one. */
  appTransaction?: string;
  /** Which environment the device is in. */
  environment?: IapEnvironment;
}

/** What a sync did. */
export interface SyncResult {
  /**
   * Transactions that are now durably stored.
   *
   * The shell may call `finish()` on these once it has delivered the content.
   * An id missing from this list was not stored, so StoreKit should keep
   * re-delivering it.
   */
  recordedTransactionIds: string[];
  /** What the server believes the user owns, so the app can reconcile its UI. */
  snapshot: Entitlements;
  /**
   * How many device entitlements the server did not know about, or disagreed on.
   *
   * Persistently above zero means notifications are being missed.
   */
  mismatches: number;
  /** How many tokens failed verification and were skipped. */
  skipped: number;
}
