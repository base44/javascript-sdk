import type { AxiosInstance } from "axios";
import type {
  MobileModule,
  SendNotificationParams,
  SendNotificationResult,
} from "./mobile.types.js";

function validateRequiredString(
  value: unknown,
  fieldName: string,
  maxLength?: number
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required and must be a string`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters`);
  }
}

function validateOptionalString(
  value: unknown,
  fieldName: string,
  maxLength?: number
) {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters`);
  }
}

/**
 * Creates the service-role mobile module.
 *
 * @param axios - Axios instance (should be service role client)
 * @param appId - Application ID
 * @returns Mobile module with push notification methods
 * @internal
 */
export function createMobileModule(
  axios: AxiosInstance,
  appId: string
): MobileModule {
  return {
    async sendNotification(
      params: SendNotificationParams
    ): Promise<SendNotificationResult> {
      if (!params || typeof params !== "object") {
        throw new Error("Notification params are required");
      }

      validateRequiredString(params.userId, "userId");
      validateRequiredString(params.title, "title", 100);
      validateRequiredString(params.content, "content", 500);
      validateOptionalString(params.actionLabel, "actionLabel", 50);
      validateOptionalString(params.actionUrl, "actionUrl");

      if (
        params.metadata !== undefined &&
        (typeof params.metadata !== "object" || Array.isArray(params.metadata))
      ) {
        throw new Error("metadata must be an object");
      }

      const response = await axios.post<SendNotificationResult>(
        `/apps/${appId}/mobile/notifications`,
        params
      );

      return response as unknown as SendNotificationResult;
    },
  };
}
