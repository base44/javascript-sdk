[**@base44/sdk**](../README)

***

# Interface: RemoveAccessTokenOptions

Configuration options for removing an access token.

## Example

```typescript
// Remove token from default storage key
removeAccessToken({});

// Remove token from custom storage key
removeAccessToken({ storageKey: 'my_app_token' });
```

## Properties

### storageKey?

> `optional` **storageKey**: `string`

The key to use when removing the token from local storage.

#### Default

```ts
'base44_access_token'
```
