---
title: "Function: getLoginUrl"
description: "Documentation for Function: getLoginUrl"
---

[@base44/sdk](../README.md) / getLoginUrl

# Function: getLoginUrl

▸ **getLoginUrl**(`nextUrl`, `options`): `string`

Constructs the absolute URL for the login page

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `nextUrl` | `string` | URL to redirect back to after login |
| `options` | `Object` | Configuration options |
| `options.serverUrl` | `string` | Server URL (e.g., 'https://base44.app') |
| `options.appId` | `string` | Application ID |
| `options.loginPath?` | `string` | Path to the login endpoint |

#### Returns

`string`

The complete login URL

#### Defined in

[utils/auth-utils.ts:138](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/auth-utils.ts#L138)
