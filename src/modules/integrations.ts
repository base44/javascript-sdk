import { AxiosInstance } from "axios";

/**
 * Creates the integrations module for the Base44 SDK
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string|number} appId - Application ID
 * @returns {Object} Integrations module
 */
export function createIntegrationsModule(axios: AxiosInstance, appId: string) {
  // Using nested Proxy objects to handle dynamic package and endpoint names
  return new Proxy(
    {},
    {
      get(target, packageName) {
        // Skip internal properties
        if (
          typeof packageName !== "string" ||
          packageName === "then" ||
          packageName.startsWith("_")
        ) {
          return undefined;
        }

        // Create a proxy for integration endpoints
        return new Proxy(
          {},
          {
            get(target, endpointName) {
              // Skip internal properties
              if (
                typeof endpointName !== "string" ||
                endpointName === "then" ||
                endpointName.startsWith("_")
              ) {
                return undefined;
              }

              // Return a function that calls the integration endpoint
              return async (data: Record<string, any>) => {
                // Validate input
                if (typeof data === "string") {
                  throw new Error(
                    `Integration ${endpointName} must receive an object with named parameters, received: ${data}`
                  );
                }

                let formData: FormData | Record<string, any>;
                let contentType: string;

                // Handle file uploads with FormData
                if (
                  data instanceof FormData ||
                  (data &&
                    Object.values(data).some((value) => value instanceof File))
                ) {
                  formData = new FormData();
                  Object.keys(data).forEach((key) => {
                    if (data[key] instanceof File) {
                      formData.append(key, data[key], data[key].name);
                    } else if (
                      typeof data[key] === "object" &&
                      data[key] !== null
                    ) {
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

                // For Core package
                if (packageName === "Core") {
                  return axios.post(
                    `/apps/${appId}/integration-endpoints/Core/${endpointName}`,
                    formData || data,
                    { headers: { "Content-Type": contentType } }
                  );
                }

                // For other packages
                return axios.post(
                  `/apps/${appId}/integration-endpoints/installable/${packageName}/integration-endpoints/${endpointName}`,
                  formData || data,
                  { headers: { "Content-Type": contentType } }
                );
              };
            },
          }
        );
      },
    }
  );
}
