export type NotificationChannel = "email" | "sms" | "push" | "in_app";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

/**
 * A notification recipient.
 */
export type NotificationRecipient = {
  userId: string;
  channels?: NotificationChannel[];
};

export type NotificationTemplate = {
  id: string;
  name: string;
  subject?: string;
  body: string;
  channel: NotificationChannel;
};

export type SendNotificationParams = {
  recipientId: string;
  templateId?: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  priority?: NotificationPriority;
  metadata?: Record<string, string | number | boolean>;
  scheduledAt?: string;
};

export type BulkNotificationParams = {
  recipientIds: string[];
  templateId: string;
  channel: NotificationChannel;
  variables?: Record<string, string>;
  priority?: NotificationPriority;
};

export type NotificationResult = {
  id: string;
  status: "queued" | "sent" | "delivered" | "failed";
  sentAt?: string;
  error?: string;
};

export type NotificationPreferences = {
  userId: string;
  enabledChannels: NotificationChannel[];
  quietHoursStart?: string;
  quietHoursEnd?: string;
  unsubscribedTopics: string[];
};

export type ListNotificationsParams = {
  status?: "queued" | "sent" | "delivered" | "failed";
  channel?: NotificationChannel;
  limit?: number;
  skip?: number;
};

export interface NotificationsModule {
  send(params: SendNotificationParams): Promise<NotificationResult>;

  sendBulk(params: BulkNotificationParams): Promise<NotificationResult[]>;

  getPreferences(userId: string): Promise<NotificationPreferences>;

  updatePreferences(
    userId: string,
    preferences: Partial<Omit<NotificationPreferences, "userId">>
  ): Promise<NotificationPreferences>;

  list(params?: ListNotificationsParams): Promise<NotificationResult[]>;

  /**
   * Cancels a scheduled notification before it is sent.
   *
   * @param notificationId - The ID of the notification to cancel.
   * @returns Promise resolving to `true` if the notification was successfully cancelled.
   */
  cancel(notificationId: string): Promise<boolean>;
}
