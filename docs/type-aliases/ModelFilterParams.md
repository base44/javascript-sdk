[**@base44/sdk**](../README.md)

***

# Type Alias: ModelFilterParams

> **ModelFilterParams** = `object`

Parameters for filtering, sorting, and paginating agent model data.

Used in the agents module for querying agent conversations. Provides a structured way to specify query criteria, sorting, pagination, and field selection.

## Examples

```typescript
// Filter conversations by agent name
const conversations = await base44.agents.listConversations({
  q: { agent_name: 'support-bot' }
});
```

```typescript
// Filter conversations with sorting
const conversations = await base44.agents.listConversations({
  q: { status: 'active' },
  sort: '-created_at'  // Sort by created_at descending
});
```

```typescript
// Filter conversations with pagination
const conversations = await base44.agents.listConversations({
  q: { agent_name: 'support-bot' },
  limit: 20,  // Get 20 results
  skip: 40    // Skip first 40 (page 3)
});
```

```typescript
// Filter conversations with field selection
const conversations = await base44.agents.listConversations({
  q: { status: 'active' },
  fields: ['id', 'agent_name', 'created_at']
});
```

```typescript
// Filter conversations with multiple filters
const conversations = await base44.agents.listConversations({
  q: {
    agent_name: 'support-bot',
    'metadata.priority': 'high',
    status: 'active'
  },
  sort: '-updated_at',
  limit: 50,
  skip: 0
});
```

## Properties

### q?

> `optional` **q**: `Record`\<`string`, `any`\>

Query object with field-value pairs for filtering.

***

### sort?

> `optional` **sort**: `string` \| `null`

Sort parameter. For example, "-created_date" for descending order.

***

### sort\_by?

> `optional` **sort\_by**: `string` \| `null`

Alternative sort parameter. Use either `sort` or `sort_by`.

***

### limit?

> `optional` **limit**: `number` \| `null`

Maximum number of results to return.

***

### skip?

> `optional` **skip**: `number` \| `null`

Number of results to skip. Used for pagination.

***

### fields?

> `optional` **fields**: ...[] \| `null`

Array of field names to include in the response.
