import axios from "axios";

export class Base44Error extends Error {
  status: number;
  code: string;
  data: any;
  originalError: unknown;

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

  // Add a method to safely serialize this error without circular references
  toJSON() {
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
 * Safely logs error information without circular references
 * @param {string} prefix - Prefix for the log message
 * @param {Error} error - The error to log
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
 * Redirects to the login page with the current URL as return destination
 * @param {string} serverUrl - Base server URL
 * @param {string|number} appId - Application ID
 */
function redirectToLogin(serverUrl: string, appId: string) {
  if (typeof window === "undefined") {
    return; // Can't redirect in non-browser environment
  }

  const currentUrl = encodeURIComponent(window.location.href);
  const loginUrl = `${serverUrl}/login?from_url=${currentUrl}&app_id=${appId}`;
  window.location.href = loginUrl;
}

/**
 * Creates an axios client with default configuration and interceptors
 * @param {Object} options - Client configuration options
 * @param {string} options.baseURL - Base URL for all requests
 * @param {Object} options.headers - Additional headers
 * @param {string} options.token - Auth token
 * @param {boolean} options.requiresAuth - Whether the application requires authentication
 * @param {string|number} options.appId - Application ID (needed for login redirect)
 * @param {string} options.serverUrl - Server URL (needed for login redirect)
 * @returns {import('axios').AxiosInstance} Configured axios instance
 */
export function createAxiosClient({
  baseURL,
  headers = {},
  token,
  requiresAuth = false,
  appId,
  serverUrl,
  interceptResponses = true,
}: {
  baseURL: string;
  headers?: Record<string, string>;
  token?: string;
  requiresAuth?: boolean;
  appId: string;
  serverUrl: string;
  interceptResponses?: boolean;
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
    return config;
  });

  // Handle responses
  if (interceptResponses) {
    client.interceptors.response.use(
      (response) => response.data,
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

        // Check for 403 Forbidden (authentication required) and redirect to login if requiresAuth is true
        console.log(
          requiresAuth,
          error.response?.status,
          typeof window !== "undefined"
        );
        if (
          requiresAuth &&
          error.response?.status === 403 &&
          typeof window !== "undefined"
        ) {
          console.log("Authentication required. Redirecting to login...");
          // Use a slight delay to allow the error to propagate first
          setTimeout(() => {
            redirectToLogin(serverUrl, appId);
          }, 100);
        }

        return Promise.reject(base44Error);
      }
    );
  }

  return client;
}
