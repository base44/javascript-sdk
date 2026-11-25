import type {
  CheckoutElement,
  CheckoutMount,
  CompleteCheckoutResult,
  MountableCheckout,
  MountCheckoutOptions,
  PayPalCheckoutOnClick,
  PayPalEmbeddedCheckout,
  StripeEmbeddedCheckout,
} from "./payments.types.js";

// The backend picks each script URL, but the script runs on the buyer's page, so only these hosts may load.
const ALLOWED_SCRIPT_HOSTS: Record<"paypal" | "stripe" | "wix", readonly string[]> = {
  paypal: ["www.paypal.com", "www.sandbox.paypal.com"],
  stripe: ["js.stripe.com"],
  wix: ["tpa.wixapps.net"],
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

type WixPaymentResult = { status: "succeeded" | "canceled" };

interface WixPaymentElement {
  mount(element: CheckoutElement): Promise<void>;
  on(event: "ready" | "loaderror", handler: () => void): void;
  // Resolves to "canceled" for a declined payment too.
  confirmPayment(): Promise<WixPaymentResult>;
  destroy(): void;
}

type WixGetAccessToken = (request?: { renew?: boolean }) => Promise<string>;

type WixPaymentElements = (options: { getAccessToken: WixGetAccessToken; locale: string }) => {
  create(type: "checkout", options: { intentId: string }): WixPaymentElement;
};

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
  wix?: { script_url?: string };
}

type PayPalButtonConfig = Pick<PayPalEmbeddedCheckout, "client_id" | "merchant_id" | "partner_attribution_id">;

/** @internal */
export interface MountCheckoutDeps {
  completeCheckout: (checkoutId: string) => Promise<CompleteCheckoutResult>;
  getConfig: () => Promise<PaymentsCheckoutConfig>;
  loadScript: LoadScript;
}

async function scriptUrlFor(
  provider: "paypal" | "stripe" | "wix",
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
    const name = { paypal: "PayPal", stripe: "Stripe", wix: "Wix" }[provider];
    throw new Error(`The payments config has no valid ${name} script URL`);
  }
  return url.href;
}

interface BrowserGlobals {
  paypal?: PayPalNamespace;
  Stripe?: StripeConstructor;
  wpe?: WixPaymentElements;
}

function browserGlobals(): BrowserGlobals {
  return window as unknown as BrowserGlobals;
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

const WIX_TOKEN_URL = "https://www.wixapis.com/oauth2/token";
// Renewed this long before it expires, as the Payment Element does.
const WIX_TOKEN_MARGIN_MS = 60_000;

interface WixTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// One visitor per client ID for the page, so remounts and other checkouts reuse its token.
const wixVisitors = new Map<string, { tokens?: WixTokens; pending?: Promise<WixTokens> }>();

async function requestWixTokens(
  body:
    | { clientId: string; grantType: "anonymous" }
    | { refresh_token: string; grantType: "refresh_token" }
): Promise<WixTokens> {
  const response = await fetch(WIX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`The Wix ${body.grantType} token request failed with status ${response.status}`);
  }
  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function renewWixTokens(clientId: string, tokens: WixTokens | undefined): Promise<WixTokens> {
  if (tokens) {
    try {
      return await requestWixTokens({ refresh_token: tokens.refreshToken, grantType: "refresh_token" });
    } catch {
      // The refresh token expired or was revoked, so a new visitor is minted.
    }
  }
  return requestWixTokens({ clientId, grantType: "anonymous" });
}

/** Gives the Payment Element an anonymous visitor's access token for the client. */
function wixVisitorAccessToken(clientId: string): WixGetAccessToken {
  return async ({ renew = false } = {}) => {
    const visitor = wixVisitors.get(clientId) ?? {};
    wixVisitors.set(clientId, visitor);
    // Expired now, so other callers wait for the renewed token instead of getting this one.
    if (renew && visitor.tokens) visitor.tokens = { ...visitor.tokens, expiresAt: 0 };
    const { tokens } = visitor;
    if (tokens && tokens.expiresAt - WIX_TOKEN_MARGIN_MS > Date.now()) {
      return tokens.accessToken;
    }
    visitor.pending ??= renewWixTokens(clientId, tokens)
      .then((renewed) => (visitor.tokens = renewed))
      .finally(() => (visitor.pending = undefined));
    return (await visitor.pending).accessToken;
  };
}

async function mountWix(
  element: CheckoutElement,
  scriptUrl: string,
  checkoutId: string,
  clientId: string,
  options: MountCheckoutOptions,
  deps: MountCheckoutDeps
): Promise<CheckoutMount> {
  const wpe = await loadGlobal<WixPaymentElements>(
    scriptUrl,
    () => browserGlobals().wpe,
    deps.loadScript
  );
  const locale = (document.documentElement?.lang || navigator.language || "en").split("-")[0];
  const getAccessToken = wixVisitorAccessToken(clientId);
  const paymentElement = wpe({ getAccessToken, locale }).create("checkout", {
    intentId: checkoutId,
  });

  let destroyed = false;
  let ready = false;
  let paying = false;
  // Set once a payment succeeds or the element rejects one: either way it refuses another.
  let finished = false;
  const notify = (callback: () => void) => {
    if (destroyed) return;
    try {
      callback();
    } catch (error) {
      console.error("[Base44 SDK] A mountCheckout() callback threw", error);
    }
  };
  paymentElement.on("ready", () => {
    ready = true;
    notify(() => options.onReadyChange?.(true));
  });
  // The element fires ready again once it recovers.
  paymentElement.on("loaderror", () => {
    ready = false;
    notify(() => options.onReadyChange?.(false));
  });

  const box = document.createElement("div");
  (element as unknown as HTMLElement).appendChild(box);
  try {
    await paymentElement.mount(box);
  } catch (error) {
    box.remove();
    paymentElement.destroy();
    throw error;
  }

  return {
    pay() {
      if (destroyed || !ready || paying || finished) return Promise.resolve();
      paying = true;
      // The executor runs now, so confirmPayment() is called inside the app's click, before any await.
      return new Promise<WixPaymentResult>((resolve) => resolve(paymentElement.confirmPayment()))
        .then(async ({ status }) => {
          if (status !== "succeeded") {
            notify(() => options.onCancel?.());
            return;
          }
          finished = true;
          // Runs even after destroy(), so a paid order is still completed.
          const result = await deps.completeCheckout(checkoutId);
          notify(() => options.onComplete?.(result));
        })
        .catch((error: unknown) => {
          finished = true;
          notify(() => options.onError?.(error));
        })
        .finally(() => {
          paying = false;
        });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      box.remove();
      paymentElement.destroy();
    },
    // The app owns the Pay button, so it disables its own.
    setDisabled: () => undefined,
  };
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
  provider: "paypal" | "stripe" | "wix",
  deps: Pick<MountCheckoutDeps, "getConfig" | "loadScript">
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const read = () =>
    ({ paypal: browserGlobals().paypal, stripe: browserGlobals().Stripe, wix: browserGlobals().wpe })[provider];
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
  checkout: MountableCheckout | PayPalCheckoutOnClick,
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
    case "wix":
      if (!embedded.client_id) {
        throw new Error("This Base44 Payments checkout has no client ID to render with");
      }
      return mountWix(
        element,
        await scriptUrlFor("wix", deps),
        checkout.checkout_id,
        embedded.client_id,
        options,
        deps
      );
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
