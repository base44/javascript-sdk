[**@base44/sdk**](../README.md)

***

# Interface: FunctionsModule

Functions module for invoking custom backend functions.

This module allows you to invoke the custom backend functions in your Base44 app.

Methods in this module respect the authentication mode used when calling them:

- **User authentication** (`base44.functions`): Functions are invoked with the currently
  authenticated user's permissions. The function code receives a request with the user's authentication context and can only access data the user has permission to access.

- **Service role authentication** (`client.asServiceRole.functions`): Functions are invoked
  with elevated permissions. The function code receives a request with the service role authentication context and can access data across all users.

## Examples

```typescript
// Invoke a function with parameters
const result = await base44.functions.invoke('calculateTotal', {
  items: ['item1', 'item2'],
  discount: 0.1
});
console.log(result.data);
```

```typescript
// Invoke with service role
const adminResult = await client.asServiceRole.functions.invoke('adminTask', {
  action: 'cleanup'
});
```

## Methods

### invoke()

> **invoke**(`functionName`, `data`): `Promise`\<`any`\>

Invokes a custom backend function by name.

Calls a custom backend function that you've deployed to your Base44 app.
The function receives the provided data as named parameters and returns
the result. If any parameter is a `File` object, the request will automatically be
sent as `multipart/form-data`. Otherwise, it will be sent as JSON.

#### Parameters

##### functionName

`string`

The name of the function to invoke.

##### data

`Record`\<`string`, `any`\>

An object containing named parameters for the function.

#### Returns

`Promise`\<`any`\>

Promise resolving to the function's response.

#### Examples

```typescript
// Basic function call
const result = await base44.functions.invoke('calculateTotal', {
  items: ['item1', 'item2'],
  discount: 0.1
});
console.log(result.data.total);
```

```typescript
// Function with file upload in React
const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file) {
    const processedImage = await base44.functions.invoke('processImage', {
      image: file,
      filter: 'grayscale',
      quality: 80
    });
  }
};
```
