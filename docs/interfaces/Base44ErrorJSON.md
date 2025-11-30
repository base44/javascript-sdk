[**@base44/sdk**](../README)

***

# Interface: Base44ErrorJSON

JSON representation of a Base44Error.

This is the structure returned by [`Base44Error.toJSON()`](../classes/Base44Error.md#tojson).
Useful for logging or sending error information to external services.

## Properties

### name

> **name**: `string`

The error name, always "Base44Error".

***

### message

> **message**: `string`

Human-readable error message.

***

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
