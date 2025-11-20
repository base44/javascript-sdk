[**@base44/sdk**](../README.md)

***

# Type Alias: IntegrationEndpointFunction()

> **IntegrationEndpointFunction** = (`data`) => `Promise`\<`any`\>

Function signature for calling an integration endpoint.

If any parameter is a `File` object, the request will automatically be
sent as `multipart/form-data`. Otherwise, it will be sent as JSON.

## Parameters

### data

`Record`\<`string`, `any`\>

An object containing named parameters for the integration endpoint.

## Returns

`Promise`\<`any`\>

Promise resolving to the integration endpoint's response.
