import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import nock from "nock";
import { Base44Error, createClient } from "../../src/index.ts";
import type {
  MountableCheckout,
  PayPalEmbeddedCheckout,
  StripeEmbeddedCheckout,
} from "../../src/modules/payments.types.ts";

describe("Payments module", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const base = `/api/apps/${appId}/payments`;
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
      token: "user-token",
      serviceToken: "service-token",
    });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("createCheckout posts the snake_case body with the service token", async () => {
    const params = {
      items: [{ name: "T-shirt", amount: 2500, quantity: 2 }],
      currency: "usd",
      success_path: "/thank-you",
      presentation: "redirect" as const,
    };
    const response = {
      checkout_id: "cs_123",
      currency: "usd",
      amount_total: 5000,
      redirect_url: "https://checkout.stripe.com/c/cs_123",
      embedded: null,
    };
    scope
      .post(`${base}/checkout-sessions`, params)
      .matchHeader("authorization", "Bearer service-token")
      .reply(200, response);

    const checkout = await base44.asServiceRole.payments.createCheckout(params);

    expect(checkout).toEqual(response);
    expect(scope.isDone()).toBe(true);
  });

  test("completeCheckout posts to the encoded checkout id with the user token", async () => {
    scope
      .post(`${base}/checkout-sessions/ORDER%2F1/complete`)
      .matchHeader("authorization", "Bearer user-token")
      .reply(200, { checkout_id: "ORDER/1", status: "paid" });

    const result = await base44.payments.completeCheckout("ORDER/1");

    expect(result).toEqual({ checkout_id: "ORDER/1", status: "paid" });
    expect(scope.isDone()).toBe(true);
  });

  test("listPurchases sends filters as query parameters and omits unset ones", async () => {
    const page = {
      items: [{ checkout_id: "cs_1", status: "paid", items: [] }],
      next_cursor: "next",
    };
    scope
      .get(`${base}/purchases`)
      .query({ buyer_email: "buyer@example.com", limit: "10" })
      .reply(200, page);

    const result = await base44.asServiceRole.payments.listPurchases({
      buyer_email: "buyer@example.com",
      limit: 10,
      cursor: undefined,
    });

    expect(result).toEqual(page);
    expect(scope.isDone()).toBe(true);
  });

  test("listPurchases works without params", async () => {
    scope.get(`${base}/purchases`).reply(200, { items: [], next_cursor: null });

    const result = await base44.payments.listPurchases();

    expect(result.next_cursor).toBeNull();
    expect(scope.isDone()).toBe(true);
  });

  test("refund posts the payment, amount and idempotency key", async () => {
    const params = { payment_id: "pi_1", amount: 500, idempotency_key: "r-1" };
    scope.post(`${base}/refunds`, params).reply(200, {
      refund_id: "re_1",
      payment_id: "pi_1",
      amount: 500,
      currency: "usd",
      status: "succeeded",
    });

    const refund = await base44.asServiceRole.payments.refund(params);

    expect(refund.refund_id).toBe("re_1");
    expect(scope.isDone()).toBe(true);
  });

  test("cancelSubscription sends at_period_end, and an empty body by default", async () => {
    const state = {
      subscription_id: "sub_1",
      status: "active",
      cancel_at_period_end: true,
    };
    scope
      .post(`${base}/subscriptions/sub_1/cancel`, { at_period_end: true })
      .reply(200, state)
      .post(`${base}/subscriptions/sub_1/cancel`, {})
      .reply(200, { ...state, status: "canceled", cancel_at_period_end: false });

    await expect(
      base44.asServiceRole.payments.cancelSubscription("sub_1", {
        at_period_end: true,
      })
    ).resolves.toEqual(state);
    await expect(
      base44.asServiceRole.payments.cancelSubscription("sub_1")
    ).resolves.toMatchObject({ status: "canceled" });
    expect(scope.isDone()).toBe(true);
  });

  test("pauseSubscription and resumeSubscription post to their routes", async () => {
    scope
      .post(`${base}/subscriptions/sub_1/pause`)
      .reply(200, { subscription_id: "sub_1", status: "paused", cancel_at_period_end: false })
      .post(`${base}/subscriptions/sub_1/resume`)
      .reply(200, { subscription_id: "sub_1", status: "active", cancel_at_period_end: false });

    await expect(
      base44.asServiceRole.payments.pauseSubscription("sub_1")
    ).resolves.toMatchObject({ status: "paused" });
    await expect(
      base44.asServiceRole.payments.resumeSubscription("sub_1")
    ).resolves.toMatchObject({ status: "active" });
    expect(scope.isDone()).toBe(true);
  });

  test("errors reject with the envelope's code and message", async () => {
    scope.post(`${base}/refunds`).reply(502, {
      error: { code: "refund_failed", message: "Outcome unknown", details: {} },
    });

    const error = await base44.asServiceRole.payments
      .refund({ payment_id: "pi_1", amount: 500, idempotency_key: "r-1" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(Base44Error);
    expect(error.status).toBe(502);
    expect(error.code).toBe("refund_failed");
    expect(error.message).toBe("Outcome unknown");
  });

  test("id methods reject an empty id without a request", async () => {
    await expect(base44.payments.completeCheckout("")).rejects.toThrow(
      "Checkout ID is required"
    );
    await expect(
      base44.asServiceRole.payments.pauseSubscription("")
    ).rejects.toThrow("Subscription ID is required");
  });

  test("the user module has no service-only methods", () => {
    expect("createCheckout" in base44.payments).toBe(false);
    expect("refund" in base44.payments).toBe(false);
    expect("mountCheckout" in base44.asServiceRole.payments).toBe(false);
  });
});

// A minimal DOM, since the unit tests run in node without jsdom.
class FakeElement {
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];
  listeners: Record<string, Array<() => void>> = {};
  parent: FakeElement | null = null;
  constructor(public tagName: string) {}
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, listener: () => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
  }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((c) => c !== this);
      this.parent = null;
    }
  }
  click() {
    (this.listeners.click ?? []).forEach((l) => l());
  }
}

describe("mountCheckout", () => {
  // Fresh module state per test, since script loads and Stripe mounts are page-wide.
  let mountCheckout: typeof import("../../src/modules/payments-checkout.ts").mountCheckout;
  let container: FakeElement;
  let loadScript: ReturnType<typeof vi.fn>;
  let completeCheckout: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    ({ mountCheckout } = await import("../../src/modules/payments-checkout.ts"));
    container = new FakeElement("div");
    vi.stubGlobal("document", {
      createElement: (tag: string) => new FakeElement(tag),
    });
    vi.stubGlobal("window", {});
    loadScript = vi.fn().mockResolvedValue(undefined);
    completeCheckout = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const paypalEmbedded = (
    overrides: Partial<PayPalEmbeddedCheckout> = {}
  ): PayPalEmbeddedCheckout => ({
    provider: "paypal",
    client_id: "client-1",
    merchant_id: "MERCHANT1",
    partner_attribution_id: null,
    intent: "capture",
    environment: "sandbox",
    ...overrides,
  });

  function installPayPal() {
    const session = {
      start: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    let callbacks: any;
    const sdk = {
      findEligibleMethods: vi.fn().mockResolvedValue({ isEligible: () => true }),
      createPayPalOneTimePaymentSession: vi.fn((cb) => ((callbacks = cb), session)),
      createPayPalSubscriptionPaymentSession: vi.fn((cb) => ((callbacks = cb), session)),
    };
    const paypal = { createInstance: vi.fn().mockResolvedValue(sdk) };
    loadScript.mockImplementation(async () => {
      (window as any).paypal = paypal;
    });
    return { paypal, sdk, session, callbacks: () => callbacks };
  }

  const deps = () => ({ completeCheckout, loadScript });

  const stripeCheckout = (): MountableCheckout => ({
    checkout_id: "cs_1",
    currency: "usd",
    embedded: {
      provider: "stripe",
      publishable_key: "pk_test_1",
      client_secret: "cs_secret",
    } satisfies StripeEmbeddedCheckout,
  });

  test("renders a PayPal button that starts the server-created order", async () => {
    const { paypal, sdk, session } = installPayPal();
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };

    const mount = await mountCheckout(container as any, checkout, {}, deps());

    expect(loadScript).toHaveBeenCalledWith(
      "https://www.sandbox.paypal.com/web-sdk/v6/core"
    );
    expect(paypal.createInstance).toHaveBeenCalledWith({
      clientId: "client-1",
      merchantId: "MERCHANT1",
      components: ["paypal-payments"],
      pageType: "checkout",
    });
    expect(sdk.findEligibleMethods).toHaveBeenCalledWith({ currencyCode: "USD" });

    const button = container.children[0];
    expect(button.tagName).toBe("paypal-button");
    expect(button.attributes.type).toBe("pay");

    button.click();
    expect(session.start).toHaveBeenCalledWith(
      { presentationMode: "auto" },
      expect.any(Promise)
    );
    await expect(session.start.mock.calls[0][1]).resolves.toEqual({ orderId: "ORDER1" });

    mount.destroy();
    expect(container.children).toHaveLength(0);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  test("uses the subscriptions component and passes the partner attribution id", async () => {
    const { paypal, sdk, session } = installPayPal();
    const checkout = {
      checkout_id: "I-SUB1",
      currency: "usd",
      embedded: paypalEmbedded({
        intent: "subscription",
        environment: "live",
        partner_attribution_id: "BN-CODE",
      }),
    };

    await mountCheckout(container as any, checkout, {}, deps());

    expect(loadScript).toHaveBeenCalledWith("https://www.paypal.com/web-sdk/v6/core");
    expect(paypal.createInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerAttributionId: "BN-CODE",
        components: ["paypal-subscriptions"],
      })
    );
    expect(sdk.findEligibleMethods).toHaveBeenCalledWith({
      currencyCode: "USD",
      paymentFlow: "RECURRING_PAYMENT",
    });
    expect(sdk.createPayPalSubscriptionPaymentSession).toHaveBeenCalled();

    container.children[0].click();
    await expect(session.start.mock.calls[0][1]).resolves.toEqual({
      subscriptionId: "I-SUB1",
    });
  });

  test("completes the checkout on approve and reports declines to onError", async () => {
    const { callbacks } = installPayPal();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };
    await mountCheckout(container as any, checkout, { onComplete, onError }, deps());

    completeCheckout.mockResolvedValueOnce({ checkout_id: "ORDER1", status: "paid" });
    await callbacks().onApprove({ orderId: "ORDER1" });
    expect(completeCheckout).toHaveBeenCalledWith("ORDER1");
    expect(onComplete).toHaveBeenCalledWith({ checkout_id: "ORDER1", status: "paid" });

    const declined = Object.assign(new Error("declined"), { code: "payment_declined" });
    completeCheckout.mockRejectedValueOnce(declined);
    await expect(callbacks().onApprove({ orderId: "ORDER1" })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(declined);
    // The button stays so the buyer can try again.
    expect(container.children).toHaveLength(1);
  });

  test("rejects when PayPal isn't eligible", async () => {
    const { sdk } = installPayPal();
    sdk.findEligibleMethods.mockResolvedValue({ isEligible: () => false });
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };

    await expect(mountCheckout(container as any, checkout, {}, deps())).rejects.toThrow(
      "PayPal isn't available"
    );
    expect(container.children).toHaveLength(0);
  });

  test("rejects a PayPal checkout without an environment", async () => {
    const embedded = { ...paypalEmbedded(), environment: undefined } as any;
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded };

    await expect(mountCheckout(container as any, checkout, {}, deps())).rejects.toThrow(
      "missing embedded.environment"
    );
    expect(loadScript).not.toHaveBeenCalled();
  });

  test("rejects when another PayPal SDK version is on the page", async () => {
    (window as any).paypal = { Buttons: () => {} };
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };

    await expect(mountCheckout(container as any, checkout, {}, deps())).rejects.toThrow(
      "Another PayPal JS SDK version"
    );
  });

  test("reports cancel and start failures, and ignores clicks while completing", async () => {
    const { session, callbacks } = installPayPal();
    const onCancel = vi.fn();
    const onError = vi.fn();
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };
    await mountCheckout(container as any, checkout, { onCancel, onError }, deps());
    const button = container.children[0] as FakeElement & { disabled?: boolean };

    callbacks().onCancel({});
    expect(onCancel).toHaveBeenCalledTimes(1);

    const popupBlocked = new Error("popup blocked");
    session.start.mockRejectedValueOnce(popupBlocked);
    button.click();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(popupBlocked));

    let finish!: (value: unknown) => void;
    completeCheckout.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const approving = callbacks().onApprove({ orderId: "ORDER1" });
    expect(button.disabled).toBe(true);
    button.click();
    expect(session.start).toHaveBeenCalledTimes(1);
    finish({ checkout_id: "ORDER1", status: "paid" });
    await approving;
    // A paid order can't be approved again, so the button stays disabled.
    expect(button.disabled).toBe(true);
  });

  test("re-enables the button after a failed completion", async () => {
    const { callbacks } = installPayPal();
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };
    await mountCheckout(container as any, checkout, { onError: vi.fn() }, deps());
    const button = container.children[0] as FakeElement & { disabled?: boolean };

    completeCheckout.mockRejectedValueOnce(new Error("declined"));
    await callbacks().onApprove({ orderId: "ORDER1" });

    expect(button.disabled).toBe(false);
  });

  test("an onComplete that throws isn't reported as a failed payment", async () => {
    const { callbacks } = installPayPal();
    const onError = vi.fn();
    const onComplete = vi.fn(() => {
      throw new Error("navigation failed");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };
    await mountCheckout(container as any, checkout, { onComplete, onError }, deps());
    completeCheckout.mockResolvedValueOnce({ checkout_id: "ORDER1", status: "paid" });

    await expect(callbacks().onApprove({ orderId: "ORDER1" })).resolves.toBeUndefined();

    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("still completes an approved payment after destroy, without calling back", async () => {
    const { callbacks } = installPayPal();
    const onComplete = vi.fn();
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };
    const mount = await mountCheckout(container as any, checkout, { onComplete }, deps());
    completeCheckout.mockResolvedValueOnce({ checkout_id: "ORDER1", status: "paid" });

    mount.destroy();
    await callbacks().onApprove({ orderId: "ORDER1" });

    expect(completeCheckout).toHaveBeenCalledWith("ORDER1");
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("rejects a PayPal checkout from the other environment than the loaded script", async () => {
    installPayPal();
    await mountCheckout(
      container as any,
      { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() },
      {},
      deps()
    );

    await expect(
      mountCheckout(
        container as any,
        { checkout_id: "ORDER2", currency: "usd", embedded: paypalEmbedded({ environment: "live" }) },
        {},
        deps()
      )
    ).rejects.toThrow("sandbox script is already loaded");
  });

  test("falls back to createPayPalSubscriptionSession", async () => {
    const { sdk } = installPayPal();
    delete (sdk as any).createPayPalSubscriptionPaymentSession;
    (sdk as any).createPayPalSubscriptionSession = vi.fn(() => ({ start: vi.fn() }));
    const checkout = {
      checkout_id: "I-SUB1",
      currency: "usd",
      embedded: paypalEmbedded({ intent: "subscription" }),
    };

    await mountCheckout(container as any, checkout, {}, deps());

    expect((sdk as any).createPayPalSubscriptionSession).toHaveBeenCalled();
  });

  test("mounts Stripe Embedded Checkout with the client secret", async () => {
    const embeddedCheckout = { mount: vi.fn(), destroy: vi.fn() };
    const stripe = { initEmbeddedCheckout: vi.fn().mockResolvedValue(embeddedCheckout) };
    const Stripe = vi.fn(() => stripe);
    loadScript.mockImplementation(async () => {
      (window as any).Stripe = Stripe;
    });
    const mount = await mountCheckout(container as any, stripeCheckout(), {}, deps());

    expect(loadScript).toHaveBeenCalledWith("https://js.stripe.com/v3/");
    expect(Stripe).toHaveBeenCalledWith("pk_test_1");
    const options = stripe.initEmbeddedCheckout.mock.calls[0][0];
    await expect(options.fetchClientSecret()).resolves.toBe("cs_secret");
    expect(embeddedCheckout.mount).toHaveBeenCalledWith(container);

    mount.destroy();
    mount.destroy();
    expect(embeddedCheckout.destroy).toHaveBeenCalledTimes(1);
  });

  test("falls back to Stripe's renamed createEmbeddedCheckoutPage", async () => {
    const embeddedCheckout = { mount: vi.fn(), destroy: vi.fn() };
    const stripe = { createEmbeddedCheckoutPage: vi.fn().mockResolvedValue(embeddedCheckout) };
    (window as any).Stripe = vi.fn(() => stripe);

    await mountCheckout(container as any, stripeCheckout(), {}, deps());

    // Already on the page, so the script isn't loaded again.
    expect(loadScript).not.toHaveBeenCalled();
    expect(stripe.createEmbeddedCheckoutPage).toHaveBeenCalled();
  });

  test("destroys the previous Stripe checkout before mounting another", async () => {
    const first = { mount: vi.fn(), destroy: vi.fn() };
    const second = { mount: vi.fn(), destroy: vi.fn() };
    const stripe = {
      initEmbeddedCheckout: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    };
    const Stripe = vi.fn(() => stripe);
    (window as any).Stripe = Stripe;

    // Started together, as React strict mode does.
    const [a, b] = await Promise.all([
      mountCheckout(container as any, stripeCheckout(), {}, deps()),
      mountCheckout(container as any, stripeCheckout(), {}, deps()),
    ]);

    expect(first.destroy).toHaveBeenCalledTimes(1);
    // Stripe needs the previous instance gone before it creates the next one.
    expect(first.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      stripe.initEmbeddedCheckout.mock.invocationCallOrder[1]
    );
    expect(second.mount).toHaveBeenCalledWith(container);
    expect(Stripe).toHaveBeenCalledTimes(1);
    a.destroy();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    b.destroy();
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });

  test("mounts the next Stripe checkout after one fails to create", async () => {
    const embeddedCheckout = { mount: vi.fn(), destroy: vi.fn() };
    const stripe = {
      initEmbeddedCheckout: vi
        .fn()
        .mockRejectedValueOnce(new Error("expired session"))
        .mockResolvedValueOnce(embeddedCheckout),
    };
    (window as any).Stripe = vi.fn(() => stripe);

    await expect(mountCheckout(container as any, stripeCheckout(), {}, deps())).rejects.toThrow(
      "expired session"
    );
    await mountCheckout(container as any, stripeCheckout(), {}, deps());

    expect(embeddedCheckout.mount).toHaveBeenCalledWith(container);
  });

  test("rejects a Stripe.js without Embedded Checkout", async () => {
    (window as any).Stripe = vi.fn(() => ({}));

    await expect(mountCheckout(container as any, stripeCheckout(), {}, deps())).rejects.toThrow(
      "doesn't support Embedded Checkout"
    );
  });

  test("destroys the Stripe checkout when mounting it fails", async () => {
    const embeddedCheckout = {
      mount: vi.fn(() => {
        throw new Error("bad element");
      }),
      destroy: vi.fn(),
    };
    (window as any).Stripe = vi.fn(() => ({
      initEmbeddedCheckout: vi.fn().mockResolvedValue(embeddedCheckout),
    }));

    await expect(mountCheckout(container as any, stripeCheckout(), {}, deps())).rejects.toThrow(
      "bad element"
    );
    expect(embeddedCheckout.destroy).toHaveBeenCalledTimes(1);
  });

  test("rejects a redirect checkout", async () => {
    const checkout = { checkout_id: "cs_1", currency: "usd", embedded: null };

    await expect(mountCheckout(container as any, checkout, {}, deps())).rejects.toThrow(
      "isn't embedded"
    );
  });

  test("rejects outside a browser", async () => {
    vi.stubGlobal("window", undefined);
    const checkout = { checkout_id: "ORDER1", currency: "usd", embedded: paypalEmbedded() };

    await expect(mountCheckout(container as any, checkout, {}, deps())).rejects.toThrow(
      "requires a browser"
    );
  });
});

describe("loadScript", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("adds one async script per URL and retries after a failure", async () => {
    vi.resetModules();
    const { loadScript } = await import("../../src/modules/payments-checkout.ts");
    const scripts: any[] = [];
    vi.stubGlobal("document", {
      createElement: () => ({ remove: vi.fn() }),
      head: { appendChild: (script: any) => scripts.push(script) },
    });

    const first = loadScript("https://example.com/a.js");
    expect(loadScript("https://example.com/a.js")).toBe(first);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({ src: "https://example.com/a.js", async: true });

    scripts[0].onerror();
    await expect(first).rejects.toThrow("Failed to load https://example.com/a.js");
    expect(scripts[0].remove).toHaveBeenCalled();

    const retry = loadScript("https://example.com/a.js");
    expect(scripts).toHaveLength(2);
    scripts[1].onload();
    await expect(retry).resolves.toBeUndefined();
  });
});
