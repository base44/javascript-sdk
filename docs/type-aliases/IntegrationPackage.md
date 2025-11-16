[**@base44/sdk**](../README.md)

***

# Type Alias: IntegrationPackage

> **IntegrationPackage** = `object`

A package containing integration endpoints.

Provides dynamic access to integration endpoints within a package.
Each endpoint is accessed as a property that returns a function to invoke it.

## Index Signature

\[`endpointName`: `string`\]: [`IntegrationEndpointFunction`](IntegrationEndpointFunction.md)

## Example

```typescript
// Access endpoints dynamically
const result = await integrations.Core.SendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Message'
});
```
