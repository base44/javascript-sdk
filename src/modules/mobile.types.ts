/**
 * TypeScript type definitions for Base44 Mobile SDK.
 *
 * Provides mobile native capabilities like push notifications
 * for apps built with Base44.
 */

/**
 * Channel type for notifications.
 * - "mobile_push": Send via mobile push notification (Ping service)
 * - "in_app": Send via in-app notification (WebSocket + MongoDB)
 */
export type NotificationChannel = "mobile_push" | "in_app";

/**
 * Parameters for sending a notification to an app user.
 */
export interface SendNotificationParams {
  /** App user ID to notify */
  userId: string;
  /** Notification title (max 100 characters) */
  title: string;
  /** Notification content (max 500 characters, supports HTML) */
  content: string;
  /** Optional button text (max 50 characters) */
  actionLabel?: string;
  /** Optional button link */
  actionUrl?: string;
  /** Optional list of channels. If not specified, uses all channels (mobile_push + in_app) */
  channels?: NotificationChannel[];
  /** Optional custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from a single notification channel.
 */
export interface ChannelResult {
  /** Whether the notification was sent successfully through this channel */
  success: boolean;
  /** Error message if the channel failed */
  error?: string;
}

/**
 * Response from sending a notification.
 */
export interface NotificationResult {
  /** Overall success status */
  success: boolean;
  /** Notification ID if in_app channel was used */
  notificationId?: string;
  /** Results per channel */
  channels: {
    in_app?: ChannelResult;
    mobile_push?: ChannelResult;
  };
}

/**
 * Mobile module interface providing mobile native capabilities.
 */
export interface MobileModule {
  /**
   * Send a notification to an app user.
   *
   * @param params - Notification parameters
   * @returns Promise resolving to notification result
   *
   * @example
   * ```typescript
   * // Send mobile push notification only
   * await base44.mobile.sendNotification({
   *   userId: 'app_user_123',
   *   title: 'New Message!',
   *   content: 'You have a new message from John',
   *   actionLabel: 'View Message',
   *   actionUrl: '/messages/456',
   *   channels: ['mobile_push']
   * });
   *
   * // Send to both channels (default)
   * await base44.mobile.sendNotification({
   *   userId: 'app_user_123',
   *   title: 'Order Shipped',
   *   content: 'Your order #12345 has been shipped'
   * });
   * ```
   */
  sendNotification(params: SendNotificationParams): Promise<NotificationResult>;
}
