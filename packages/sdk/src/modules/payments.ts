import { AxiosInstance } from "axios";
import {
  loadScript,
  mountCheckout,
  PaymentsCheckoutConfig,
  preloadCheckout,
} from "./payments-checkout.js";
import {
  CancelSubscriptionOptions,
  CompleteCheckoutResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  ListPurchasesResult,
  PaymentsModule,
  RefundParams,
  RefundResult,
  ServiceRolePaymentsModule,
  ServiceRoleListPurchasesParams,
  SubscriptionResult,
} from "./payments.types.js";

function requireId(value: string, name: string): string {
  if (!value || typeof value !== "string") {
    throw new Error(`${name} is required and must be a string`);
  }
  return encodeURIComponent(value);
}

function createPaymentsRequests(axios: AxiosInstance, appId: string) {
  const base = `/apps/${appId}/payments`;
  return {
    async completeCheckout(checkoutId: string): Promise<CompleteCheckoutResult> {
      const id = requireId(checkoutId, "Checkout ID");
      return axios.post(`${base}/checkout-sessions/${id}/complete`);
    },

    async listPurchases(
      params: ServiceRoleListPurchasesParams = {}
    ): Promise<ListPurchasesResult> {
      return axios.get(`${base}/purchases`, { params });
    },

    async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
      return axios.post(`${base}/checkout-sessions`, params);
    },

    async refund(params: RefundParams): Promise<RefundResult> {
      return axios.post(`${base}/refunds`, params);
    },

    async cancelSubscription(
      subscriptionId: string,
      options: CancelSubscriptionOptions = {}
    ): Promise<SubscriptionResult> {
      const id = requireId(subscriptionId, "Subscription ID");
      return axios.post(`${base}/subscriptions/${id}/cancel`, options);
    },

    async pauseSubscription(subscriptionId: string): Promise<SubscriptionResult> {
      const id = requireId(subscriptionId, "Subscription ID");
      return axios.post(`${base}/subscriptions/${id}/pause`);
    },

    async resumeSubscription(subscriptionId: string): Promise<SubscriptionResult> {
      const id = requireId(subscriptionId, "Subscription ID");
      return axios.post(`${base}/subscriptions/${id}/resume`);
    },
  };
}

/**
 * Creates the payments module for anonymous and user authentication.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns Payments module for the browser
 * @internal
 */
export function createPaymentsModule(
  axios: AxiosInstance,
  appId: string
): PaymentsModule {
  const requests = createPaymentsRequests(axios, appId);
  // One fetch per client, retried on the next mount if it fails.
  let config: Promise<PaymentsCheckoutConfig> | undefined;
  const getConfig = () => {
    config ??= (
      axios.get(`/apps/${appId}/payments/config`) as Promise<PaymentsCheckoutConfig>
    ).catch((error) => {
      config = undefined;
      throw error;
    });
    return config;
  };
  return {
    completeCheckout: requests.completeCheckout,
    listPurchases: requests.listPurchases,
    mountCheckout(element, checkout, options = {}) {
      return mountCheckout(element, checkout, options, {
        completeCheckout: requests.completeCheckout,
        getConfig,
        loadScript,
      });
    },
    preloadCheckout(provider) {
      return preloadCheckout(provider, { getConfig, loadScript });
    },
  };
}

/**
 * Creates the payments module for service role authentication.
 *
 * @param axios - Axios instance (should be service role client)
 * @param appId - Application ID
 * @returns Payments module for backend functions
 * @internal
 */
export function createServiceRolePaymentsModule(
  axios: AxiosInstance,
  appId: string
): ServiceRolePaymentsModule {
  return createPaymentsRequests(axios, appId);
}
