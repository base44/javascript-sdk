# Class: Base44Error

## Hierarchy

- `Error`

  ↳ **`Base44Error`**

## Constructors

### constructor

• **new Base44Error**(`message`, `status`, `code`, `data`, `originalError`): [`Base44Error`](Base44Error.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `message` | `string` |
| `status` | `number` |
| `code` | `string` |
| `data` | `any` |
| `originalError` | `unknown` |

#### Returns

[`Base44Error`](Base44Error.md)

#### Overrides

Error.constructor

#### Defined in

[utils/axios-client.ts:11](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/axios-client.ts#L11)

## Properties

### status

• **status**: `number`

#### Defined in

[utils/axios-client.ts:6](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/axios-client.ts#L6)

___

### code

• **code**: `string`

#### Defined in

[utils/axios-client.ts:7](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/axios-client.ts#L7)

___

### data

• **data**: `any`

#### Defined in

[utils/axios-client.ts:8](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/axios-client.ts#L8)

___

### originalError

• **originalError**: `unknown`

#### Defined in

[utils/axios-client.ts:9](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/axios-client.ts#L9)

## Methods

### toJSON

▸ **toJSON**(): `Object`

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `name` | `string` |
| `message` | `string` |
| `status` | `number` |
| `code` | `string` |
| `data` | `any` |

#### Defined in

[utils/axios-client.ts:27](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/axios-client.ts#L27)
