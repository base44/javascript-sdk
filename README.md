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
