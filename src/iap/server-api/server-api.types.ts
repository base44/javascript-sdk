/**
 * The App Store Server API surface.
 *
 * Everything here needs an **In-App Purchase key**, from App Store Connect
 * under Users and Access, Integrations. It is not an App Store Connect team
 * key: Apple scopes each key family to its own APIs. The key downloads once,
 * so it belongs in Base44 secrets rather than in code.
 *
 * None of it is needed to verify a purchase or to know whether a customer is
 * entitled. It only unlocks talking *to* Apple.
 */

/** Credentials for the App Store Server API. */
export interface IapServerApiConfig {
  /** The key's identifier, shown next to it in App Store Connect. */
  keyId: string;
  /** Your issuer id, from the Integrations page. */
  issuerId: string;
  /**
   * The private key, as downloaded.
   *
   * The whole `.p8` file contents including the `-----BEGIN PRIVATE KEY-----`
   * lines. Store it in Base44 secrets, never in source.
   */
  privateKeyP8: string;
}

/** Whether the app delivered what the customer paid for. */
export type IapDeliveryStatus =
  | "DELIVERED"
  | "UNDELIVERED_QUALITY_ISSUE"
  | "UNDELIVERED_WRONG_ITEM"
  | "UNDELIVERED_SERVER_OUTAGE"
  | "UNDELIVERED_OTHER";

/** What the app would prefer Apple do about a refund. */
export type IapRefundPreference = "DECLINE" | "GRANT_FULL" | "GRANT_PRORATED";

/**
 * Consumption data for a disputed purchase.
 *
 * Apple's consent rules are strict, and they are the app's responsibility, not
 * this SDK's: consent must be freely given, specific, informed and
 * unambiguous, must not be gathered through the App Tracking Transparency
 * prompt, and must be disclosed in the app's privacy labels. Without consent,
 * the correct action is to send nothing at all.
 */
export interface ConsumptionRequestBody {
  /**
   * Whether the customer consented to sharing this data.
   *
   * Must be `true`. Apple rejects the call otherwise, and sending data without
   * consent would be wrong regardless.
   */
  customerConsented: true;
  /** Whether the app delivered the purchase. */
  deliveryStatus: IapDeliveryStatus;
  /** Whether a free sample, trial or functional description was offered before purchase. */
  sampleContentProvided: boolean;
  /** What the app would prefer Apple do. */
  refundPreference?: IapRefundPreference;
  /**
   * How much of the purchase was used, in thousandths of a percent (0 to 100000).
   *
   * Must be 0 unless `deliveryStatus` is `DELIVERED`, and must be omitted
   * entirely for auto-renewable subscriptions.
   */
  consumptionPercentage?: number;
}

/** The token identifying a test notification Apple was asked to send. */
export interface TestNotificationResult {
  /** Pass this to `getTestNotificationStatus` to see what happened. */
  testNotificationToken: string;
}

/** Why one delivery attempt did or did not work. */
export type SendAttemptResult =
  | "SUCCESS"
  | "CIRCULAR_REDIRECT"
  | "INVALID_RESPONSE"
  | "NO_RESPONSE"
  | "OTHER"
  | "PREMATURE_CLOSE"
  | "SOCKET_ISSUE"
  | "TIMED_OUT"
  | "TLS_ISSUE"
  | "UNSUCCESSFUL_HTTP_RESPONSE_CODE"
  | "UNSUPPORTED_CHARSET";

/** One attempt Apple made to deliver a notification. */
export interface SendAttempt {
  /** When Apple tried. */
  attemptDate: number;
  /** How it went. */
  sendAttemptResult: SendAttemptResult;
}

/** What became of a test notification. */
export interface TestNotificationStatus {
  /** Every attempt Apple made, in order. */
  sendAttempts: SendAttempt[];
  /** The payload Apple sent, so it can be replayed. */
  signedPayload?: string;
}

/**
 * Calls to Apple's own servers.
 *
 * Always present on the module. Every method throws
 * `IAP_SERVER_API_NOT_CONFIGURED` until `serverApi` credentials are supplied,
 * so the shape of the module never depends on configuration.
 */
export interface IapServerApiModule {
  /**
   * Answers Apple's request for consumption data about a disputed purchase.
   *
   * Apple allows **12 hours** in production and only **5 minutes** in sandbox,
   * and only wants an answer if the customer consented. With no consent flow,
   * do not call this — sending nothing is the correct behaviour, not a
   * failure.
   *
   * @param transactionId - The disputed transaction.
   * @param body - The consumption data, including the customer's consent.
   * @returns Promise that resolves when Apple has accepted the data.
   * @throws {Error} An `IapApiError` when Apple rejects the call, or an `IapConfigError` when no key is configured.
   *
   * @example
   * ```typescript
   * // Answer a refund request the customer consented to
   * await iap.serverApi.sendConsumptionInformation(transactionId, {
   *   customerConsented: true,
   *   deliveryStatus: "DELIVERED",
   *   sampleContentProvided: false,
   *   consumptionPercentage: 100000,
   * });
   * ```
   */
  sendConsumptionInformation(
    transactionId: string,
    body: ConsumptionRequestBody
  ): Promise<void>;

  /**
   * Asks Apple to send a test notification to the configured URL.
   *
   * The quickest way to prove a webhook is reachable, before any real purchase
   * exists. Apple sends to the URL registered for whichever environment the
   * key belongs to, so the URLs have to be set up first.
   *
   * @returns Promise resolving to the token identifying this test.
   * @throws {Error} An `IapApiError` when Apple rejects the call, or an `IapConfigError` when no key is configured.
   *
   * @example
   * ```typescript
   * // Prove the webhook works
   * const { testNotificationToken } = await iap.serverApi.requestTestNotification();
   * const status = await iap.serverApi.getTestNotificationStatus(testNotificationToken);
   * console.log(status.sendAttempts.at(-1)?.sendAttemptResult);
   * ```
   */
  requestTestNotification(): Promise<TestNotificationResult>;

  /**
   * Reports what became of a test notification.
   *
   * `SUCCESS` on the last attempt means the webhook is reachable and answered
   * correctly. Anything else names the problem — a timeout, a TLS failure, a
   * bad status code.
   *
   * @param testNotificationToken - The token from `requestTestNotification`.
   * @returns Promise resolving to every delivery attempt, and the payload Apple sent.
   * @throws {Error} An `IapApiError` when Apple rejects the call, or an `IapConfigError` when no key is configured.
   *
   * @example
   * ```typescript
   * // Check a test notification, allowing for Apple's delay
   * const status = await iap.serverApi.getTestNotificationStatus(token);
   * for (const attempt of status.sendAttempts) {
   *   console.log(new Date(attempt.attemptDate), attempt.sendAttemptResult);
   * }
   * ```
   */
  getTestNotificationStatus(
    testNotificationToken: string
  ): Promise<TestNotificationStatus>;
}
