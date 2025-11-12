# Function: getAccessToken

▸ **getAccessToken**(`options?`): ``null`` \| `string`

Retrieves an access token from either localStorage or URL parameters

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | `Object` | Configuration options |
| `options.storageKey?` | `string` | The key to use in localStorage |
| `options.paramName?` | `string` | The URL parameter name |
| `options.saveToStorage?` | `boolean` | Whether to save the token to localStorage if found in URL |
| `options.removeFromUrl?` | `boolean` | Whether to remove the token from URL after retrieval |

#### Returns

``null`` \| `string`

The access token or null if not found

#### Defined in

[utils/auth-utils.ts:15](https://github.com/base44-dev/javascript-sdk/blob/main/src/utils/auth-utils.ts#L15)
