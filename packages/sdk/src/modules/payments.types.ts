/**
 * How often a recurring item bills.
 */
export type PaymentsRecurringFrequency = "day" | "week" | "month" | "year";

/**
 * Free trial before the first charge of a recurring item.
 */
export interface CheckoutFreeTrial {
  /** Unit of the trial length, which is `'day'`, `'week'`, `'month'`, or `'year'`. Stripe supports only `'day'` and `'week'`. */
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
  /** Unit price as an integer in the currency's minor units, such as cents. Must be greater than `0`. Providers may also reject a total below their minimum charge. */
  amount: number;
  /** Number of units, from 1 to 1,000,000. Defaults to `1`. */
  quantity?: number;
  /** Whether the item ships. For a shippable item, the provider collects a shipping address unless you pass one in `shipping.address`. */
  shippable?: boolean;
  /** Billing terms. Set this to sell the item as a subscription. PayPal and Base44 Payments allow one recurring item per checkout, and PayPal allows no other items with it. */
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
 * A shipping address. Returned on a purchase whether your app or the provider collected it.
 */
export interface ShippingAddress {
  /** Recipient's full name, 1 to 300 characters. */
  name: string;
  /** Street address, 1 to 300 characters. */
  line1: string;
  /** Apartment, suite, or building, up to 300 characters. */
  line2?: string | null;
  /** City, up to 120 characters. Some countries address by region and postal code alone. */
  city?: string | null;
  /** State, province, or region, up to 300 characters. */
  region?: string | null;
  /** Postal or ZIP code, up to 60 characters. */
  postal_code?: string | null;
  /** Two-letter ISO 3166-1 country code, such as `'US'`. */
  country: string;
}

/**
 * Shipping address and fee for a checkout.
 */
export interface CheckoutShipping {
  /** Address your app collected. Omit it to let the provider ask the buyer. */
  address?: ShippingAddress;
  /** Shipping fee as an integer in minor units, shown to the buyer as its own shipping line. Omit it for free shipping. */
  amount?: number;
}

/**
 * How the buyer pays.
 *
 * - `'redirect'`: The buyer leaves the app for the provider's hosted checkout page at `redirect_url`.
 * - `'embedded'`: The checkout renders inside the app with [`mountCheckout()`](#mountcheckout).
 */
export type CheckoutPresentation = "redirect" | "embedded";

/**
 * Parameters for [`createCheckout()`](#createcheckout).
 */
export interface CreateCheckoutParams {
  /** Items to sell, 1 to 100 entries. */
  items: CheckoutItem[];
  /** Three-letter ISO currency code, such as `'usd'`. Defaults to the payment account's currency. Required for PayPal. */
  currency?: string;
  /** App-relative path the buyer returns to after paying, such as `'/thank-you'`. Must start with `/`. */
  success_path: string;
  /** App-relative path the buyer returns to after canceling. Must start with `/`. Not supported for Stripe embedded checkout. */
  cancel_path?: string;
  /** Details about the buyer, used to prefill the checkout. */
  buyer?: CheckoutBuyer;
  /** Your own key-value pairs, up to 50 keys. Returned in each purchase's `metadata` to service role callers only. Not supported for PayPal. */
  metadata?: Record<string, string>;
  /** Key that makes retries return the same checkout instead of creating another, 1 to 200 characters. Not supported for Base44 Payments or PayPal subscriptions. */
  idempotency_key?: string;
  /** How the buyer pays. Defaults to `'redirect'`. PayPal apps must pass `'embedded'`, and Base44 Payments supports only `'redirect'`. */
  presentation?: CheckoutPresentation;
  /**
   * Shipping address and fee. Allowed only when at least one item is `shippable`. Supported for PayPal one-time checkouts only. Other providers and subscriptions reject it with [`invalid_request`](#paymentserrorcode).
   *
   * Compute the fee in a backend function, never in the browser. When the fee depends on the address, such as by distance or zone, collect the address in your app and pass it in `address`. PayPal shows the address to the buyer locked, so the order ships to the address you computed the fee for. When the fee doesn't depend on the address, pass only `amount` and PayPal asks the buyer for the address.
   */
  shipping?: CheckoutShipping;
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
 * Result of [`createCheckout()`](#createcheckout).
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
  /** Data for [`mountCheckout()`](#mountcheckout), for embedded checkouts. */
  embedded: EmbeddedCheckout | null;
}

/**
 * Result of [`completeCheckout()`](#completecheckout).
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
  /** The metadata passed to [`createCheckout()`](#createcheckout). Always `null` unless you call with the service role. */
  metadata?: Record<string, string> | null;
  /** ID of the subscription, for recurring purchases. */
  subscription_id?: string | null;
  /** Where the order ships, whether your app or the provider collected the address. Always `null` unless you call with the service role. Save it on your order record. */
  shipping_address?: ShippingAddress | null;
  /** Shipping fee in minor units, when the checkout charged one. */
  shipping_amount?: number | null;
  /** ID of the payment to pass to [`refund()`](#refund). For a PayPal subscription it's the latest charge, returned only with the service role. Read it when you start a refund and reuse it on retries. It's `null` when the provider doesn't name a payment, such as a PayPal subscription whose latest charge is already refunded. */
  payment_id?: string | null;
}

/**
 * Parameters for [`listPurchases()`](#listpurchases).
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
 * Parameters for [`listPurchases()`](#service-role-methods) with the service role.
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
 * Parameters for [`refund()`](#refund).
 */
export interface RefundParams {
  /** The `payment_id` of the purchase to refund. */
  payment_id: string;
  /** Amount to refund as an integer in minor units. Must be greater than `0`. */
  amount: number;
  /** Key that makes retries return the original refund instead of refunding twice, 1 to 100 characters. */
  idempotency_key: string;
}

/**
 * Result of [`refund()`](#refund).
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
 * Options for [`cancelSubscription()`](#cancelsubscription).
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
 * Error codes that payments methods set in the `code` of a [`Base44Error`](/developers/references/sdk/getting-started/work-with-sdk#error-handling) when they reject. Invalid arguments and [`mountCheckout()`](#mountcheckout) failures reject with a plain `Error` instead.
 *
 * Notable codes include:
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
 * Callbacks for [`mountCheckout()`](#mountcheckout).
 */
export interface MountCheckoutOptions {
  /**
   * Called after the buyer approves a PayPal payment and the SDK completes the checkout. Use it to update the page, not to grant access.
   *
   * Stripe doesn't call this. After a Stripe payment, the buyer returns to the checkout's `success_path` with a `session_id` query parameter. That parameter is the `checkout_id`. Show the result there with [`listPurchases()`](#listpurchases).
   */
  onComplete?: (result: CompleteCheckoutResult) => void;
  /** Called when the buyer closes the PayPal window without paying. The button stays mounted so the buyer can try again. */
  onCancel?: () => void;
  /**
   * Called when a PayPal checkout fails after it's mounted, including a declined payment with the [`payment_declined`](#paymentserrorcode) code. The button stays mounted so the buyer can try again. If it keeps failing with `payment_declined`, create a new checkout and mount it. Stripe shows its own errors inside the checkout.
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
 * The fields of a {@linkcode CreateCheckoutResult} that [`mountCheckout()`](#mountcheckout) reads.
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
 * A PayPal checkout that [`mountCheckout()`](#mountcheckout) creates when the buyer clicks PayPal's button. The button shows as soon as the page loads, the buyer clicks once, and no order is created until they do.
 */
export interface PayPalCheckoutOnClick {
  /** Payment provider. Only PayPal can create its checkout on click. */
  provider: "paypal";
  /** Three-letter ISO currency code the checkout uses, such as `'usd'`. */
  currency: string;
  /** Whether the checkout is a one-time payment or a subscription. */
  intent: "capture" | "subscription";
  /**
   * Creates the checkout when the buyer clicks, usually by calling the backend function that calls [`createCheckout()`](#createcheckout). Resolve with its result. It must be an embedded PayPal checkout with the same `currency` and `intent` you set here, or `onError` receives an error. Reject to stop, for example when a required form field is empty. PayPal's window then closes and `onError` receives the error.
   */
  createCheckout: () => Promise<MountableCheckout>;
}

/**
 * A mounted embedded checkout.
 */
export interface CheckoutMount {
  /** Removes the checkout from the page. Call it when the component that holds it unmounts. For Stripe, mounting another checkout destroys this one for you. */
  destroy: () => void;
  /** Grays out PayPal's button and ignores clicks, for example until a required form is filled in. After a payment completes the button stays off, so `setDisabled(false)` can't start a second payment. Stripe ignores it. */
  setDisabled: (disabled: boolean) => void;
}

/**
 * Payments module for accepting one-time payments and subscriptions in your app through its connected payment provider.
 *
 * This module provides:
 * - Checkouts for one-time payments and subscriptions, on the provider's hosted page or embedded in your app
 * - Purchase lookup
 * - Refunds
 * - Subscription management, including canceling, pausing, and resuming
 *
 *
 * ## Providers
 *
 * Each app connects one provider, which is Stripe, PayPal, or Base44 Payments powered by Wix.
 *
 * | | Stripe | PayPal | Base44 Payments |
 * | :- | :- | :- | :- |
 * | Redirect checkout | Yes | No | Yes |
 * | Embedded checkout | Yes | Yes, required | No |
 * | Refunds | Yes | Yes | Yes |
 * | Subscription cancellation | Yes, now or at period end | Yes, now only | Yes, now or at period end |
 * | Subscription pause and resume | Yes | Yes | No |
 *
 * ## Authentication modes
 *
 * - **Anonymous or user authentication** (`base44.payments`): Preloads and mounts embedded checkouts, completes PayPal checkouts, and lists the current user's own purchases.
 * - **Service role authentication** (`base44.asServiceRole.payments`): Creates checkouts, lists any purchase, refunds payments, and changes subscriptions. Use the [service role methods](#service-role-methods) in backend functions.
 *
 * @groupDescription Methods
 * These methods use anonymous or user authentication, through `base44.payments`.
 */
export interface PaymentsModule {
  /**
   * Starts downloading the provider's JavaScript library, Stripe.js or the PayPal JavaScript SDK, before you mount a checkout, so the checkout appears faster.
   *
   * Call it when the checkout page or form opens, while the buyer is still filling it in. {@linkcode mountCheckout | mountCheckout()} needs the library to render the checkout, and downloads it itself if you didn't preload it.
   *
   * It never rejects, so you don't need to await it or catch errors. If the library can't load, `mountCheckout()` tries again and rejects with the error. Loading the library requires a browser environment and is skipped in the backend.
   *
   * @param provider - The provider the app is connected to.
   * @returns Promise resolving once the library has loaded or failed to load.
   *
   * @example
   * ```typescript
   * // Preload PayPal
   * base44.payments.preloadCheckout('paypal');
   * ```
   */
  preloadCheckout(provider: "paypal" | "stripe"): Promise<void>;

  /**
   * Renders an embedded checkout inside an element on the page.
   *
   * Pass the result of a {@linkcode ServiceRolePaymentsModule.createCheckout | createCheckout()} call made with `presentation: 'embedded'`. Because only the service role can create checkouts, create it in a backend function and return the result to the page. For PayPal, you can instead pass a {@linkcode PayPalCheckoutOnClick} to show the button before any checkout exists. The SDK creates the checkout only when the buyer clicks the button, so visitors who don't buy don't leave unused checkouts behind.
   *
   * The SDK loads the provider's library and renders the checkout for you:
   * - PayPal: Renders a PayPal button. When the buyer approves the payment, the SDK calls {@linkcode completeCheckout | completeCheckout()} and then `onComplete`.
   * - Stripe: Mounts Stripe Embedded Checkout. After paying, the buyer returns to the checkout's `success_path`. Stripe allows one embedded checkout per page, so mounting another Stripe checkout destroys the previous one.
   *
   * To make the checkout appear faster, load the library ahead of time with [`preloadCheckout()`](#preloadcheckout) when the page opens.
   *
   * Requires a browser environment and can't be used in the backend. Rejects when the checkout isn't embedded, when an on-click PayPal checkout is mounted before the app's PayPal can take payments, when the payments config can't be fetched or has no valid script URL for the provider, when the provider's library fails to load, or when PayPal isn't available for the checkout's currency.
   *
   * The checkout's callbacks run in the buyer's browser, where they can be faked. Grant access to what the buyer paid for only after your backend confirms the purchase, for example with [`listPurchases()`](#service-role-methods) in a backend function.
   *
   * @param element - Element to render the checkout in. It should be empty.
   * @param checkout - The result of {@linkcode ServiceRolePaymentsModule.createCheckout | createCheckout()}, or for PayPal a {@linkcode PayPalCheckoutOnClick} that creates it when the buyer clicks.
   * @param options - Callbacks for the checkout's outcome.
   * @returns Promise resolving to the mounted checkout once it renders.
   *
   * @example
   * ```typescript
   * // Mount a checkout
   * // Create the checkout in a backend function
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
   * ```typescript
   * // Create a PayPal checkout on click
   * const mount = await base44.payments.mountCheckout(
   *   document.getElementById('paypal')!,
   *   {
   *     provider: 'paypal',
   *     currency: 'usd',
   *     intent: 'capture',
   *     createCheckout: async () =>
   *       (await base44.functions.invoke('createCheckout', { productId })).data,
   *   },
   *   { onComplete: ({ checkout_id }) => confirmPurchase(checkout_id) }
   * );
   *
   * // Gray out the button until the shipping form is valid
   * mount.setDisabled(!formIsValid);
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
    checkout: MountableCheckout | PayPalCheckoutOnClick,
    options?: MountCheckoutOptions
  ): Promise<CheckoutMount>;

  /**
   * Completes a PayPal checkout after the buyer approves it.
   *
   * When you use {@linkcode mountCheckout | mountCheckout()}, it calls this for you. Call it directly only if you render your own PayPal button. Calling it again for the same checkout returns the same result.
   *
   * Only PayPal checkouts need completing. Other providers reject with [`complete_not_supported`](#paymentserrorcode).
   *
   * To complete the checkout from a backend function instead, use [`completeCheckout()`](#service-role-methods) with the service role.
   *
   * @param checkoutId - The `checkout_id` from {@linkcode ServiceRolePaymentsModule.createCheckout | createCheckout()}.
   * @returns Promise resolving to the checkout's payment status.
   *
   * @example
   * ```typescript
   * // Complete a PayPal checkout
   * // In your own PayPal onApprove handler
   * const { status } = await base44.payments.completeCheckout(checkoutId);
   * if (status === 'paid') {
   *   showThankYou();
   * }
   * ```
   */
  completeCheckout(checkoutId: string): Promise<CompleteCheckoutResult>;

  /**
   * Lists the current user's purchases. A purchase belongs to the user when it was made with the user's email address.
   *
   * To confirm a purchase in a backend function before you grant access, or to look up any buyer's purchases, use [`listPurchases()`](#service-role-methods) with the service role.
   *
   * PayPal can't list purchases, so for PayPal apps, pass `checkout_id` or `subscription_id`. The call looks up that one purchase and rejects with [`invalid_request`](#paymentserrorcode) without either.
   *
   * Rejects with [`forbidden`](#paymentserrorcode) when the client uses anonymous authentication.
   *
   * @param params - Optional filters and pagination.
   * @returns Promise resolving to a page of purchases.
   *
   * @example
   * ```typescript
   * // Check a purchase by checkout ID
   * const { items } = await base44.payments.listPurchases({ checkout_id: checkoutId });
   * const paid = items[0]?.status === 'paid';
   * ```
   *
   * @example
   * ```typescript
   * // Stripe success page
   * // On a Stripe success page, the session_id query parameter is the checkout ID
   * const checkoutId = new URLSearchParams(window.location.search).get('session_id');
   *
   * // Filtering by checkout returns at most one purchase
   * const { items: [purchase] } = await base44.payments.listPurchases({ checkout_id: checkoutId });
   *
   * if (purchase?.status === 'paid') {
   *   showThankYou();
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Page through purchases
   * let cursor: string | undefined;
   * do {
   *   const page = await base44.payments.listPurchases({ limit: 50, cursor });
   *   page.items.forEach((purchase) => console.log(purchase.checkout_id, purchase.status));
   *   cursor = page.next_cursor ?? undefined;
   * } while (cursor);
   * ```
   */
  listPurchases(params?: ListPurchasesParams): Promise<ListPurchasesResult>;
}

/**
 * These methods use service role authentication, through `base44.asServiceRole.payments`. Call them from backend functions.
 *
 * Not every provider supports every operation. See [Providers](#providers) for which ones do.
 *
 * Refunds take a required `idempotency_key` and checkouts take an optional one, so retrying them doesn't charge or refund twice. Repeating a subscription change returns the subscription's current state.
 */
export interface ServiceRolePaymentsModule {
  /**
   * Creates a checkout.
   *
   * A checkout is either a redirect checkout, where the buyer leaves your app for the provider's hosted checkout page, or an embedded checkout, which renders inside your app. Choose one with `presentation`. It defaults to `'redirect'`.
   *
   * After you create the checkout, use the result:
   * - Redirect checkout: Send the buyer to the returned `redirect_url`.
   * - Embedded checkout: Return the result to the page and pass it to {@linkcode PaymentsModule.mountCheckout | mountCheckout()}.
   *
   * A checkout with a `recurring` item creates a subscription.
   *
   * @param params - Items, return paths, and options for the checkout.
   * @returns Promise resolving to the checkout. Exactly one of `redirect_url` and `embedded` is set, depending on the checkout's `presentation`.
   *
   * @example
   * ```typescript
   * // Redirect checkout
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
   * // Embedded subscription checkout
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
   * Completes a PayPal checkout from a backend function, after the buyer approves it.
   *
   * Use it when you render your own PayPal button and its `onApprove` handler sends the checkout ID to your backend. Calling it again for the same checkout returns the same result.
   *
   * Only PayPal checkouts need completing. Other providers reject with [`complete_not_supported`](#paymentserrorcode).
   *
   * @param checkoutId - The `checkout_id` from {@linkcode createCheckout | createCheckout()}.
   * @returns Promise resolving to the checkout's payment status.
   *
   * @example
   * ```typescript
   * // Complete a PayPal checkout
   * const { status } = await base44.asServiceRole.payments.completeCheckout(checkoutId);
   * ```
   */
  completeCheckout(checkoutId: string): Promise<CompleteCheckoutResult>;

  /**
   * Lists the app's purchases.
   *
   * Unlike {@linkcode PaymentsModule.listPurchases | base44.payments.listPurchases()}, it returns any buyer's purchases and includes their `metadata`.
   *
   * PayPal can't list purchases, so for PayPal apps, pass `checkout_id` or `subscription_id`. The call looks up that one purchase and rejects with [`invalid_request`](#paymentserrorcode) without either.
   *
   * @param params - Optional filters and pagination.
   * @returns Promise resolving to a page of purchases.
   *
   * @example
   * ```typescript
   * // Confirm a purchase before granting access
   * import { createClientFromRequest } from 'npm:@base44/sdk';
   *
   * Deno.serve(async (req) => {
   *   const base44 = createClientFromRequest(req);
   *   const { checkoutId } = await req.json();
   *
   *   const { items: [purchase] } = await base44.asServiceRole.payments.listPurchases({
   *     checkout_id: checkoutId,
   *   });
   *
   *   if (purchase?.status !== 'paid') {
   *     return Response.json({ error: 'Payment not confirmed' }, { status: 402 });
   *   }
   *
   *   // Grant access to what the buyer paid for here
   *   return Response.json({ ok: true });
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Find a buyer's purchases
   * // Not available for PayPal apps, which need checkout_id or subscription_id
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
   * Retrying with the same `idempotency_key` and `amount` returns the original refund instead of refunding twice. When the call rejects with [`refund_failed`](#paymentserrorcode), the outcome is unknown, so retry it with the same values.
   *
   * @param params - The payment, amount, and idempotency key.
   * @returns Promise resolving to the refund.
   *
   * @example
   * ```typescript
   * // Full refund
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
   * PayPal supports canceling now only.
   *
   * @param subscriptionId - The `subscription_id` of the purchase.
   * @param options - When to cancel.
   * @returns Promise resolving to the subscription's state.
   *
   * @example
   * ```typescript
   * // Cancel at period end
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
   * Not supported for Base44 Payments.
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
   * Not supported for Base44 Payments.
   *
   * @param subscriptionId - The `subscription_id` of the purchase.
   * @returns Promise resolving to the subscription's state.
   *
   * @example
   * ```typescript
   * // Resume a subscription
   * await base44.asServiceRole.payments.resumeSubscription(subscriptionId);
   * ```
   */
  resumeSubscription(subscriptionId: string): Promise<SubscriptionResult>;
}
