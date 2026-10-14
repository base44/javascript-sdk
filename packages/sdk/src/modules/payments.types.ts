/**
 * How often a recurring item bills.
 */
export type PaymentsRecurringFrequency = "day" | "week" | "month" | "year";

/**
 * Free trial before the first charge of a recurring item.
 */
export interface CheckoutFreeTrial {
  /** Unit of the trial length. Stripe supports only `'day'` and `'week'`. */
  frequency: PaymentsRecurringFrequency;
  /** Number of `frequency` units the trial lasts, from 1 to 999. */
  interval: number;
}

/**
 * Billing terms that turn a checkout item into a subscription.
 */
export interface CheckoutItemRecurring {
  /** Unit of the billing period. */
  frequency: PaymentsRecurringFrequency;
  /** Number of `frequency` units between charges, from 1 to 3650. Defaults to `1`. */
  interval?: number;
  /** Whether the subscription renews automatically at the end of its billing cycles. Stripe doesn't support `false`. */
  auto_renewal?: boolean;
  /** Number of billing cycles before the subscription ends, at least 1. Omit for no limit. Not supported for Stripe. */
  billing_cycles?: number;
  /** Free trial before the first charge. Stripe applies one trial to the whole checkout, so every recurring item must request the same trial. */
  free_trial?: CheckoutFreeTrial;
  /** Subscription title shown to the buyer, up to 150 characters. */
  title?: string;
  /** Subscription description shown to the buyer, up to 500 characters. */
  description?: string;
}

/**
 * A line item in a checkout.
 */
export interface CheckoutItem {
  /** Item name shown to the buyer, 1 to 255 characters. */
  name: string;
  /** Unit price in the currency's minor units, such as cents. Must be greater than `0`. Providers may also reject a total below their minimum charge. */
  amount: number;
  /** Number of units, from 1 to 1,000,000. Defaults to `1`. */
  quantity?: number;
  /** Whether the item ships, so the provider collects a shipping address. */
  shippable?: boolean;
  /** Billing terms. Set this to sell the item as a subscription. PayPal and Wix Payments allow one recurring item per checkout, and PayPal allows no other items with it. */
  recurring?: CheckoutItemRecurring;
}

/**
 * Details about the buyer, used to prefill the checkout. Every field is optional.
 */
export interface CheckoutBuyer {
  /** Buyer's email address. */
  email?: string;
  /** Buyer's first name. */
  first_name?: string;
  /** Buyer's last name. */
  last_name?: string;
  /** Buyer's phone number. */
  phone?: string;
}

/**
 * How the buyer pays.
 *
 * - `'redirect'`: The buyer leaves the app for the provider's hosted checkout page at `redirect_url`.
 * - `'embedded'`: The checkout renders inside the app with [`mountCheckout()`](/developers/references/sdk/docs/interfaces/payments#mountcheckout).
 */
export type CheckoutPresentation = "redirect" | "embedded";

/**
 * Parameters for [`createCheckout()`](/developers/references/sdk/docs/interfaces/service-role-payments#createcheckout).
 */
export interface CreateCheckoutParams {
  /** Items to sell, 1 to 100 entries. */
  items: CheckoutItem[];
  /** Three-letter ISO currency code, such as `'usd'`. Defaults to the payment account's currency. Required for PayPal. */
  currency?: string;
  /** App-relative path the buyer returns to after paying, such as `'/thank-you'`. Must start with `/`. */
  success_path: string;
  /** App-relative path the buyer returns to after cancelling. Must start with `/`. Not supported for Stripe embedded checkout. */
  cancel_path?: string;
  /** Details about the buyer, used to prefill the checkout. */
  buyer?: CheckoutBuyer;
  /** Your own key-value pairs, up to 50 keys. Returned in each purchase's `metadata` to service role callers only. Not supported for PayPal. */
  metadata?: Record<string, string>;
  /** Key that makes retries return the same checkout instead of creating another, 1 to 200 characters. Not supported for Wix Payments or PayPal subscriptions. */
  idempotency_key?: string;
  /** How the buyer pays. Defaults to `'redirect'`. PayPal apps must pass `'embedded'`, and Wix Payments supports only `'redirect'`. */
  presentation?: CheckoutPresentation;
}

/**
 * Data that Stripe Embedded Checkout needs to render.
 */
export interface StripeEmbeddedCheckout {
  /** Payment provider. */
  provider: "stripe";
  /** Stripe publishable key of the app's payment account. */
  publishable_key: string;
  /** Client secret of the Stripe Checkout Session. */
  client_secret: string;
}

/**
 * Data that the PayPal button needs to render.
 */
export interface PayPalEmbeddedCheckout {
  /** Payment provider. */
  provider: "paypal";
  /** PayPal client ID. */
  client_id: string;
  /** PayPal merchant ID of the app's seller account. */
  merchant_id: string;
  /** PayPal partner attribution ID, when set. */
  partner_attribution_id?: string | null;
  /** Whether the checkout is a one-time payment or a subscription. */
  intent: "capture" | "subscription";
}

/**
 * Data that an embedded checkout needs to render, by provider.
 */
export type EmbeddedCheckout = StripeEmbeddedCheckout | PayPalEmbeddedCheckout;

/**
 * Result of [`createCheckout()`](/developers/references/sdk/docs/interfaces/service-role-payments#createcheckout).
 *
 * Exactly one of `redirect_url` and `embedded` is set, depending on the checkout's `presentation`.
 */
export interface CreateCheckoutResult {
  /** ID of the checkout. For Stripe it's the Checkout Session ID, and for PayPal it's the PayPal order or subscription ID. */
  checkout_id: string;
  /** Three-letter ISO currency code of the checkout, in lowercase. */
  currency: string;
  /** Amount the buyer pays now, in minor units. It's `0` for a subscription that starts with a free trial. */
  amount_total: number;
  /** Absolute URL of the provider's hosted checkout page, for redirect checkouts. */
  redirect_url: string | null;
  /** Data for [`mountCheckout()`](/developers/references/sdk/docs/interfaces/payments#mountcheckout), for embedded checkouts. */
  embedded: EmbeddedCheckout | null;
}

/**
 * Result of [`completeCheckout()`](/developers/references/sdk/docs/interfaces/payments#completecheckout).
 */
export interface CompleteCheckoutResult {
  /** ID of the checkout. */
  checkout_id: string;
  /** Whether the payment went through or the provider is still processing it. */
  status: "paid" | "pending";
}

/**
 * Status of a purchase.
 *
 * - `'pending'`: The buyer hasn't finished paying, or the provider is still processing the payment.
 * - `'paid'`: The payment went through.
 * - `'refunded'`: The payment was refunded.
 * - `'canceled'`: The checkout or subscription was canceled.
 * - `'failed'`: The payment failed.
 * - `'unknown'`: The provider reported a state that doesn't map to the others.
 */
export type PurchaseStatus =
  | "pending"
  | "paid"
  | "refunded"
  | "canceled"
  | "failed"
  | "unknown";

/**
 * A line item of a purchase.
 */
export interface PurchaseItem {
  /** Item name. */
  name: string;
  /** Unit price in minor units, when the provider reports it. */
  amount?: number | null;
  /** Number of units, when the provider reports it. */
  quantity?: number | null;
}

/**
 * A completed or in-progress checkout.
 */
export interface Purchase {
  /** ID of the checkout the purchase came from. */
  checkout_id: string;
  /** Status of the purchase. */
  status: PurchaseStatus;
  /** Line items of the purchase. */
  items: PurchaseItem[];
  /** Total amount in minor units. */
  amount_total?: number | null;
  /** Three-letter ISO currency code, in lowercase. */
  currency?: string | null;
  /** Buyer's email address. */
  buyer_email?: string | null;
  /** The metadata passed to [`createCheckout()`](/developers/references/sdk/docs/interfaces/service-role-payments#createcheckout). Always `null` unless you call with the service role. */
  metadata?: Record<string, string> | null;
  /** ID of the subscription, for recurring purchases. */
  subscription_id?: string | null;
  /** ID of the payment to pass to [`refund()`](/developers/references/sdk/docs/interfaces/service-role-payments#refund). It's `null` where the provider doesn't name a single payment, such as PayPal subscriptions. */
  payment_id?: string | null;
}

/**
 * Parameters for [`listPurchases()`](/developers/references/sdk/docs/interfaces/payments#listpurchases).
 */
export interface ListPurchasesParams {
  /** Only return the purchase from this checkout. */
  checkout_id?: string;
  /** Only return purchases of this subscription. */
  subscription_id?: string;
  /** Maximum number of purchases to return, from 1 to 100. Defaults to `20`. */
  limit?: number;
  /** The `next_cursor` from the previous page. Send the same filters and `limit` as that call. */
  cursor?: string;
}

/**
 * Parameters for [`listPurchases()`](/developers/references/sdk/docs/interfaces/service-role-payments#listpurchases) with the service role.
 */
export interface ServiceRoleListPurchasesParams extends ListPurchasesParams {
  /** Only return purchases made with this email address. */
  buyer_email?: string;
}

/**
 * A page of purchases.
 */
export interface ListPurchasesResult {
  /** Purchases on this page. */
  items: Purchase[];
  /** Cursor for the next page, or `null` on the last page. */
  next_cursor: string | null;
}

/**
 * Parameters for [`refund()`](/developers/references/sdk/docs/interfaces/service-role-payments#refund).
 */
export interface RefundParams {
  /** The `payment_id` of the purchase to refund. */
  payment_id: string;
  /** Amount to refund in minor units. Must be greater than `0`. */
  amount: number;
  /** Key that makes retries return the original refund instead of refunding twice, 1 to 100 characters. */
  idempotency_key: string;
}

/**
 * Result of [`refund()`](/developers/references/sdk/docs/interfaces/service-role-payments#refund).
 */
export interface RefundResult {
  /** Provider's ID of the refund. */
  refund_id: string;
  /** ID of the refunded payment. */
  payment_id: string;
  /** Refunded amount in minor units. */
  amount: number;
  /** Three-letter ISO currency code, in lowercase. */
  currency: string;
  /** Whether the refund went through or the provider is still processing it. */
  status: "succeeded" | "pending";
}

/**
 * Options for [`cancelSubscription()`](/developers/references/sdk/docs/interfaces/service-role-payments#cancelsubscription).
 */
export interface CancelSubscriptionOptions {
  /** Cancel at the end of the current billing period instead of now. Defaults to `false`. Not supported for PayPal. */
  at_period_end?: boolean;
}

/**
 * State of a subscription after a change.
 */
export interface SubscriptionResult {
  /** ID of the subscription. */
  subscription_id: string;
  /** Current status of the subscription. */
  status: "active" | "past_due" | "paused" | "canceled";
  /** Whether the subscription is set to cancel at the end of the current billing period. */
  cancel_at_period_end: boolean;
}

/**
 * Error codes that payments methods reject with, in the `code` of a `Base44Error`.
 *
 * Some notable ones:
 *
 * - `payment_declined`: The buyer's payment method was declined when completing the checkout. The buyer can try again with another method.
 * - `refund_failed`: The refund's outcome is unknown. Retry with the same `idempotency_key` and `amount`, which returns the original refund if one was made.
 * - `refund_in_progress`: A refund with the same `idempotency_key` is still running.
 * - `refund_amount_mismatch`: The `idempotency_key` was already used for a different amount.
 * - `rate_limited`: Too many requests. Wait for the number of seconds in the `Retry-After` response header, available at `error.originalError.response.headers['retry-after']`.
 * - `refund_not_supported`, `subscription_action_not_supported`, `complete_not_supported`, `presentation_not_supported`: The app's payment provider doesn't support the operation.
 */
export type PaymentsErrorCode =
  | "forbidden"
  | "unauthenticated"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "payments_not_connected"
  | "invalid_request"
  | "invalid_items"
  | "amount_below_minimum"
  | "currency_mismatch"
  | "currency_required"
  | "invalid_metadata"
  | "idempotency_not_supported"
  | "idempotency_key_reused"
  | "multiple_subscription_items"
  | "recurring_option_not_supported"
  | "invalid_cursor"
  | "presentation_not_supported"
  | "embedded_checkout_unavailable"
  | "checkout_not_found"
  | "checkout_not_approved"
  | "checkout_closed"
  | "payment_declined"
  | "complete_not_supported"
  | "provider_unavailable"
  | "payment_not_found"
  | "refund_rejected"
  | "refund_in_progress"
  | "refund_amount_mismatch"
  | "refund_temporarily_unavailable"
  | "refund_failed"
  | "refund_not_supported"
  | "subscription_not_found"
  | "subscription_not_active"
  | "subscription_action_not_supported";

/**
 * Callbacks for [`mountCheckout()`](/developers/references/sdk/docs/interfaces/payments#mountcheckout).
 */
export interface MountCheckoutOptions {
  /**
   * Called after the buyer approves a PayPal payment and the SDK completes the checkout.
   *
   * Use it to update the page, not to grant access. Browser callbacks can be faked, so unlock paid content only after your backend confirms the purchase, for example with [`listPurchases()`](/developers/references/sdk/docs/interfaces/service-role-payments#listpurchases) in a backend function.
   *
   * Stripe doesn't call this. After a Stripe payment, the buyer returns to the checkout's `success_path` with a `session_id` query parameter. That parameter is the `checkout_id`. Show the result there with [`listPurchases()`](/developers/references/sdk/docs/interfaces/payments#listpurchases), and grant access only after your backend confirms it.
   */
  onComplete?: (result: CompleteCheckoutResult) => void;
  /** Called when the buyer closes the PayPal window without paying. The button stays mounted so the buyer can try again. */
  onCancel?: () => void;
  /**
   * Called when a PayPal checkout fails after it's mounted, including a declined payment with the `payment_declined` code. The button stays mounted so the buyer can try again. If it keeps failing with `payment_declined`, create a new checkout and mount it. Stripe shows its own errors inside the checkout.
   *
   * The error is a `Base44Error` when completing the checkout fails, or PayPal's own error object when the PayPal window fails.
   */
  onError?: (error: unknown) => void;
}

/**
 * An element on the page to render the checkout in, such as the result of `document.getElementById()`.
 *
 * Typed structurally so that the SDK's types don't require the DOM library in backend code.
 */
export interface CheckoutElement {
  /** Present on every DOM element. */
  appendChild(node: never): unknown;
}

/**
 * The fields of a {@linkcode CreateCheckoutResult} that [`mountCheckout()`](/developers/references/sdk/docs/interfaces/payments#mountcheckout) reads.
 */
export interface MountableCheckout {
  /** ID of the checkout. */
  checkout_id: string;
  /** Three-letter ISO currency code of the checkout. */
  currency: string;
  /** Data for the embedded checkout. Mounting rejects when it's `null`. */
  embedded: EmbeddedCheckout | null;
}

/**
 * A mounted embedded checkout.
 */
export interface CheckoutMount {
  /** Removes the checkout from the page. Call it when the component that holds it unmounts. For Stripe, mounting another checkout destroys this one for you. */
  destroy: () => void;
}

/**
 * Payments module for selling from the app through its connected payment provider.
 *
 * This module provides:
 * - An embedded checkout that renders in any framework, with a PayPal button or Stripe Embedded Checkout
 * - Completing PayPal checkouts
 * - Lookup of the signed-in user's purchases
 *
 * Creating checkouts, refunds, and subscription changes are in {@linkcode ServiceRolePaymentsModule}.
 *
 * Each app connects one provider, which is Stripe, PayPal, or Wix Payments. Amounts are always integers in the currency's minor units, such as cents.
 *
 * | | Stripe | PayPal | Wix Payments |
 * | :- | :- | :- | :- |
 * | Redirect checkout | Yes | No | Yes |
 * | Embedded checkout | Yes | Yes, the only mode | No |
 * | Refunds | Yes | Yes | No |
 * | Cancel a subscription | Yes, now or at period end | Yes, now only | No |
 * | Pause and resume a subscription | Yes | Yes | No |
 *
 * ## Authentication modes
 *
 * - **Anonymous or user authentication** (`base44.payments`): Completes checkouts, mounts embedded checkouts, and lists the signed-in user's own purchases.
 * - **Service role authentication** (`base44.asServiceRole.payments`): Creates checkouts, lists any purchase, refunds payments, and changes subscriptions. Use it in backend functions.
 *
 * Failed requests reject with a `Base44Error` whose `code` is one of the {@linkcode PaymentsErrorCode} values. Invalid arguments and [`mountCheckout()`](#mountcheckout) failures reject with a plain `Error`.
 */
export interface PaymentsModule {
  /**
   * Completes a PayPal checkout after the buyer approves it.
   *
   * When you use {@linkcode mountCheckout | mountCheckout()}, it calls this for you. Call it yourself only if you render the PayPal button yourself. Calling it again for the same checkout returns the same result.
   *
   * Only PayPal checkouts need completing. Other providers reject with `complete_not_supported`.
   *
   * @param checkoutId - The `checkout_id` from [`createCheckout()`](/developers/references/sdk/docs/interfaces/service-role-payments#createcheckout).
   * @returns Promise resolving to the checkout's payment status.
   *
   * @example
   * ```typescript
   * // Complete a PayPal checkout in your own onApprove handler
   * const { status } = await base44.payments.completeCheckout(checkoutId);
   * if (status === 'paid') {
   *   showThankYou();
   * }
   * ```
   */
  completeCheckout(checkoutId: string): Promise<CompleteCheckoutResult>;

  /**
   * Lists the signed-in user's purchases.
   *
   * Only purchases made with the user's own email address are returned. Rejects with `forbidden` when no user is signed in. PayPal apps must pass `checkout_id` or `subscription_id`, and get at most one purchase.
   *
   * @param params - Optional filters and pagination.
   * @returns Promise resolving to a page of purchases.
   *
   * @example
   * ```typescript
   * // Check a purchase on the success page
   * const { items } = await base44.payments.listPurchases({ checkout_id: checkoutId });
   * const paid = items[0]?.status === 'paid';
   * ```
   *
   * @example
   * ```typescript
   * // Page through the user's purchases
   * let cursor: string | undefined;
   * do {
   *   const page = await base44.payments.listPurchases({ limit: 50, cursor });
   *   page.items.forEach((purchase) => console.log(purchase.checkout_id, purchase.status));
   *   cursor = page.next_cursor ?? undefined;
   * } while (cursor);
   * ```
   */
  listPurchases(params?: ListPurchasesParams): Promise<ListPurchasesResult>;

  /**
   * Renders an embedded checkout inside an element on the page.
   *
   * Pass the result of a [`createCheckout()`](/developers/references/sdk/docs/interfaces/service-role-payments#createcheckout) call made with `presentation: 'embedded'`. Because only the service role can create checkouts, create it in a backend function and return the result to the page.
   *
   * The SDK loads the provider's script and renders the checkout for you:
   * - PayPal: Renders a PayPal button. When the buyer approves the payment, the SDK calls {@linkcode completeCheckout | completeCheckout()} and then `onComplete`.
   * - Stripe: Mounts Stripe Embedded Checkout. After paying, the buyer returns to the checkout's `success_path`. Stripe allows one embedded checkout per page, so mounting another Stripe checkout destroys the previous one.
   *
   * Requires a browser environment and can't be used in the backend. Rejects when the checkout isn't embedded, when the payments config can't be fetched or has no valid script URL for the provider, when the provider's script fails to load, or when PayPal isn't available for the checkout's currency.
   *
   * The checkout's callbacks run in the buyer's browser, where they can be faked. Grant access to what the buyer paid for only after your backend confirms the purchase, for example with [`listPurchases()`](/developers/references/sdk/docs/interfaces/service-role-payments#listpurchases) in a backend function.
   *
   * @param element - Element to render the checkout in. It should be empty.
   * @param checkout - The result of [`createCheckout()`](/developers/references/sdk/docs/interfaces/service-role-payments#createcheckout).
   * @param options - Callbacks for the checkout's outcome.
   * @returns Promise resolving to the mounted checkout once it renders.
   *
   * @example
   * ```typescript
   * // Create the checkout in a backend function, then mount it
   * const { data: checkout } = await base44.functions.invoke('createCheckout', { planId });
   *
   * const mount = await base44.payments.mountCheckout(
   *   document.getElementById('checkout')!,
   *   checkout,
   *   {
   *     onComplete: ({ status }) => navigate(status === 'paid' ? '/thank-you' : '/processing'),
   *     onError: () => setError('The payment failed. Please try again.'),
   *   }
   * );
   *
   * // Later, when the page unmounts
   * mount.destroy();
   * ```
   *
   * @example
   * ```tsx
   * // React component
   * function Checkout({ checkout }: { checkout: CreateCheckoutResult }) {
   *   const ref = useRef<HTMLDivElement>(null);
   *
   *   useEffect(() => {
   *     let mount: CheckoutMount | undefined;
   *     let cancelled = false;
   *     base44.payments
   *       .mountCheckout(ref.current!, checkout, { onComplete: () => navigate('/thank-you') })
   *       .then((m) => (cancelled ? m.destroy() : (mount = m)))
   *       .catch(() => setError('The checkout could not load.'));
   *     return () => {
   *       cancelled = true;
   *       mount?.destroy();
   *     };
   *   }, [checkout]);
   *
   *   return <div ref={ref} />;
   * }
   * ```
   */
  mountCheckout(
    element: CheckoutElement,
    checkout: MountableCheckout,
    options?: MountCheckoutOptions
  ): Promise<CheckoutMount>;
}

/**
 * Payments module with service role authentication, for backend functions.
 *
 * Creates checkouts, lists any purchase, refunds payments, and changes subscriptions. See {@linkcode PaymentsModule} for which providers support which operations.
 *
 * Refunds take a required `idempotency_key` and checkouts take an optional one, so retrying them doesn't charge or refund twice. Repeating a subscription change returns the subscription's current state.
 */
export interface ServiceRolePaymentsModule {
  /**
   * Creates a checkout.
   *
   * For a redirect checkout, send the buyer to the returned `redirect_url`. For an embedded checkout, return the result to the page and pass it to [`mountCheckout()`](/developers/references/sdk/docs/interfaces/payments#mountcheckout).
   *
   * A checkout with a `recurring` item creates a subscription.
   *
   * @param params - Items, return paths, and options for the checkout.
   * @returns Promise resolving to the checkout.
   *
   * @example
   * ```typescript
   * // Create a redirect checkout in a backend function
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const checkout = await base44.asServiceRole.payments.createCheckout({
   *     items: [{ name: 'T-shirt', amount: 2500, quantity: 2, shippable: true }],
   *     currency: 'usd',
   *     success_path: '/thank-you',
   *     cancel_path: '/cart',
   *   });
   *
   *   return Response.json({ url: checkout.redirect_url });
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Create an embedded subscription checkout for the signed-in user
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const user = await base44.auth.me();
   *   const checkout = await base44.asServiceRole.payments.createCheckout({
   *     items: [{
   *       name: 'Pro plan',
   *       amount: 1500,
   *       recurring: { frequency: 'month', free_trial: { frequency: 'day', interval: 14 } },
   *     }],
   *     currency: 'usd',
   *     success_path: '/welcome',
   *     buyer: { email: user.email },
   *     presentation: 'embedded',
   *   });
   *
   *   // Pass this to base44.payments.mountCheckout() on the page
   *   return Response.json(checkout);
   * });
   * ```
   */
  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;

  /**
   * Completes a PayPal checkout after the buyer approves it.
   *
   * See [`base44.payments.completeCheckout()`](/developers/references/sdk/docs/interfaces/payments#completecheckout).
   *
   * @param checkoutId - The `checkout_id` from {@linkcode createCheckout | createCheckout()}.
   * @returns Promise resolving to the checkout's payment status.
   *
   * @example
   * ```typescript
   * // Complete a PayPal checkout from a backend function
   * const { status } = await base44.asServiceRole.payments.completeCheckout(checkoutId);
   * ```
   */
  completeCheckout(checkoutId: string): Promise<CompleteCheckoutResult>;

  /**
   * Lists the app's purchases.
   *
   * Unlike [`base44.payments.listPurchases()`](/developers/references/sdk/docs/interfaces/payments#listpurchases), it returns any buyer's purchases and includes their `metadata`. PayPal apps must pass `checkout_id` or `subscription_id`, and get at most one purchase.
   *
   * @param params - Optional filters and pagination.
   * @returns Promise resolving to a page of purchases.
   *
   * @example
   * ```typescript
   * // Find a buyer's purchases
   * const { items } = await base44.asServiceRole.payments.listPurchases({
   *   buyer_email: 'buyer@example.com',
   * });
   * ```
   */
  listPurchases(
    params?: ServiceRoleListPurchasesParams
  ): Promise<ListPurchasesResult>;

  /**
   * Refunds all or part of a payment.
   *
   * Retrying with the same `idempotency_key` and `amount` returns the original refund instead of refunding twice. When the call rejects with `refund_failed`, the outcome is unknown, so retry it with the same values.
   *
   * Not supported for Wix Payments.
   *
   * @param params - The payment, amount, and idempotency key.
   * @returns Promise resolving to the refund.
   *
   * @example
   * ```typescript
   * // Refund a purchase in full
   * const { items } = await base44.asServiceRole.payments.listPurchases({ checkout_id: checkoutId });
   * const purchase = items[0];
   *
   * const refund = await base44.asServiceRole.payments.refund({
   *   payment_id: purchase.payment_id!,
   *   amount: purchase.amount_total!,
   *   idempotency_key: `refund-${checkoutId}`,
   * });
   * ```
   */
  refund(params: RefundParams): Promise<RefundResult>;

  /**
   * Cancels a subscription, now or at the end of the current billing period.
   *
   * Not supported for Wix Payments. PayPal supports cancelling now only.
   *
   * @param subscriptionId - The `subscription_id` of the purchase.
   * @param options - When to cancel.
   * @returns Promise resolving to the subscription's state.
   *
   * @example
   * ```typescript
   * // Cancel at the end of the billing period
   * await base44.asServiceRole.payments.cancelSubscription(subscriptionId, {
   *   at_period_end: true,
   * });
   * ```
   */
  cancelSubscription(
    subscriptionId: string,
    options?: CancelSubscriptionOptions
  ): Promise<SubscriptionResult>;

  /**
   * Pauses a subscription's billing.
   *
   * Not supported for Wix Payments.
   *
   * @param subscriptionId - The `subscription_id` of the purchase.
   * @returns Promise resolving to the subscription's state.
   *
   * @example
   * ```typescript
   * // Pause a subscription
   * await base44.asServiceRole.payments.pauseSubscription(subscriptionId);
   * ```
   */
  pauseSubscription(subscriptionId: string): Promise<SubscriptionResult>;

  /**
   * Resumes a paused subscription's billing.
   *
   * Not supported for Wix Payments.
   *
   * @param subscriptionId - The `subscription_id` of the purchase.
   * @returns Promise resolving to the subscription's state.
   *
   * @example
   * ```typescript
   * // Resume a paused subscription
   * await base44.asServiceRole.payments.resumeSubscription(subscriptionId);
   * ```
   */
  resumeSubscription(subscriptionId: string): Promise<SubscriptionResult>;
}
