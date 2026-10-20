import { AxiosInstance } from "axios";
import { IntegrationsModule } from "./integrations.types.js";
import { createCustomIntegrationsModule } from "./custom-integrations.js";

/**
 * Creates the integrations module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns Integrations module with dynamic access to integration endpoints
 * @internal
 */
export function createIntegrationsModule(
  axios: AxiosInstance,
  appId: string
): IntegrationsModule {
  // Create the custom integrations module once
  const customModule = createCustomIntegrationsModule(axios, appId);

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

        // Handle 'custom' specially - return the custom integrations module
        if (packageName === "custom") {
          return customModule;
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
              // This allows: client.integrations.PackageName.EndpointName(data)
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
  ) as IntegrationsModule;
}
