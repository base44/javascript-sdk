import type {
  CheckoutElement,
  CheckoutMount,
  CheckoutTotals,
  CompleteCheckoutResult,
  MountableCheckout,
  MountCheckoutOptions,
  CheckoutOnClick,
  PaddleEmbeddedCheckout,
  PayPalCheckoutOnClick,
  PayPalEmbeddedCheckout,
  StripeEmbeddedCheckout,
} from "./payments.types.js";

type ScriptProvider = "paypal" | "stripe" | "paddle";

// The backend picks each script URL, but the script runs on the buyer's page, so only these hosts may load.
const ALLOWED_SCRIPT_HOSTS: Record<ScriptProvider, readonly string[]> = {
  paypal: ["www.paypal.com", "www.sandbox.paypal.com"],
  stripe: ["js.stripe.com"],
  paddle: ["cdn.paddle.com"],
};
const PROVIDER_NAMES: Record<ScriptProvider, string> = { paypal: "PayPal", stripe: "Stripe", paddle: "Paddle" };

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
  paypal?: {
    script_url?: string;
    // Set once the app's PayPal can take payments, so the button mounts before the order exists.
    button?: PayPalButtonConfig | null;
  };
  stripe?: { script_url?: string };
  paddle?: { script_url?: string };
}

type PayPalButtonConfig = Pick<PayPalEmbeddedCheckout, "client_id" | "merchant_id" | "partner_attribution_id">;

/** @internal */
export interface MountCheckoutDeps {
  completeCheckout: (checkoutId: string) => Promise<CompleteCheckoutResult>;
  getConfig: () => Promise<PaymentsCheckoutConfig>;
  loadScript: LoadScript;
}

async function scriptUrlFor(
  provider: ScriptProvider,
  deps: Pick<MountCheckoutDeps, "getConfig">
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
    throw new Error(`The payments config has no valid ${PROVIDER_NAMES[provider]} script URL`);
  }
  return url.href;
}

function browserGlobals(): { paypal?: PayPalNamespace; Stripe?: StripeConstructor; Paddle?: PaddleNamespace } {
  return window as unknown as { paypal?: PayPalNamespace; Stripe?: StripeConstructor; Paddle?: PaddleNamespace };
}

interface PaddleEvent {
  name?: string;
  error?: unknown;
  data?: { currency_code?: string; totals?: { subtotal?: number; discount?: number; tax?: number; total?: number } };
}

interface PaddleCustomer {
  email: string;
  address?: { countryCode: string; postalCode?: string };
}

interface PaddleCheckoutSettings {
  displayMode: "inline";
  frameTarget: string;
  frameInitialHeight: string;
  frameStyle: string;
  variant: "one-page";
  showAddDiscounts: boolean;
  theme: "light" | "dark";
  locale?: string;
}

interface PaddleNamespace {
  Environment: { set(environment: "sandbox"): void };
  Initialize(options: { token: string; eventCallback: (event: PaddleEvent) => void }): void;
  Checkout: {
    open(options: { transactionId: string; settings: PaddleCheckoutSettings; customer?: PaddleCustomer }): void;
    close(): void;
  };
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
      // Stripe's own form has no single button to disable.
      setDisabled: () => undefined,
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
  currency: string,
  embedded: PayPalEmbeddedCheckout,
  // A created checkout's id, or what an on-click checkout calls inside the click to create one.
  checkout: string | (() => Promise<string>),
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
  // Set once a payment goes through: another click would create and charge a second order.
  let paid = false;
  let starting = false;
  let checkoutId = typeof checkout === "string" ? checkout : undefined;
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
        if (!checkoutId) throw new Error("PayPal approved a checkout that wasn't created");
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
      paid = true;
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
    if (paid || completing || starting || button.disabled) return;
    starting = true;
    // Not awaited before start(), which must run inside the click to open PayPal's popup.
    const id = Promise.resolve()
      .then(typeof checkout === "string" ? () => checkout : checkout)
      .then((resolved) => {
        checkoutId = resolved;
        return subscription ? { subscriptionId: resolved } : { orderId: resolved };
      });
    const report = (error: unknown) => notify(() => options.onError?.(error));
    try {
      Promise.resolve(session.start({ presentationMode: "auto" }, id))
        .catch(report)
        .finally(() => {
          starting = false;
        });
    } catch (error) {
      starting = false;
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
    setDisabled(disabled) {
      // A payment being completed, or already made, keeps the button off whatever the app asks.
      if (!completing && !paid) button.disabled = disabled;
    },
  };
}

// Paddle.js takes one token per page and reports every checkout's events to the callback set then.
let paddleToken: string | null = null;
let onPaddleEvent: ((event: PaddleEvent) => void) | null = null;

/** Sets Paddle.js up for this seller on first use; a page serves one seller's token. */
function initializePaddle(Paddle: PaddleNamespace, embedded: PaddleEmbeddedCheckout): void {
  if (paddleToken === null) {
    if (embedded.environment === "sandbox") Paddle.Environment.set("sandbox");
    Paddle.Initialize({ token: embedded.client_token, eventCallback: (event) => onPaddleEvent?.(event) });
    paddleToken = embedded.client_token;
  } else if (paddleToken !== embedded.client_token) {
    throw new Error("Paddle is already set up on this page for another seller. Reload the page to check out.");
  }
}

type PaddleTarget = { checkoutId: string; embedded: PaddleEmbeddedCheckout };

const PADDLE_LOCALES = ["ar", "zh-Hans", "zh-TW", "da", "nl", "en", "fr", "de", "it", "ja", "ko", "no", "pl", "pt", "pt-BR", "tr", "ru", "es", "sv"];
let paddleFrames = 0;

/** The page's language when Paddle has it, so the checkout reads like the app; otherwise Paddle uses the browser's. */
function paddleLocale(): string | undefined {
  const lang = document.documentElement.lang;
  if (!lang) return undefined;
  return PADDLE_LOCALES.find((locale) => locale.toLowerCase() === lang.toLowerCase())
    ?? PADDLE_LOCALES.find((locale) => locale === lang.split("-")[0].toLowerCase());
}

/** Paddle has a light and a dark look per seller, and picks one only when told; apps mark dark mode on <html>. */
function paddleTheme(): "light" | "dark" {
  const root = document.documentElement;
  return root.classList.contains("dark") || root.dataset.theme === "dark" ? "dark" : "light";
}

/** The buyer Paddle opens with; with a country it shows only the card. Paddle takes an address only with an email. */
function paddleCustomer(embedded: PaddleEmbeddedCheckout): PaddleCustomer | undefined {
  if (!embedded.customer_email) return undefined;
  if (!embedded.customer_country) return { email: embedded.customer_email };
  return {
    email: embedded.customer_email,
    address: {
      countryCode: embedded.customer_country,
      ...(embedded.customer_postal_code ? { postalCode: embedded.customer_postal_code } : {}),
    },
  };
}

/** Paddle.js sends amounts in major units; the Payments API speaks minor units. */
function paddleTotals(event: PaddleEvent): CheckoutTotals | undefined {
  const totals = event.data?.totals;
  const currency = event.data?.currency_code;
  if (!totals || !currency) return undefined;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = (value?: number) => Math.round((value ?? 0) * 10 ** digits);
  return {
    currency: currency.toLowerCase(),
    subtotal: minor(totals.subtotal),
    discount: minor(totals.discount),
    tax: minor(totals.tax),
    total: minor(totals.total),
  };
}

/**
 * Renders Paddle's one-page checkout inside `element`, like Stripe's embedded checkout. A created
 * checkout renders at once; an on-click one draws a button first and creates the checkout when the
 * buyer clicks it. Paddle's frame shows no order summary, so the page shows it from `onTotalsChange`.
 */
async function mountPaddle(
  element: CheckoutElement,
  scriptUrl: string,
  resolve: () => Promise<PaddleTarget>,
  options: MountCheckoutOptions,
  deps: MountCheckoutDeps,
  onClick: boolean
): Promise<CheckoutMount> {
  const Paddle = await loadGlobal<PaddleNamespace>(scriptUrl, () => browserGlobals().Paddle, deps.loadScript);

  let destroyed = false;
  let open = false;
  let starting = false;
  let completing = false;
  // Set once the payment goes through: the transaction is paid, so the button stays off.
  let paid = false;
  let checkoutId: string | undefined;
  const notify = (callback: () => void) => {
    if (destroyed) return;
    try {
      callback();
    } catch (error) {
      console.error("[Base44 SDK] A mountCheckout() callback threw", error);
    }
  };
  const handle = async (event: PaddleEvent) => {
    const totals = paddleTotals(event);
    if (totals && options.onTotalsChange) notify(() => options.onTotalsChange?.(totals));
    if (event.name === "checkout.completed") {
      completing = true;
      button.disabled = true;
      let result: CompleteCheckoutResult;
      try {
        if (!checkoutId) throw new Error("Paddle completed a checkout that wasn't created");
        // Paddle charged inside its own window; this asks the backend, which reads Paddle, whether it did.
        result = await deps.completeCheckout(checkoutId);
      } catch (error) {
        completing = false;
        button.disabled = false;
        notify(() => options.onError?.(error));
        return;
      }
      completing = false;
      paid = true;
      notify(() => options.onComplete?.(result));
    } else if (event.name === "checkout.closed") {
      open = false;
      if (!paid && !completing) notify(() => options.onCancel?.());
    } else if (event.name === "checkout.error") {
      notify(() => options.onError?.(event.error ?? event));
    }
  };

  const host = element as unknown as HTMLElement;
  const frame = document.createElement("div");
  frame.className = `base44-paddle-checkout-${++paddleFrames}`;
  frame.setAttribute("data-base44-checkout-frame", "paddle");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Buy now";
  button.setAttribute("data-base44-checkout", "paddle");
  const start = async () => {
    if (paid || completing || open || starting || button.disabled) return;
    starting = true;
    try {
      const target = await resolve();
      initializePaddle(Paddle, target.embedded);
      checkoutId = target.checkoutId;
      onPaddleEvent = (event) => void handle(event);
      open = true;
      button.remove();
      host.appendChild(frame);
      const locale = paddleLocale();
      const customer = paddleCustomer(target.embedded);
      Paddle.Checkout.open({
        transactionId: target.embedded.transaction_id,
        settings: {
          displayMode: "inline",
          frameTarget: frame.className,
          frameInitialHeight: "450",
          // Paddle needs at least 312px and its footer in view.
          frameStyle: "width: 100%; min-width: 312px; background-color: transparent; border: none;",
          variant: "one-page",
          // The app prices discounts itself through createCheckout, so Paddle's own coupon field would be a second one.
          showAddDiscounts: false,
          theme: paddleTheme(),
          ...(locale ? { locale } : {}),
        },
        ...(customer ? { customer } : {}),
      });
    } catch (error) {
      open = false;
      frame.remove();
      if (onClick && !destroyed) host.appendChild(button);
      notify(() => options.onError?.(error));
    } finally {
      starting = false;
    }
  };
  const listener = () => void start();
  button.addEventListener("click", listener);
  if (onClick) host.appendChild(button);
  else await start();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      button.removeEventListener("click", listener);
      button.remove();
      if (open) Paddle.Checkout.close();
      frame.remove();
    },
    setDisabled(disabled) {
      if (!completing && !paid) button.disabled = disabled;
    },
  };
}

function paddleTarget(checkout: MountableCheckout | null | undefined): PaddleTarget {
  const embedded = checkout?.embedded;
  if (!checkout || embedded?.provider !== "paddle") {
    throw new Error("createCheckout() returned a checkout that isn't an embedded Paddle checkout.");
  }
  return { checkoutId: checkout.checkout_id, embedded };
}

/** The new checkout's id, refused unless it is the checkout the button was drawn for. */
function onClickCheckoutId(
  spec: PayPalCheckoutOnClick,
  button: PayPalButtonConfig
): () => Promise<string> {
  return async () => {
    const checkout = await spec.createCheckout();
    const embedded = checkout?.embedded;
    if (
      embedded?.provider !== "paypal" ||
      embedded.intent !== spec.intent ||
      embedded.merchant_id !== button.merchant_id ||
      checkout.currency?.toLowerCase() !== spec.currency.toLowerCase()
    ) {
      throw new Error(
        "createCheckout() returned a checkout that doesn't match the PayPal button. Check its provider, intent and currency."
      );
    }
    return checkout.checkout_id;
  };
}

/**
 * Fetches the payments config and loads the provider's script ahead of mountCheckout().
 * @internal
 */
export async function preloadCheckout(
  provider: ScriptProvider,
  deps: Pick<MountCheckoutDeps, "getConfig" | "loadScript">
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const read = () =>
    provider === "paypal" ? browserGlobals().paypal : provider === "paddle" ? browserGlobals().Paddle : browserGlobals().Stripe;
  try {
    if (!read()) {
      await deps.loadScript(await scriptUrlFor(provider, deps));
    }
  } catch {
    // A hint only: mountCheckout() fetches and loads again and reports the failure.
  }
}

/**
 * Mounts the embedded checkout that createCheckout() returned.
 * @internal
 */
export async function mountCheckout(
  element: CheckoutElement,
  checkout: MountableCheckout | CheckoutOnClick,
  options: MountCheckoutOptions,
  deps: MountCheckoutDeps
): Promise<CheckoutMount> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("mountCheckout() requires a browser environment");
  }
  if (!element) {
    throw new Error("mountCheckout() requires an element to render in");
  }
  if ("createCheckout" in checkout) {
    if (checkout.provider === "paddle") {
      if (typeof checkout.createCheckout !== "function") throw new Error("A Paddle checkout on click needs createCheckout()");
      const create = checkout.createCheckout;
      return mountPaddle(element, await scriptUrlFor("paddle", deps), async () => paddleTarget(await create()), options, deps, true);
    }
    return mountPayPalOnClick(element, checkout, options, deps);
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
        checkout.currency,
        embedded,
        checkout.checkout_id,
        options,
        deps
      );
    case "paddle": {
      const target = paddleTarget(checkout);
      return mountPaddle(element, await scriptUrlFor("paddle", deps), () => Promise.resolve(target), options, deps, false);
    }
    default:
      throw new Error(
        `Embedded checkout isn't supported for provider ${(embedded as { provider: string }).provider}`
      );
  }
}

async function mountPayPalOnClick(
  element: CheckoutElement,
  spec: PayPalCheckoutOnClick,
  options: MountCheckoutOptions,
  deps: MountCheckoutDeps
): Promise<CheckoutMount> {
  if (spec.provider !== "paypal" || typeof spec.createCheckout !== "function") {
    throw new Error("Only PayPal can create its checkout on click");
  }
  const scriptUrl = await scriptUrlFor("paypal", deps);
  const button = (await deps.getConfig())?.paypal?.button;
  if (!button?.client_id || !button.merchant_id) {
    throw new Error("PayPal isn't ready to take payments in this app yet");
  }
  const embedded: PayPalEmbeddedCheckout = { provider: "paypal", ...button, intent: spec.intent };
  return mountPayPal(
    element, scriptUrl, spec.currency, embedded, onClickCheckoutId(spec, button), options, deps
  );
}
