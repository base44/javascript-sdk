# Base44 JavaScript SDK

The Base44 SDK provides a JavaScript interface for building apps on the Base44 platform. 

You can use it in two ways:

- **Inside Base44 apps**: When Base44 generates your app, the SDK is already set up and ready to use.
- **External apps**: Use the SDK to build your own frontend or backend that uses Base44 as a backend service.

## Installation

Install the SDK via npm:

```bash
npm install @base44/sdk
```

> **Note**: In Base44-generated apps, the SDK is already installed for you.

## Modules

The SDK provides access to Base44's functionality through the following modules:

- **[`agents`](https://docs.base44.com/developers/references/sdk/docs/interfaces/agents)**: Interact with AI agents and manage conversations.
- **[`app-logs`](https://docs.base44.com/developers/references/sdk/docs/interfaces/app-logs)**: Access and query app logs.
- **[`auth`](https://docs.base44.com/developers/references/sdk/docs/interfaces/auth)**: Manage user authentication, registration, and session handling.
- **[`connectors`](https://docs.base44.com/developers/references/sdk/docs/interfaces/connectors)**: Manage OAuth connections and access tokens for third-party services.
- **[`entities`](https://docs.base44.com/developers/references/sdk/docs/interfaces/entities)**: Work with your app's data entities using CRUD operations.
- **[`functions`](https://docs.base44.com/developers/references/sdk/docs/interfaces/functions)**: Execute backend functions.
- **[`integrations`](https://docs.base44.com/developers/references/sdk/docs/type-aliases/integrations)**: Pre-built integrations for external services.

## Quick starts

How you get started depends on your context:

### Inside a Base44 app

In Base44-generated apps, the client is pre-configured. Just import and use it:

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

### External apps

When using Base44 as a backend for your own app, create and configure the client yourself:

```typescript
import { createClient } from '@base44/sdk';

// Create a client for your Base44 app
const base44 = createClient({
  appId: 'your-app-id'  // Find this in the Base44 editor URL
});

// Read public data (anonymous access)
const products = await base44.entities.Products.list();

// Authenticate a user (token is automatically set)
await base44.auth.loginViaEmailPassword('user@example.com', 'password');

// Now operations use the authenticated user's permissions
const userOrders = await base44.entities.Orders.list();
```

### Service role

For backend code that needs admin-level access, use the service role. Service role is only available in Base44-hosted backend functions:

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Access all data with admin-level permissions
  const allOrders = await base44.asServiceRole.entities.Orders.list();

  return Response.json({ orders: allOrders });
});
```

## Learn more

For complete documentation, guides, and API reference, visit the **[Base44 SDK Documentation](https://docs.base44.com/developers/landing)**.

## Development

### Build the SDK

Build the SDK from source:

```bash
npm install
npm run build
```

### Run tests

Run the test suite:

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
