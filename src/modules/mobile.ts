/**
 * Mobile module for Base44 SDK.
 *
 * Provides mobile native capabilities like push notifications.
 */

import { AxiosInstance } from "axios";
import {
  MobileModule,
  NotificationResult,
  SendNotificationParams,
} from "./mobile.types";

/**
 * Creates the mobile module for the Base44 SDK.
 *
 * @param axios - Axios instance for API requests
 * @param appId - Application ID
 * @returns Mobile module with native mobile capabilities
 * @internal
 */
export function createMobileModule(
  axios: AxiosInstance,
  appId: string
): MobileModule {
  return {
    async sendNotification(
      params: SendNotificationParams
    ): Promise<NotificationResult> {
      const response = await axios.post<NotificationResult>(
        `/api/apps/${appId}/mobile/notifications`,
        params
      );
      return response.data;
    },
  };
}
