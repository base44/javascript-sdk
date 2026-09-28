import axios, { AxiosHeaders } from "axios";
import { isInIFrame } from "./common.js";
import { v4 as uuidv4 } from "uuid";
import { getAnalyticsSessionId } from "../modules/analytics.js";
import type { Base44ErrorJSON } from "./axios-client.types.js";

/**
 * Custom error class for Base44 SDK errors.
 *
 * This error is thrown when API requests fail. It extends the standard `Error` class and includes additional information about the HTTP status, error code, and response data from the server.
 *
 * @example
 * ```typescript
 * try {
 *   await client.entities.Todo.get('invalid-id');
 * } catch (error) {
 *   if (error instanceof Base44Error) {
 *     console.error('Status:', error.status);      // 404
 *     console.error('Message:', error.message);    // "Not found"
 *     console.error('Code:', error.code);          // "NOT_FOUND"
 *     console.error('Data:', error.data);          // Full response data
 *   }
 * }
 * ```
 *
 */
export class Base44Error extends Error {
  /**
   * HTTP status code of the error.
   */
  status: number;

  /**
   * Error code from the API.
   */
  code: string;

  /**
   * Full response data from the server containing error details.
   */
  data: any;

  /**
   * The original error object from Axios.
   */
  originalError: unknown;

  /**
   * Creates a new Base44Error instance.
   *
   * @param message - Human-readable error message
   * @param status - HTTP status code
   * @param code - Error code from the API
   * @param data - Full response data from the server
   * @param originalError - Original axios error object
   * @internal
   */
  constructor(
    message: string,
    status: number,
    code: string,
    data: any,
    originalError: unknown
  ) {
    super(message);
    this.name = "Base44Error";
    this.status = status;
    this.code = code;
    this.data = data;
    this.originalError = originalError;
  }

  /**
   * Serializes the error to a JSON-safe object.
   *
   * Useful for logging or sending error information to external services
   * without circular reference issues.
   *
   * @returns JSON-safe representation of the error.
   *
   * @example
   * ```typescript
   * try {
   *   await client.entities.Todo.get('invalid-id');
   * } catch (error) {
   *   if (error instanceof Base44Error) {
   *     const json = error.toJSON();
   *     console.log(json);
   *     // {
   *     //   name: "Base44Error",
   *     //   message: "Not found",
   *     //   status: 404,
   *     //   code: "NOT_FOUND",
   *     //   data: { ... }
   *     // }
   *   }
   * }
   * ```
   */
  toJSON(): Base44ErrorJSON {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      data: this.data,
    };
  }
}

/**
 * Safely logs error information without circular references.
 *
 * @param prefix - Prefix for the log message
 * @param error - The error to log
 * @internal
 */
function safeErrorLog(prefix: string, error: unknown) {
  if (error instanceof Base44Error) {
    console.error(`${prefix} ${error.status}: ${error.message}`);
    if (error.data) {
      try {
        console.error("Error data:", JSON.stringify(error.data, null, 2));
      } catch (e) {
        console.error("Error data: [Cannot stringify error data]");
      }
    }
  } else {
    console.error(
      `${prefix} ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const REDACTED = "[REDACTED]";

const CREDENTIAL_HEADERS = [
  "Authorization",
  "on-behalf-of",
  "Base44-Service-Authorization",
  // Signed proof that the caller passed the IP allowlist; replayable if logged.
  "Base44-State",
];

// Request body fields that hold secrets (see the bodies built in modules/auth.ts).
const SECRET_BODY_KEYS = new Set([
  "password",
  "current_password",
  "new_password",
  "reset_token",
  "turnstile_token",
  "otp_code",
  "access_token",
  "refresh_token",
  "token",
]);

/**
 * Returns a copy of request headers with credential values replaced.
 *
 * @param headers - The request's headers, left unchanged
 * @returns A new AxiosHeaders instance
 * @internal
 */
function redactHeaders(headers: unknown) {
  // Not `AxiosHeaders.from`, which returns an AxiosHeaders argument as-is.
  const copy = new AxiosHeaders(headers as any);
  for (const name of CREDENTIAL_HEADERS) {
    if (copy.has(name)) {
      copy.set(name, REDACTED);
    }
  }
  return copy;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function redactSecretKeys(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    return value.map((item) => redactSecretKeys(item, seen));
  }
  if (!isPlainObject(value) || seen.has(value)) return value;
  seen.add(value);
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = SECRET_BODY_KEYS.has(key.toLowerCase())
      ? REDACTED
      : redactSecretKeys(item, seen);
  }
  return copy;
}

/**
 * Returns a copy of a request body with secret fields replaced.
 *
 * Handles both a serialized JSON string (the usual case by the time a request
 * has been sent) and a plain object. Other bodies, such as `FormData`, are
 * returned unchanged.
 *
 * @param data - The request body, left unchanged
 * @returns The redacted body
 * @internal
 */
function redactBody(data: unknown): unknown {
  if (typeof data === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return data;
    }
    return typeof parsed === "object" && parsed !== null
      ? JSON.stringify(redactSecretKeys(parsed, new WeakSet()))
      : data;
  }
  return redactSecretKeys(data, new WeakSet());
}

/**
 * Removes credentials from a failed request's error before app code sees it.
 *
 * An axios error carries its request config and the raw Node request, so
 * logging it (for example `console.log(error)`) printed the bearer token.
 * The config is replaced with a redacted copy, so the object axios sent is not
 * changed, and the raw request is removed.
 *
 * Never throws: a failure here must not replace the original error.
 *
 * @param error - The rejection value to scrub
 * @internal
 */
function sanitizeError(error: unknown) {
  if (!error || typeof error !== "object") return;
  try {
    const target = error as Record<string, any>;
    const config = target.config;
    if (config && typeof config === "object") {
      const redactedConfig = {
        ...config,
        headers: redactHeaders(config.headers),
        data: redactBody(config.data),
      };
      target.config = redactedConfig;
      if (target.response?.config === config) {
        target.response.config = redactedConfig;
      }
    }
    // The Node request object also holds the raw header block (`_header`).
    delete target.request;
    if (target.response && typeof target.response === "object") {
      delete target.response.request;
    }
  } catch {
    /* leave the error as it is */
  }
}

/**
 * Creates an axios client with default configuration and interceptors.
 *
 * Sets up an axios instance with:
 * - Default headers
 * - Authentication token injection
 * - Response data unwrapping
 * - Error transformation to Base44Error
 * - iframe messaging support
 *
 * @param options - Client configuration options
 * @returns Configured axios instance
 * @internal
 */
export function createAxiosClient({
  baseURL,
  headers = {},
  token,
  interceptResponses = true,
  onError,
}: {
  baseURL: string;
  headers?: Record<string, string>;
  token?: string;
  interceptResponses?: boolean;
  onError?: (error: Error) => void;
}) {
  const client = axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
  });

  // Add token to requests if available
  if (token) {
    client.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }

  // Registered first so it also covers clients that skip the Base44Error wrapper.
  client.interceptors.response.use(undefined, (error) => {
    sanitizeError(error);
    return Promise.reject(error);
  });

  // Add origin URL in browser environment
  client.interceptors.request.use((config) => {
    // `window.location` is absent on React Native (where `window` still exists),
    // so guard on it before reading `.href`.
    if (typeof window !== "undefined") {
      if (window.location) {
        config.headers.set("X-Origin-URL", window.location.href);
      }
      // On unauthenticated requests, attach a stable anonymous visitor id so the
      // backend can support anonymous agent access (conversation grouping + ownership).
      // Authenticated requests are identified by their Authorization header instead.
      if (!config.headers.get("Authorization")) {
        config.headers.set("X-Base44-Anonymous-Id", getAnalyticsSessionId());
      }
    }
    const requestId = uuidv4();
    (config as any).requestId = requestId;
    if (isInIFrame) {
      try {
        window.parent.postMessage(
          {
            type: "api-request-start",
            requestId,
            data: {
              url: baseURL + config.url,
              method: config.method,
              body:
                config.data instanceof FormData
                  ? "[FormData object]"
                  : config.data,
            },
          },
          "*"
        );
      } catch {
        /* skip the logging */
      }
    }
    return config;
  });

  // Handle responses
  if (interceptResponses) {
    client.interceptors.response.use(
      (response) => {
        const requestId = (response.config as any)?.requestId;
        try {
          if (isInIFrame && requestId) {
            window.parent.postMessage(
              {
                type: "api-request-end",
                requestId,
                data: {
                  statusCode: response.status,
                  response: response.data,
                },
              },
              "*"
            );
          }
        } catch {
          /* do nothing */
        }

        return response.data;
      },
      (error) => {
        const data = error.response?.data;
        const message =
          data?.error?.message || data?.message || data?.detail || error.message;

        const base44Error = new Base44Error(
          message,
          error.response?.status,
          data?.error?.code ??
            data?.code ??
            error.response?.headers?.get?.("x-base44-connector-error") ??
            error.response?.headers?.["x-base44-connector-error"],
          data,
          error
        );

        // Log errors in development
        if (process.env.NODE_ENV !== "production") {
          safeErrorLog("[Base44 SDK Error]", base44Error);
        }

        onError?.(base44Error);

        return Promise.reject(base44Error);
      }
    );
  }

  return client;
}

// Re-export types
export type { Base44ErrorJSON } from "./axios-client.types.js";
