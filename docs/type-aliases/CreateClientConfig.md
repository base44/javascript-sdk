[**@base44/sdk**](../README.md)

***

# Type Alias: CreateClientConfig

> **CreateClientConfig** = `object`

Configuration for creating a Base44 client.

## Properties

### appId

> **appId**: `string`

Your Base44 application ID.

***

### token?

> `optional` **token**: `string`

User authentication token. Use this for client-side applications where you want to
authenticate as a specific user.

***

### serviceToken?

> `optional` **serviceToken**: `string`

Service role authentication token. Use this for server-side applications where you need
elevated permissions to access data across all users or perform admin operations. This token
should be kept secret and never exposed to the client.
