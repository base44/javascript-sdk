/**
 * Talking to Apple's App Store Server API.
 *
 * Three things about Apple's behaviour that shape this file:
 *
 * - **The environment is not a setting, it is a discovery.** A transaction
 *   exists in exactly one of production or sandbox. Apple's own guidance is to
 *   try production and, on error `4040010`, try sandbox. The same code twice
 *   means the id exists in neither.
 * - **`Retry-After` is an absolute UNIX millisecond timestamp**, not a delay.
 *   Treating it as a number of seconds would mean retrying almost immediately,
 *   straight into the same rate limit.
 * - `/inApps` is case-sensitive, and TLS 1.2 or later is required.
 *
 * `fetch` is injected rather than reached for, because `nock` — what the rest
 * of this repo tests HTTP with — hooks Node's http module and does not
 * intercept native `fetch` at all.
 *
 * @internal
 */
import { IapApiError, IapConfigError } from "../errors.js";
import { getFetch } from "../runtime/webcrypto.js";
import type { Clock } from "../runtime/clock.js";
import { mintServerApiToken } from "./jwt.js";
import type {
  ConsumptionRequestBody,
  IapServerApiConfig,
  IapServerApiModule,
  TestNotificationResult,
  TestNotificationStatus,
} from "./server-api.types.js";

const PRODUCTION_BASE = "https://api.storekit.apple.com";
const SANDBOX_BASE = "https://api.storekit-sandbox.apple.com";

/** Apple's "this transaction id is not in this environment" code. */
const TRANSACTION_NOT_FOUND = 4040010;
/** Apple's rate-limit code. */
const RATE_LIMIT_EXCEEDED = 4290000;

/** Inputs to {@link createServerApiClient}. */
export interface CreateServerApiOptions {
  /** Credentials, when the app supplied them. */
  readonly config?: IapServerApiConfig;
  /** The app's bundle id, which Apple requires in the token. */
  readonly bundleId: string;
  /** The clock. */
  readonly clock: Clock;
  /** Whether sandbox should be tried first. */
  readonly preferSandbox?: boolean;
  /** The `fetch` to use. Injected for tests. */
  readonly fetchImpl?: typeof fetch;
}

interface AppleErrorBody {
  errorCode?: number;
  errorMessage?: string;
}

export function createServerApiClient(
  options: CreateServerApiOptions
): IapServerApiModule {
  function requireConfig(): IapServerApiConfig {
    if (!options.config) {
      throw new IapConfigError(
        "IAP_SERVER_API_NOT_CONFIGURED",
        "this call needs App Store Server API credentials. Add `serverApi` to the " +
          "in-app purchase configuration with the keyId, issuerId and privateKeyP8 " +
          "of an In-App Purchase key from App Store Connect. Verifying purchases " +
          "and checking entitlements do not need it."
      );
    }
    return options.config;
  }

  /** The base URLs to try, in order. */
  function bases(): readonly string[] {
    return options.preferSandbox
      ? [SANDBOX_BASE, PRODUCTION_BASE]
      : [PRODUCTION_BASE, SANDBOX_BASE];
  }

  async function callOnce(
    base: string,
    method: "GET" | "PUT" | "POST",
    path: string,
    body?: unknown
  ): Promise<{ status: number; text: string; retryAfter?: number }> {
    const config = requireConfig();
    const token = await mintServerApiToken(
      config,
      options.bundleId,
      options.clock()
    );
    const doFetch = options.fetchImpl ?? getFetch();

    const response = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const header = response.headers.get("Retry-After");
    return {
      status: response.status,
      text: await response.text(),
      // Absolute epoch milliseconds, per Apple. Not a duration.
      retryAfter: header ? Number(header) : undefined,
    };
  }

  function parseError(text: string): AppleErrorBody {
    try {
      return JSON.parse(text) as AppleErrorBody;
    } catch {
      return {};
    }
  }

  /**
   * Calls Apple, falling back to the other environment when the transaction id
   * is not in the first one tried.
   */
  async function call<T>(
    method: "GET" | "PUT" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const candidates = bases();
    let lastError: IapApiError | undefined;

    for (let i = 0; i < candidates.length; i += 1) {
      const { status, text, retryAfter } = await callOnce(
        candidates[i],
        method,
        path,
        body
      );

      if (status >= 200 && status < 300) {
        if (text.length === 0) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return undefined as T;
        }
      }

      const apple = parseError(text);

      if (apple.errorCode === RATE_LIMIT_EXCEEDED || status === 429) {
        throw new IapApiError(
          "IAP_API_RATE_LIMITED",
          "Apple rate-limited this call. `retryAfter` is an absolute timestamp, " +
            "not a delay — compare it against Date.now().",
          {
            httpStatus: status,
            appleErrorCode: apple.errorCode,
            appleErrorMessage: apple.errorMessage,
            retryAfter,
          }
        );
      }

      if (apple.errorCode === TRANSACTION_NOT_FOUND) {
        lastError = new IapApiError(
          "IAP_API_TRANSACTION_NOT_FOUND",
          "Apple does not have this transaction id in either the production or " +
            "the sandbox environment.",
          {
            httpStatus: status,
            appleErrorCode: apple.errorCode,
            appleErrorMessage: apple.errorMessage,
          }
        );
        // Try the other environment. A transaction lives in exactly one.
        continue;
      }

      throw new IapApiError(
        "IAP_API_ERROR",
        apple.errorMessage ?? `Apple answered ${status}`,
        {
          httpStatus: status,
          appleErrorCode: apple.errorCode,
          appleErrorMessage: apple.errorMessage,
        }
      );
    }

    throw (
      lastError ??
      new IapApiError("IAP_API_ERROR", "Apple could not be reached in either environment")
    );
  }

  return {
    async sendConsumptionInformation(
      transactionId: string,
      body: ConsumptionRequestBody
    ): Promise<void> {
      if (body?.customerConsented !== true) {
        // Apple rejects this itself, but failing here says why, and sending
        // consumption data without consent would be wrong regardless.
        throw new IapConfigError(
          "IAP_INVALID_CONFIG",
          "consumption information may only be sent when the customer has " +
            "consented. Set customerConsented to true, or send nothing."
        );
      }
      await call<void>(
        "PUT",
        `/inApps/v2/transactions/consumption/${encodeURIComponent(transactionId)}`,
        body
      );
    },

    async requestTestNotification(): Promise<TestNotificationResult> {
      return call<TestNotificationResult>("POST", "/inApps/v1/notifications/test");
    },

    async getTestNotificationStatus(
      testNotificationToken: string
    ): Promise<TestNotificationStatus> {
      return call<TestNotificationStatus>(
        "GET",
        `/inApps/v1/notifications/test/${encodeURIComponent(testNotificationToken)}`
      );
    },
  };
}
