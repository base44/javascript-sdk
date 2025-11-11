---
title: "Interface: AuthMethods"
description: "Documentation for Interface: AuthMethods"
---

[@base44/sdk](../README.md) / AuthMethods

# Interface: AuthMethods

Public auth methods available from the SDK.
Document only the methods you want to expose and support.

## Table of contents

### Methods

- [me](AuthMethods.md#me)
- [redirectToLogin](AuthMethods.md#redirecttologin)
- [logout](AuthMethods.md#logout)
- [setToken](AuthMethods.md#settoken)
- [loginViaEmailPassword](AuthMethods.md#loginviaemailpassword)
- [isAuthenticated](AuthMethods.md#isauthenticated)
- [inviteUser](AuthMethods.md#inviteuser)
- [register](AuthMethods.md#register)
- [verifyOtp](AuthMethods.md#verifyotp)
- [resendOtp](AuthMethods.md#resendotp)
- [resetPasswordRequest](AuthMethods.md#resetpasswordrequest)
- [resetPassword](AuthMethods.md#resetpassword)
- [changePassword](AuthMethods.md#changepassword)

## Methods

### me

▸ **me**(): `Promise`\<`any`\>

Get current user information

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:9](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L9)

___

### redirectToLogin

▸ **redirectToLogin**(`nextUrl`): `void`

Redirects the user to the app's login page

#### Parameters

| Name | Type |
| :------ | :------ |
| `nextUrl` | `string` |

#### Returns

`void`

#### Defined in

[modules/auth.ts:16](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L16)

___

### logout

▸ **logout**(`redirectUrl?`): `void`

Logout the current user
Removes the token from localStorage and optionally redirects to a URL or reloads the page

#### Parameters

| Name | Type |
| :------ | :------ |
| `redirectUrl?` | `string` |

#### Returns

`void`

#### Defined in

[modules/auth.ts:22](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L22)

___

### setToken

▸ **setToken**(`token`, `saveToStorage?`): `void`

Set authentication token

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `token` | `string` | Auth token |
| `saveToStorage?` | `boolean` | Whether to save the token to localStorage (default true) |

#### Returns

`void`

#### Defined in

[modules/auth.ts:29](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L29)

___

### loginViaEmailPassword

▸ **loginViaEmailPassword**(`email`, `password`, `turnstileToken?`): `Promise`\<\{ `access_token`: `string` ; `user`: `any`  }\>

Login via username and password

#### Parameters

| Name | Type |
| :------ | :------ |
| `email` | `string` |
| `password` | `string` |
| `turnstileToken?` | `string` |

#### Returns

`Promise`\<\{ `access_token`: `string` ; `user`: `any`  }\>

Login response with access_token and user

#### Defined in

[modules/auth.ts:35](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L35)

___

### isAuthenticated

▸ **isAuthenticated**(): `Promise`\<`boolean`\>

Verify if the current token is valid

#### Returns

`Promise`\<`boolean`\>

#### Defined in

[modules/auth.ts:42](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L42)

___

### inviteUser

▸ **inviteUser**(`userEmail`, `role`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `userEmail` | `string` |
| `role` | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:44](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L44)

___

### register

▸ **register**(`payload`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `payload` | `Object` |
| `payload.email` | `string` |
| `payload.password` | `string` |
| `payload.turnstile_token?` | ``null`` \| `string` |
| `payload.referral_code?` | ``null`` \| `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:46](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L46)

___

### verifyOtp

▸ **verifyOtp**(`args`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `Object` |
| `args.email` | `string` |
| `args.otpCode` | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:53](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L53)

___

### resendOtp

▸ **resendOtp**(`email`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `email` | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:55](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L55)

___

### resetPasswordRequest

▸ **resetPasswordRequest**(`email`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `email` | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:57](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L57)

___

### resetPassword

▸ **resetPassword**(`args`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `Object` |
| `args.resetToken` | `string` |
| `args.newPassword` | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:59](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L59)

___

### changePassword

▸ **changePassword**(`args`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `Object` |
| `args.userId` | `string` |
| `args.currentPassword` | `string` |
| `args.newPassword` | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[modules/auth.ts:61](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L61)
