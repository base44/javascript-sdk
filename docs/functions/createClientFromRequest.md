[**@base44/sdk**](../README)

***

# Function: createClientFromRequest()

> **createClientFromRequest**(`request`): [`Base44Client`](../interfaces/Base44Client)

Creates a Base44 client from an HTTP request.

Creates a client by automatically extracting authentication tokens and configuration from an incoming HTTP request with authentication information in its headers. Use this function in backend environments, such as when building backend functions. Base44 inserts the necessary headers when forwarding requests from the app's frontend to the backend functions.

## Parameters

### request

`Request`

The incoming HTTP request object containing Base44 authentication headers.

## Returns

[`Base44Client`](../interfaces/Base44Client)

A configured Base44 client instance with authentication from the incoming request.

## Example

```typescript
// Frontend call to a backend function
const response = await base44.functions.invoke('myBackendFunction', {});

// Backend function that receives the call
import { createClientFromRequest } from '@base44/client-sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use the client to make API calls

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
```
