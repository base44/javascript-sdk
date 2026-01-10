# Base44 JavaScript SDK

The Base44 SDK provides a JavaScript interface for building apps on the Base44 platform. When Base44 generates your app, the generated code uses the SDK to authenticate users, manage your app's data, interact with AI agents, and more. You can then use the same SDK to modify and extend your app.

## Modules

The SDK provides access to Base44's functionality through the following modules:

- **[`agents`](https://docs.base44.com/sdk-docs/interfaces/agents)**: Interact with AI agents and manage conversations.
- **[`app-logs`](https://docs.base44.com/sdk-docs/interfaces/app-logs)**: Access and query app logs.
- **[`auth`](https://docs.base44.com/sdk-docs/interfaces/auth)**: Manage user authentication, registration, and session handling.
- **[`connectors`](https://docs.base44.com/sdk-docs/interfaces/connectors)**: Manage OAuth connections and access tokens for third-party services.
- **[`entities`](https://docs.base44.com/sdk-docs/interfaces/entities)**: Work with your app's data entities using CRUD operations.
- **[`functions`](https://docs.base44.com/sdk-docs/interfaces/functions)**: Execute backend functions.
- **[`integrations`](https://docs.base44.com/sdk-docs/type-aliases/integrations)**: Pre-built server-side functions for external services.
- **[`mobile`](#mobile-native-features)**: Send push notifications and access mobile native capabilities.

## Example

Here's a quick look at working with data in the SDK, using the `entities` module to create, update, and list records. In this example, we're working with a custom `Task` entity:

```typescript
import { base44 } from "@/api/base44Client";

// Create a new task
const newTask = await base44.entities.Task.create({
  title: "Complete project documentation",
  status: "pending",
  dueDate: "2024-12-31",
});

// Update the task
await base44.entities.Task.update(newTask.id, {
  status: "in-progress",
});

// List all tasks
const tasks = await base44.entities.Task.list();
```

## Mobile Native Features

The SDK provides mobile native capabilities through the `mobile` module, allowing you to send push notifications to your app users.

### Push Notifications

Send push notifications to users on mobile devices:

```typescript
import { base44 } from "@/api/base44Client";

// Send a push notification to a user
await base44.mobile.sendNotification({
  userId: "user_123",
  title: "New Message!",
  content: "You have a new message from John",
  actionLabel: "View Message",
  actionUrl: "/messages/456",
  channels: ["mobile_push"], // Mobile push only
});

// Send to both mobile push and in-app notifications (default)
await base44.mobile.sendNotification({
  userId: "user_456",
  title: "Order Shipped",
  content: "Your order #12345 has been shipped and is on its way!",
  actionLabel: "Track Order",
  actionUrl: "/orders/12345",
});
```

### Notification Channels

The `mobile` module supports two notification channels:

- **`mobile_push`**: Sends a push notification to the user's mobile device (iOS/Android)
- **`in_app`**: Sends an in-app notification visible in the web interface

By default, notifications are sent to both channels. You can specify specific channels using the `channels` parameter:

```typescript
// Mobile push only - user will receive push notification on their phone
await base44.mobile.sendNotification({
  userId: "user_123",
  title: "Time-sensitive alert",
  content: "Your session will expire in 5 minutes",
  channels: ["mobile_push"],
});

// In-app only - notification visible only in the web interface
await base44.mobile.sendNotification({
  userId: "user_789",
  title: "System Update",
  content: "We've updated the dashboard with new features",
  channels: ["in_app"],
});
```

### Common Use Cases

**Order & Delivery Updates**:
```typescript
// Notify user when order is ready
await base44.mobile.sendNotification({
  userId: order.userId,
  title: "Order Ready for Pickup",
  content: `Your order #${order.id} is ready at ${store.name}`,
  actionLabel: "View Order",
  actionUrl: `/orders/${order.id}`,
});
```

**Chat & Messaging**:
```typescript
// Notify user of new messages
await base44.mobile.sendNotification({
  userId: recipient.id,
  title: `New message from ${sender.name}`,
  content: message.preview,
  actionLabel: "Reply",
  actionUrl: `/chats/${conversation.id}`,
  channels: ["mobile_push"], // Mobile only, avoid duplicate with in-app chat
});
```

**Reminders & Events**:
```typescript
// Send event reminder
await base44.mobile.sendNotification({
  userId: attendee.userId,
  title: "Event Starting Soon",
  content: `${event.name} starts in 30 minutes`,
  actionLabel: "View Details",
  actionUrl: `/events/${event.id}`,
});
```

### Error Handling

The notification API handles errors gracefully:

```typescript
try {
  const result = await base44.mobile.sendNotification({
    userId: "user_123",
    title: "Test Notification",
    content: "This is a test",
  });

  if (result.success) {
    console.log("Notification sent successfully");
    console.log("Notification ID:", result.notificationId);
  }
} catch (error) {
  if (error.status === 404) {
    console.error("User not found");
  } else if (error.status === 403) {
    console.error("Not authorized to send notifications");
  } else {
    console.error("Failed to send notification:", error.message);
  }
}
```

**Graceful Degradation**:
- If a user doesn't have mobile push enabled, the notification is still sent to other channels
- If one channel fails, other channels still receive the notification
- Notifications are queued and retried automatically for temporary failures

## Learn more

For complete documentation, guides, and API reference, visit the **[Base44 SDK Documentation](https://docs.base44.com/sdk-getting-started/overview)**.

## Development

### Build the SDK

```bash
npm install
npm run build
```

### Run tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run with coverage
npm run test:coverage
```

For E2E tests, create a `tests/.env` file with:
```
BASE44_APP_ID=your_app_id
BASE44_AUTH_TOKEN=your_auth_token
```

### Generate documentation

Generate API documentation locally:

```bash
# Process and preview locally
npm run create-docs
cd docs
mintlify dev
```
