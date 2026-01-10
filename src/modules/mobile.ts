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
 * Validates notification parameters against character limits.
 * @param params - Notification parameters to validate
 * @throws Error if any parameter exceeds its limit
 */
function validateNotificationParams(params: SendNotificationParams): void {
  if (params.title.length > 100) {
    throw new Error(
      `Title must be 100 characters or less (current: ${params.title.length})`
    );
  }

  if (params.content.length > 500) {
    throw new Error(
      `Content must be 500 characters or less (current: ${params.content.length})`
    );
  }

  if (params.actionLabel && params.actionLabel.length > 50) {
    throw new Error(
      `Action label must be 50 characters or less (current: ${params.actionLabel.length})`
    );
  }
}

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
      // Validate input parameters
      validateNotificationParams(params);

      const response = await axios.post<NotificationResult>(
        `/api/apps/${appId}/mobile/notifications`,
        params
      );
      return response.data;
    },
  };
}
