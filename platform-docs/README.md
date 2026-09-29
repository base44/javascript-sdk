# Base44 Platform SDK

A server-side TypeScript client for provisioning users and managing the apps they build.
It complements [`@base44/sdk`](https://github.com/base44/javascript-sdk), which operates
inside an individual app: entities, functions, integrations and app-user authentication.

The platform client ships in the same `@base44/sdk` package, at the separate
`@base44/sdk/platform/server` entry point. It uses native `fetch` (Node 20+, or a
compatible server runtime). The platform entry point does not load the runtime SDK
or its dependencies.

## Start here

```ts
import { Base44PlatformClient } from "@base44/sdk/platform/server";

const platform = new Base44PlatformClient({
  apiKey: process.env.BASE44_API_KEY!,
  workspaceId: process.env.BASE44_WORKSPACE_ID!,
});

// Call at an explicit onboarding step, not automatically on every app request.
await platform.users.provision({ externalId: "customer_42", displayName: "Customer 42" });

// Authenticate your own incoming request before choosing this external ID.
const customer = platform.asUser("customer_42");
const app = await customer.apps.create({
  name: "Project tracker",
  prompt: "Build a project tracker",
  publicSettings: "private_with_login",
});
await customer.apps.addToFolder("folder_id", [app.id]);
const deployment = await customer.apps.deploy(app.id);
console.log(deployment.appId, deployment.revision);
```

**One key.** The key must belong to `workspaceId` and have both
`service_users:provision` and `user_tokens:mint`. Base44 provisioning availability
also depends on your workspace's enabled capabilities. There is no separate
provisioning key setting in this SDK.

**Your users remain yours.** `externalId` is a stable identifier from your system,
not an email or a Base44 user ID. Base44 creates a synthetic service identity for
it. `asUser()` neither provisions an identity nor changes the root client's identity.
App calls lazily acquire that user's server credential and remain subject to Base44
app/workspace authorization. A workspace-wide list is not an ownership filter for
your product: enforce your product's own access rules on your server.

**Server credentials stay on the server.** Do not serialize the client, token store
or `getAccessToken()` result to the browser. A service access token is REST-capable.
This SDK does not implement a browser subscription token or change its permissions.
Runtime app credentials, preview credentials and service access tokens are different.

## Documentation

- [Complete API reference](api.md): every method, input, response and error.
- [Token storage and lifecycle](tokens.md): default memory store, persistent adapter
  contract, renewal, revocation and offboarding.
- [Compilable examples](../examples/platform-server.ts): basic setup, storage integration, cancellation
  and error handling. These functions are examples, not automatically executed scripts.

All app responses are projected at runtime. Unknown server fields are excluded; merely
asserting a TypeScript type on the raw response is not sufficient. Ordinary SDK errors
also exclude server response prose and request credentials. Chat and sockets are outside this entry point.

## Integrating with your server

Keep your database adapter, product ownership checks, secret-name allowlists and
folder configuration in your application. Pass a persistent `TokenStore` when
credentials must survive process restarts.

Creation, folder assignment and local ownership recording are separate operations.
If the latter steps fail, the app has still been created. Retry the failed step using
the returned app ID rather than blindly creating another app.

## Verify without live credentials

From the repository root, using installed dependencies:

```sh
npm run test:types
npm run test:platform
npm run test:package
npm run docs:platform
npm run lint
```

Tests use mocked HTTP responses and exercise contracts, identity isolation and the
published package entry points. Examples are typechecked; a documentation check covers public exports.
No build, deployment, token or database mutation is performed against a live service.
