[**@base44/sdk**](../README.md)

***

# Class: Base44Error

Custom error class for Base44 SDK errors.

This error is thrown when API requests fail. It extends the standard Error
class and includes additional information about the HTTP status, error code,
and response data from the server.

## Examples

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

```typescript
// Handling authentication errors
try {
  await client.auth.loginViaEmailPassword('user@example.com', 'wrong-password');
} catch (error) {
  if (error instanceof Base44Error && error.status === 401) {
    console.error('Authentication failed:', error.message);
  }
}
```

```typescript
// Serializing errors for logging
try {
  await client.entities.User.create({ invalid: 'data' });
} catch (error) {
  if (error instanceof Base44Error) {
    const serialized = error.toJSON();
    // Send to logging service
    logger.error(serialized);
  }
}
```

## Extends

- `Error`

## Constructors

### Constructor

> **new Base44Error**(`message`, `status`, `code`, `data`, `originalError`): `Base44Error`

Creates a new Base44Error instance.

#### Parameters

##### message

`string`

Human-readable error message

##### status

`number`

HTTP status code

##### code

`string`

Error code from the API

##### data

`any`

Full response data from the server

##### originalError

`unknown`

Original axios error object

#### Returns

`Base44Error`

#### Overrides

`Error.constructor`

## Properties

### status

> **status**: `number`

HTTP status code of the error (e.g., 400, 401, 404, 500).

***

### code

> **code**: `string`

Error code from the API (e.g., "NOT_FOUND", "VALIDATION_ERROR").

***

### data

> **data**: `any`

Full response data from the server containing error details.

***

### originalError

> **originalError**: `unknown`

The original error object from axios.

## Methods

### toJSON()

> **toJSON**(): `object`

Serializes the error to a JSON-safe object.

Useful for logging or sending error information to external services
without circular reference issues.

#### Returns

`object`

JSON-safe representation of the error

##### name

> **name**: `string`

##### message

> **message**: `string`

##### status

> **status**: `number`

##### code

> **code**: `string`

##### data

> **data**: `any`

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
