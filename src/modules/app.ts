import { AxiosInstance } from "axios";
import { AppModule } from "./app.types";

/**
 * Creates the app module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns App module for reading the app's own configuration
 * @internal
 */
export function createAppModule(
  axios: AxiosInstance,
  appId: string
): AppModule {
  return {
    async getPublicSettings() {
      return axios.get(`/apps/public/prod/public-settings/by-id/${appId}`);
    },
  };
}
