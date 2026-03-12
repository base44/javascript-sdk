import { AxiosInstance } from "axios";
import { FunctionsFetchInit, FunctionsModule } from "./functions.types";

/**
 * Creates the functions module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns Functions module with methods to invoke custom backend functions
 * @internal
 */
export function createFunctionsModule(
  axios: AxiosInstance,
  appId: string
): FunctionsModule {
  const joinBaseUrl = (base: string | undefined, path: string) => {
    if (!base) return path;
    return `${String(base).replace(/\/$/, "")}${path}`;
  };

  const toHeaders = (inputHeaders?: HeadersInit): Headers => {
    const headers = new Headers();

    const appendHeaders = (source?: Record<string, unknown>) => {
      if (!source) return;
      Object.entries(source).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          headers.set(key, String(value));
        }
      });
    };

    // Append common headers from axios defaults
    appendHeaders(axios.defaults.headers?.common as Record<string, unknown>);

    if (inputHeaders) {
      new Headers(inputHeaders).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    return headers;
  };

  return {
    // Invoke a custom backend function by name
    async invoke(functionName: string, data: Record<string, any>) {
      // Validate input
      if (typeof data === "string") {
        throw new Error(
          `Function ${functionName} must receive an object with named parameters, received: ${data}`
        );
      }

      let formData: FormData | Record<string, any>;
      let contentType: string;

      // Handle file uploads with FormData
      if (
        data instanceof FormData ||
        (data && Object.values(data).some((value) => value instanceof File))
      ) {
        formData = new FormData();
        Object.keys(data).forEach((key) => {
          if (data[key] instanceof File) {
            formData.append(key, data[key], data[key].name);
          } else if (typeof data[key] === "object" && data[key] !== null) {
            formData.append(key, JSON.stringify(data[key]));
          } else {
            formData.append(key, data[key]);
          }
        });
        contentType = "multipart/form-data";
      } else {
        formData = data;
        contentType = "application/json";
      }

      return axios.post(
        `/apps/${appId}/functions/${functionName}`,
        formData || data,
        { headers: { "Content-Type": contentType } }
      );
    },

    // Fetch a backend function endpoint directly (supports streaming).
    async fetch(path: string, init: FunctionsFetchInit = {}) {
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      const primaryPath = `/functions${normalizedPath}`;

      const headers = toHeaders(init.headers);

      const requestInit: RequestInit = {
        ...init,
        headers,
      };

      const response = await fetch(
        joinBaseUrl(axios.defaults.baseURL, primaryPath),
        requestInit
      );

      return response;
    },
  };
}
