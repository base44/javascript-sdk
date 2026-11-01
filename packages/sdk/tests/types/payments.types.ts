import type {
  Base44Client,
  CheckoutElement,
  CreateCheckoutResult,
  MountableCheckout,
} from "../../src/index.js";

declare const base44: Base44Client;
declare const div: HTMLDivElement;
declare const maybeDiv: HTMLElement | null;
declare const checkout: CreateCheckoutResult;

// Any DOM element can hold a checkout, and the full createCheckout() result can be mounted.
const element: CheckoutElement = div;
const mountable: MountableCheckout = checkout;
base44.payments.mountCheckout(element, mountable);

// @ts-expect-error getElementById() can return null, so it needs a check first.
base44.payments.mountCheckout(maybeDiv, checkout);

// @ts-expect-error Creating checkouts is service role only.
base44.payments.createCheckout;

// @ts-expect-error Refunds are service role only.
base44.payments.refund;

// @ts-expect-error The service role runs in backend code, where there is nothing to mount.
base44.asServiceRole.payments.mountCheckout;

base44.payments.preloadCheckout("paypal");

// @ts-expect-error Only connected checkout providers have a script to preload.
base44.payments.preloadCheckout("wix");

base44.asServiceRole.payments.listPurchases({ buyer_email: "buyer@example.com" });

// @ts-expect-error Only the service role can filter by another buyer's email.
base44.payments.listPurchases({ buyer_email: "buyer@example.com" });
