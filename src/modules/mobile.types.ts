/**
 * Parameters for sending a mobile push notification to an app user.
 */
export interface SendNotificationParams {
  /** Target AppUser ID. */
  userId: string;
  /** Notification title. Maximum 100 characters. */
  title: string;
  /** Notification body. Maximum 500 characters. */
  content: string;
  /** Optional action label. Maximum 50 characters. */
  actionLabel?: string;
  /** Optional action URL opened by the notification action. */
  actionUrl?: string;
  /** Optional metadata delivered with the notification event. */
  metadata?: Record<string, unknown>;
}

/**
 * Result returned after attempting to send a mobile push notification.
 */
export interface SendNotificationResult {
  /** Channels that completed successfully. */
  successfulChannels: string[];
  /** Channel errors keyed by channel name. */
  failedChannels: Record<string, string>;
}

/**
 * Service-role-only mobile module.
 */
export interface MobileModule {
  /**
   * Sends a push notification to an app user.
   *
   * This method is only available through `base44.asServiceRole.mobile`.
   *
   * @param params - Notification target and content.
   * @returns The notification delivery result.
   */
  sendNotification(
    params: SendNotificationParams
  ): Promise<SendNotificationResult>;
}
