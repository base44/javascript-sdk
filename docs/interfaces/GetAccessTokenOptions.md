[**@base44/sdk**](../README.md)

***

# Interface: GetAccessTokenOptions

Configuration options for retrieving an access token

## Examples

```typescript
// Get access token from URL or local storage using default options
const token = getAccessToken();
```

```typescript
// Get access token from custom local storage key
const token = getAccessToken({ storageKey: 'my_app_token' });
```

```typescript
// Get token from URL but don't save or remove from URL
const token = getAccessToken({
  saveToStorage: false,
  removeFromUrl: false
});
```

## Properties

### storageKey?

> `optional` **storageKey**: `string`

The key to use when storing or retrieving the token in local storage

#### Default

```ts
'base44_access_token'
```

***

### paramName?

> `optional` **paramName**: `string`

The URL parameter name to check for the access token

#### Default

```ts
'access_token'
```

***

### saveToStorage?

> `optional` **saveToStorage**: `boolean`

Whether to save the token to local storage if found in the URL

#### Default

```ts
true
```

***

### removeFromUrl?

> `optional` **removeFromUrl**: `boolean`

Whether to remove the token from the URL after retrieval for security

#### Default

```ts
true
```
