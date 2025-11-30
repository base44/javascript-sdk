[**@base44/sdk**](../README)

***

# Interface: CreateClientConfig

Configuration for creating a Base44 client.

## Properties

### appId

> **appId**: `string`

The Base44 app ID.

You can find the `appId` in the browser URL when you're in the app editor.
It's the string between `/apps/` and `/editor/`.

***

### token?

> `optional` **token**: `string`

User authentication token. Use this in the frontend when you want to authenticate as a specific user.

***

### serviceToken?

> `optional` **serviceToken**: `string`

Service role authentication token. Use this in the backend when you need elevated permissions to access data across all users or perform admin operations. This token should be kept secret and never exposed in the app's frontend.

***

### options?

> `optional` **options**: [`CreateClientOptions`](CreateClientOptions)

Additional client options.
