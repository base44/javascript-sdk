[**@base44/sdk**](../README.md)

***

# Interface: SaveAccessTokenOptions

Configuration options for saving an access token

## Example

```typescript
// Use default storage key
saveAccessToken('my-token-123', {});

// Use custom storage key
saveAccessToken('my-token-123', { storageKey: 'my_app_token' });
```

## Properties

### storageKey?

> `optional` **storageKey**: `string`

The key to use when storing the token in localStorage

#### Default

```ts
'base44_access_token'
```
