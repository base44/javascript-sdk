import axios from "axios";
import { isInIFrame } from "./common.js";
import { v4 as uuidv4 } from "uuid";
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

  // Add origin URL in browser environment
  client.interceptors.request.use((config) => {
    if (typeof window !== "undefined") {
      config.headers.set("X-Origin-URL", window.location.href);
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
        const message =
          error.response?.data?.message ||
          error.response?.data?.detail ||
          error.message;

        const base44Error = new Base44Error(
          message,
          error.response?.status,
          error.response?.data?.code,
          error.response?.data,
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
