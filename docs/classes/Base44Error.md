[**@base44/sdk**](../README.md)

***

# Class: Base44Error

Custom error class for Base44 SDK errors.

This error is thrown when API requests fail. It extends the standard `Error` class and includes additional information about the HTTP status, error code, and response data from the server.

## Example

```typescript
try {
  await client.entities.Todo.get('invalid-id');
} catch (error) {
  if (error instanceof Base44Error) {
    console.error('Status:', error.status);      // 404
    console.error('Message:', error.message);    // "Not found"
    console.error('Code:', error.code);          // "NOT_FOUND"
    console.error('Data:', error.data);          // Full response data
  }
}
```

## Extends

- `Error`

## Properties

### status

> **status**: `number`

HTTP status code of the error.

***

### code

> **code**: `string`

Error code from the API.

***

### data

> **data**: `any`

Full response data from the server containing error details.

***

### originalError

> **originalError**: `unknown`

The original error object from Axios.

## Methods

### toJSON()

> **toJSON**(): [`Base44ErrorJSON`](../interfaces/Base44ErrorJSON.md)

Serializes the error to a JSON-safe object.

Useful for logging or sending error information to external services
without circular reference issues.

#### Returns

[`Base44ErrorJSON`](../interfaces/Base44ErrorJSON.md)

JSON-safe representation of the error.

#### Example

```typescript
try {
  await client.entities.Todo.get('invalid-id');
} catch (error) {
  if (error instanceof Base44Error) {
    const json = error.toJSON();
    console.log(json);
    // {
    //   name: "Base44Error",
    //   message: "Not found",
    //   status: 404,
    //   code: "NOT_FOUND",
    //   data: { ... }
    // }
  }
}
```
