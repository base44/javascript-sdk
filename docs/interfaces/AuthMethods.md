# Interface: AuthMethods

Public auth methods available from the SDK.
Document only the methods you want to expose and support.

## Methods

### me

▸ **me**(): `Promise`\<`any`\>

Get current user information

#### Returns

`Promise`\<`any`\>

**`Example`**

```ts
import { createClient, getAccessToken } from '@base44/sdk';

const client = createClient({ appId: 'your-app-id', token: getAccessToken() });
const user = await client.auth.me();
console.log(user);
```

#### Defined in

[modules/auth.ts:24](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L24)

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

**`Example`**

```ts
// Redirect and return to current route after login
client.auth.redirectToLogin(window.location.pathname);
```

#### Defined in

[modules/auth.ts:38](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L38)

___

### logout

▸ **logout**(`redirectUrl?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `redirectUrl?` | `string` |

#### Returns

`void`

**`Example`**

```ts
// Reload the page after logout
client.auth.logout();

// Or redirect to a login page
client.auth.logout('/login');
```

#### Defined in

[modules/auth.ts:54](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L54)

___

### setToken

▸ **setToken**(`token`, `saveToStorage?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `token` | `string` |
| `saveToStorage?` | `boolean` |

#### Returns

`void`

**`Example`**

```ts
// After obtaining a token from your auth flow
client.auth.setToken(accessToken);
```

#### Defined in

[modules/auth.ts:68](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L68)

___

### loginViaEmailPassword

▸ **loginViaEmailPassword**(`email`, `password`, `turnstileToken?`): `Promise`\<[`LoginViaEmailPasswordResponse`](LoginViaEmailPasswordResponse.md)\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `email` | `string` |
| `password` | `string` |
| `turnstileToken?` | `string` |

#### Returns

`Promise`\<[`LoginViaEmailPasswordResponse`](LoginViaEmailPasswordResponse.md)\>

**`Example`**

```ts
const { access_token, user } = await client.auth.loginViaEmailPassword(
  'user@example.com',
  's3cret'
);
client.auth.setToken(access_token);
```

#### Defined in

[modules/auth.ts:84](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L84)

___

### isAuthenticated

▸ **isAuthenticated**(): `Promise`\<`boolean`\>

Verify if the current token is valid

#### Returns

`Promise`\<`boolean`\>

**`Example`**

```ts
const ok = await client.auth.isAuthenticated();
if (!ok) client.auth.redirectToLogin('/dashboard');
```

#### Defined in

[modules/auth.ts:98](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L98)

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

**`Example`**

```ts
await client.auth.inviteUser('new-user@example.com', 'member');
```

#### Defined in

[modules/auth.ts:106](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L106)

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

**`Example`**

```ts
await client.auth.register({
  email: 'user@example.com',
  password: 's3cret',
});
```

#### Defined in

[modules/auth.ts:117](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L117)

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

**`Example`**

```ts
await client.auth.verifyOtp({ email: 'user@example.com', otpCode: '123456' });
```

#### Defined in

[modules/auth.ts:130](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L130)

___

### resendOtp

▸ **resendOtp**(`email`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `email` | `string` |

#### Returns

`Promise`\<`any`\>

**`Example`**

```ts
await client.auth.resendOtp('user@example.com');
```

#### Defined in

[modules/auth.ts:138](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L138)

___

### resetPasswordRequest

▸ **resetPasswordRequest**(`email`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `email` | `string` |

#### Returns

`Promise`\<`any`\>

**`Example`**

```ts
await client.auth.resetPasswordRequest('user@example.com');
```

#### Defined in

[modules/auth.ts:146](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L146)

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

**`Example`**

```ts
await client.auth.resetPassword({ resetToken: 'token', newPassword: 'newPass123' });
```

#### Defined in

[modules/auth.ts:154](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L154)

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

**`Example`**

```ts
await client.auth.changePassword({
  userId: 'abc123',
  currentPassword: 'oldPass',
  newPassword: 'newPass123',
});
```

#### Defined in

[modules/auth.ts:166](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/auth.ts#L166)
