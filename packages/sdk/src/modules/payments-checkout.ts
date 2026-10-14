import type {
  CheckoutElement,
  CheckoutMount,
  CompleteCheckoutResult,
  MountableCheckout,
  MountCheckoutOptions,
  PayPalEmbeddedCheckout,
  StripeEmbeddedCheckout,
} from "./payments.types.js";

// The backend picks each script URL, but the script runs on the buyer's page, so only these hosts may load.
const ALLOWED_SCRIPT_HOSTS: Record<"paypal" | "stripe", readonly string[]> = {
  paypal: ["www.paypal.com", "www.sandbox.paypal.com"],
  stripe: ["js.stripe.com"],
};

interface PayPalSession {
  start(
    options: { presentationMode: "auto" },
    checkout: Promise<{ orderId: string } | { subscriptionId: string }>
  ): Promise<unknown>;
  destroy?(): void;
}

interface PayPalSessionCallbacks {
  onApprove(data: unknown): Promise<void>;
  onCancel(data: unknown): void;
  onError(error: unknown): void;
}

type PayPalSessionFactory = (callbacks: PayPalSessionCallbacks) => PayPalSession;

interface PayPalSdkInstance {
  findEligibleMethods(options: {
    currencyCode: string;
    paymentFlow?: "RECURRING_PAYMENT";
  }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession?: PayPalSessionFactory;
  // The reference page and the published types disagree on this name.
  createPayPalSubscriptionPaymentSession?: PayPalSessionFactory;
  createPayPalSubscriptionSession?: PayPalSessionFactory;
}

interface PayPalNamespace {
  createInstance?(options: {
    clientId: string;
    merchantId: string;
    partnerAttributionId?: string;
    components: string[];
    pageType: "checkout";
  }): Promise<PayPalSdkInstance>;
}

interface StripeEmbeddedCheckoutInstance {
  mount(element: CheckoutElement): void;
  destroy(): void;
}

interface StripeEmbeddedCheckoutOptions {
  fetchClientSecret: () => Promise<string>;
}

interface StripeInstance {
  // Renamed from initEmbeddedCheckout in Stripe.js dahlia.
  createEmbeddedCheckoutPage?(
    options: StripeEmbeddedCheckoutOptions
  ): Promise<StripeEmbeddedCheckoutInstance>;
  initEmbeddedCheckout?(
    options: StripeEmbeddedCheckoutOptions
  ): Promise<StripeEmbeddedCheckoutInstance>;
}

type StripeConstructor = (publishableKey: string) => StripeInstance;

/** @internal */
export type LoadScript = (src: string) => Promise<void>;

/**
 * The response of `GET /payments/config`.
 * @internal
 */
export interface PaymentsCheckoutConfig {
  paypal?: { script_url?: string };
  stripe?: { script_url?: string };
}

/** @internal */
export interface MountCheckoutDeps {
  completeCheckout: (checkoutId: string) => Promise<CompleteCheckoutResult>;
  getConfig: () => Promise<PaymentsCheckoutConfig>;
  loadScript: LoadScript;
}

async function scriptUrlFor(
  provider: "paypal" | "stripe",
  deps: MountCheckoutDeps
): Promise<string> {
  const value = (await deps.getConfig())?.[provider]?.script_url;
  let url: URL | undefined;
  try {
    url = value ? new URL(value) : undefined;
  } catch {
    url = undefined;
  }
  if (
    !url ||
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !ALLOWED_SCRIPT_HOSTS[provider].includes(url.hostname)
  ) {
    const name = provider === "paypal" ? "PayPal" : "Stripe";
    throw new Error(`The payments config has no valid ${name} script URL`);
  }
  return url.href;
}

function browserGlobals(): { paypal?: PayPalNamespace; Stripe?: StripeConstructor } {
  return window as unknown as { paypal?: PayPalNamespace; Stripe?: StripeConstructor };
}

const scriptLoads = new Map<string, Promise<void>>();

/**
 * Appends a script tag once per URL and resolves when it loads.
 * @internal
 */
export const loadScript: LoadScript = (src) => {
  let load = scriptLoads.get(src);
  if (!load) {
    load = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Forget the failure so a later mount can retry.
        scriptLoads.delete(src);
        script.remove();
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
    scriptLoads.set(src, load);
  }
  return load;
};

async function loadGlobal<T>(
  src: string,
  read: () => T | undefined,
  load: LoadScript
): Promise<T> {
  if (!read()) {
    await load(src);
  }
  const value = read();
  if (!value) {
    throw new Error(`${src} loaded but didn't define its global`);
  }
  return value;
}

// Stripe asks for a single Stripe instance per key.
const stripeInstances = new Map<string, StripeInstance>();
// Stripe allows one Embedded Checkout at a time, so mounts run in order and replace the last.
let stripeQueue: Promise<unknown> = Promise.resolve();
let activeStripeCheckout: CheckoutMount | null = null;

function mountStripe(
  element: CheckoutElement,
  scriptUrl: string,
  embedded: StripeEmbeddedCheckout,
  deps: MountCheckoutDeps
): Promise<CheckoutMount> {
  const mount = stripeQueue.then(async () => {
    const Stripe = await loadGlobal<StripeConstructor>(
      scriptUrl,
      () => browserGlobals().Stripe,
      deps.loadScript
    );
    let stripe = stripeInstances.get(embedded.publishable_key);
    if (!stripe) {
      stripe = Stripe(embedded.publishable_key);
      stripeInstances.set(embedded.publishable_key, stripe);
    }

    // Try the pre-dahlia name first, since dahlia and later reject the ui_mode Base44 sessions use.
    // A newer Stripe.js that the app loaded itself is still tried rather than refused.
    const create = stripe.initEmbeddedCheckout ?? stripe.createEmbeddedCheckoutPage;
    if (typeof create !== "function") {
      throw new Error("Stripe.js doesn't support Embedded Checkout");
    }
    activeStripeCheckout?.destroy();
    const checkout = await create.call(stripe, {
      fetchClientSecret: () => Promise.resolve(embedded.client_secret),
    });
    try {
      checkout.mount(element);
    } catch (error) {
      checkout.destroy();
      throw error;
    }

    let destroyed = false;
    const handle: CheckoutMount = {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (activeStripeCheckout === handle) activeStripeCheckout = null;
        checkout.destroy();
      },
    };
    activeStripeCheckout = handle;
    return handle;
  });
  stripeQueue = mount.catch(() => undefined);
  return mount;
}

async function mountPayPal(
  element: CheckoutElement,
  scriptUrl: string,
  checkoutId: string,
  currency: string,
  embedded: PayPalEmbeddedCheckout,
  options: MountCheckoutOptions,
  deps: MountCheckoutDeps
): Promise<CheckoutMount> {
  const paypal = await loadGlobal<PayPalNamespace>(
    scriptUrl,
    () => browserGlobals().paypal,
    deps.loadScript
  );
  if (typeof paypal.createInstance !== "function") {
    throw new Error(
      "Another PayPal JS SDK version is already loaded on this page. Remove it to use mountCheckout()."
    );
  }

  const subscription = embedded.intent === "subscription";
  const sdk = await paypal.createInstance({
    clientId: embedded.client_id,
    merchantId: embedded.merchant_id,
    // Sent only when set, since the backend returns null when no attribution ID is configured.
    ...(embedded.partner_attribution_id
      ? { partnerAttributionId: embedded.partner_attribution_id }
      : {}),
    components: [subscription ? "paypal-subscriptions" : "paypal-payments"],
    pageType: "checkout",
  });

  const methods = await sdk.findEligibleMethods({
    currencyCode: currency.toUpperCase(),
    ...(subscription ? { paymentFlow: "RECURRING_PAYMENT" as const } : {}),
  });
  if (!methods.isEligible("paypal")) {
    throw new Error("PayPal isn't available for this checkout");
  }

  const createSession = subscription
    ? sdk.createPayPalSubscriptionPaymentSession ??
      sdk.createPayPalSubscriptionSession
    : sdk.createPayPalOneTimePaymentSession;
  if (typeof createSession !== "function") {
    throw new Error("The loaded PayPal JS SDK can't create this checkout");
  }

  let destroyed = false;
  let completing = false;
  // App callbacks run only while mounted, and their own errors never reach PayPal or onError.
  const notify = (callback: () => void) => {
    if (destroyed) return;
    try {
      callback();
    } catch (error) {
      console.error("[Base44 SDK] A mountCheckout() callback threw", error);
    }
  };
  const button = document.createElement("paypal-button") as HTMLElement & {
    disabled?: boolean;
  };

  const session = createSession.call(sdk, {
    // Errors are reported here, not rethrown, so PayPal doesn't report them a second time.
    async onApprove() {
      completing = true;
      button.disabled = true;
      let result: CompleteCheckoutResult;
      try {
        // Runs even after destroy(), so an approved payment is still captured.
        result = await deps.completeCheckout(checkoutId);
      } catch (error) {
        // Re-enabled only on failure, since a paid order can't be approved again.
        completing = false;
        button.disabled = false;
        notify(() => options.onError?.(error));
        return;
      }
      completing = false;
      notify(() => options.onComplete?.(result));
    },
    onCancel() {
      notify(() => options.onCancel?.());
    },
    onError(error: unknown) {
      notify(() => options.onError?.(error));
    },
  });

  button.setAttribute("type", subscription ? "subscribe" : "pay");
  const onClick = () => {
    if (completing) return;
    // Not awaited before start(), which must run inside the click to open PayPal's popup.
    const id = Promise.resolve(
      subscription ? { subscriptionId: checkoutId } : { orderId: checkoutId }
    );
    const report = (error: unknown) => notify(() => options.onError?.(error));
    try {
      Promise.resolve(session.start({ presentationMode: "auto" }, id)).catch(report);
    } catch (error) {
      report(error);
    }
  };
  button.addEventListener("click", onClick);
  (element as unknown as HTMLElement).appendChild(button);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      button.removeEventListener("click", onClick);
      button.remove();
      session.destroy?.();
    },
  };
}

/**
 * Mounts the embedded checkout that createCheckout() returned.
 * @internal
 */
export async function mountCheckout(
  element: CheckoutElement,
  checkout: MountableCheckout,
  options: MountCheckoutOptions,
  deps: MountCheckoutDeps
): Promise<CheckoutMount> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("mountCheckout() requires a browser environment");
  }
  if (!element) {
    throw new Error("mountCheckout() requires an element to render in");
  }
  const embedded = checkout?.embedded;
  if (!embedded) {
    throw new Error(
      "This checkout isn't embedded. Create it with presentation: 'embedded', or send the buyer to its redirect_url."
    );
  }
  switch (embedded.provider) {
    case "stripe":
      return mountStripe(element, await scriptUrlFor("stripe", deps), embedded, deps);
    case "paypal":
      return mountPayPal(
        element,
        await scriptUrlFor("paypal", deps),
        checkout.checkout_id,
        checkout.currency,
        embedded,
        options,
        deps
      );
    default:
      throw new Error(
        `Embedded checkout isn't supported for provider ${(embedded as { provider: string }).provider}`
      );
  }
}
