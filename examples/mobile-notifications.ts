/**
 * Mobile Notifications Examples
 *
 * This file demonstrates how to use the Base44 SDK's mobile module
 * to send push notifications to app users.
 */

import { createClient } from "../src/index.js";

// Create a Base44 client
const base44 = createClient({
  appId: "your-app-id",
  token: "your-auth-token",
});

// ============================================================================
// Example 1: Basic Mobile Push Notification
// ============================================================================

/**
 * Send a simple push notification to a user's mobile device.
 * This is useful for time-sensitive alerts that users should see immediately.
 */
async function sendBasicPushNotification() {
  try {
    const result = await base44.mobile.sendNotification({
      userId: "user_123",
      title: "New Message!",
      content: "You have a new message from John",
      channels: ["mobile_push"], // Mobile push only
    });

    if (result.success) {
      console.log("✅ Notification sent successfully");
      console.log("Notification ID:", result.notificationId);
    }
  } catch (error) {
    console.error("❌ Failed to send notification:", error);
  }
}

// ============================================================================
// Example 2: Notification with Action Button
// ============================================================================

/**
 * Send a notification with an action button that deep-links to a specific page.
 * When the user taps the notification or button, they'll navigate to the specified URL.
 */
async function sendNotificationWithAction() {
  try {
    await base44.mobile.sendNotification({
      userId: "user_456",
      title: "Order Ready for Pickup",
      content: "Your order #12345 is ready at Downtown Store",
      actionLabel: "View Order",
      actionUrl: "/orders/12345",
    });

    console.log("✅ Notification with action sent");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ============================================================================
// Example 3: Send to Multiple Channels
// ============================================================================

/**
 * Send notifications to both mobile push and in-app channels.
 * Users will see the notification on their phone and in the web interface.
 */
async function sendToMultipleChannels() {
  try {
    await base44.mobile.sendNotification({
      userId: "user_789",
      title: "Payment Received",
      content: "Your payment of $99.99 has been processed successfully",
      actionLabel: "View Receipt",
      actionUrl: "/billing/receipts/latest",
      // No channels specified = both mobile_push and in_app (default)
    });

    console.log("✅ Multi-channel notification sent");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ============================================================================
// Example 4: In-App Notification Only
// ============================================================================

/**
 * Send an in-app notification without mobile push.
 * Useful for non-urgent updates that users will see when they're active in the app.
 */
async function sendInAppNotification() {
  try {
    await base44.mobile.sendNotification({
      userId: "user_101",
      title: "Profile Updated",
      content: "Your profile changes have been saved successfully",
      channels: ["in_app"], // In-app only
    });

    console.log("✅ In-app notification sent");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ============================================================================
// Example 5: Order & Delivery Updates
// ============================================================================

/**
 * Send notifications for order status updates.
 */
async function notifyOrderStatus(order: any) {
  const notifications = {
    confirmed: {
      title: "Order Confirmed",
      content: `Your order #${order.id} has been confirmed and is being prepared`,
      actionLabel: "Track Order",
    },
    shipped: {
      title: "Order Shipped",
      content: `Your order #${order.id} is on its way! Expected delivery: ${order.estimatedDelivery}`,
      actionLabel: "Track Shipment",
    },
    delivered: {
      title: "Order Delivered",
      content: `Your order #${order.id} has been delivered. Enjoy!`,
      actionLabel: "Leave Review",
    },
  };

  const notification = notifications[order.status as keyof typeof notifications];

  if (notification) {
    await base44.mobile.sendNotification({
      userId: order.userId,
      title: notification.title,
      content: notification.content,
      actionLabel: notification.actionLabel,
      actionUrl: `/orders/${order.id}`,
      channels: ["mobile_push"], // Important updates warrant push notifications
    });
  }
}

// ============================================================================
// Example 6: Chat & Messaging Notifications
// ============================================================================

/**
 * Send notifications for new messages in a chat application.
 * Uses mobile push only to avoid duplication with in-app chat notifications.
 */
async function notifyNewMessage(message: any, sender: any, recipient: any) {
  try {
    await base44.mobile.sendNotification({
      userId: recipient.id,
      title: `${sender.name} sent you a message`,
      content: message.text.length > 100
        ? message.text.substring(0, 97) + "..."
        : message.text,
      actionLabel: "Reply",
      actionUrl: `/chats/${message.conversationId}`,
      channels: ["mobile_push"], // Mobile only - in-app chat handles UI notifications
    });

    console.log("✅ Message notification sent");
  } catch (error) {
    console.error("❌ Failed to notify:", error);
  }
}

// ============================================================================
// Example 7: Event & Reminder Notifications
// ============================================================================

/**
 * Send reminder notifications for upcoming events.
 */
async function sendEventReminder(event: any, attendee: any, minutesBefore: number) {
  try {
    await base44.mobile.sendNotification({
      userId: attendee.userId,
      title: `Event Starting ${minutesBefore === 30 ? "Soon" : "in " + minutesBefore + " minutes"}`,
      content: `${event.name} starts at ${event.startTime}`,
      actionLabel: "View Details",
      actionUrl: `/events/${event.id}`,
      channels: ["mobile_push"],
    });

    console.log(`✅ ${minutesBefore}-minute reminder sent`);
  } catch (error) {
    console.error("❌ Failed to send reminder:", error);
  }
}

// ============================================================================
// Example 8: Bulk Notifications to Multiple Users
// ============================================================================

/**
 * Send notifications to multiple users (e.g., all attendees of an event).
 * Sends notifications in parallel for better performance.
 */
async function sendBulkNotifications(userIds: string[], notificationData: any) {
  try {
    const results = await Promise.allSettled(
      userIds.map((userId) =>
        base44.mobile.sendNotification({
          userId,
          ...notificationData,
        })
      )
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(`✅ Sent ${successful} notifications, ${failed} failed`);
  } catch (error) {
    console.error("❌ Bulk notification error:", error);
  }
}

// Example usage:
// await sendBulkNotifications(
//   ["user_1", "user_2", "user_3"],
//   {
//     title: "Event Cancelled",
//     content: "The workshop scheduled for tomorrow has been cancelled",
//     actionLabel: "Learn More",
//     actionUrl: "/events/workshop-123",
//   }
// );

// ============================================================================
// Example 9: Error Handling and Retry Logic
// ============================================================================

/**
 * Send a notification with custom error handling and retry logic.
 */
async function sendNotificationWithRetry(
  params: any,
  maxRetries: number = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await base44.mobile.sendNotification(params);

      if (result.success) {
        console.log(`✅ Notification sent on attempt ${attempt}`);
        return true;
      }
    } catch (error: any) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);

      // Don't retry on user-not-found or permission errors
      if (error.status === 404 || error.status === 403) {
        console.error("❌ Non-retryable error, stopping");
        return false;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`❌ Failed after ${maxRetries} attempts`);
  return false;
}

// ============================================================================
// Example 10: Conditional Notifications Based on User Preferences
// ============================================================================

/**
 * Send notifications respecting user preferences.
 * Assumes you have a user preferences object stored in your entities.
 */
async function sendNotificationWithPreferences(
  userId: string,
  notificationData: any
) {
  try {
    // Fetch user notification preferences
    const user = await base44.entities.User.get(userId);

    if (!user.notificationsEnabled) {
      console.log("⏭️  User has notifications disabled");
      return;
    }

    // Determine channels based on preferences
    const channels: ("mobile_push" | "in_app")[] = [];
    if (user.pushNotificationsEnabled) channels.push("mobile_push");
    if (user.inAppNotificationsEnabled) channels.push("in_app");

    if (channels.length === 0) {
      console.log("⏭️  User has all notification channels disabled");
      return;
    }

    await base44.mobile.sendNotification({
      userId,
      ...notificationData,
      channels,
    });

    console.log(`✅ Notification sent via ${channels.join(", ")}`);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ============================================================================
// Run Examples
// ============================================================================

async function runExamples() {
  console.log("📱 Mobile Notifications Examples\n");

  // Uncomment to run specific examples:

  // await sendBasicPushNotification();
  // await sendNotificationWithAction();
  // await sendToMultipleChannels();
  // await sendInAppNotification();

  // await notifyOrderStatus({
  //   id: "12345",
  //   userId: "user_123",
  //   status: "shipped",
  //   estimatedDelivery: "Dec 25, 2024",
  // });

  // await sendEventReminder(
  //   { id: "event_123", name: "Team Meeting", startTime: "2:00 PM" },
  //   { userId: "user_456" },
  //   30
  // );
}

// Export all example functions
export {
  sendBasicPushNotification,
  sendNotificationWithAction,
  sendToMultipleChannels,
  sendInAppNotification,
  notifyOrderStatus,
  notifyNewMessage,
  sendEventReminder,
  sendBulkNotifications,
  sendNotificationWithRetry,
  sendNotificationWithPreferences,
  runExamples,
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}
