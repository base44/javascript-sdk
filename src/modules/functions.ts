import { AxiosInstance } from "axios";
import { extractSnapshotIdFromHost } from "../utils/extract-snapshot-id-from-host.js";

/**
 * Creates the functions module for the Base44 SDK
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string|number} appId - Application ID
 * @returns {Object} Functions module
 */
export function createFunctionsModule(axios: AxiosInstance, appId: string) {
  // Using nested Proxy objects to handle dynamic function names
  return {
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

      // Extract functions version from the current URL host
      const functionsVersion = extractSnapshotIdFromHost();

      return axios.post(
        `/apps/${appId}/functions/${functionName}`,
        formData || data,
        { 
          headers: { 
            "Content-Type": contentType,
            "X-Functions-Version": functionsVersion
          } 
        }
      );
    },
  };
}
