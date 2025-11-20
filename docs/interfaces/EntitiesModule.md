[**@base44/sdk**](../README.md)

***

# Interface: EntitiesModule

Entities module for managing application data.

This module provides dynamic access to all entities in your Base44 app.
Each entity gets a handler with full CRUD operations and additional utility methods.

Entities are accessed dynamically using the pattern:
`base44.entities.EntityName.method()`

Methods in this module respect the authentication mode used when calling them:

- **User authentication** (`base44.entities`): Operations are scoped to the currently
  authenticated user's permissions. Access is limited to entities the user has permission to view or modify.

- **Service role authentication** (`client.asServiceRole.entities`): Operations have
  elevated permissions and can access entities across all users. This is useful for admin
  operations or workflows that need to operate on data regardless of user permissions.

## Examples

```typescript
// List all records
const records = await base44.entities.MyEntity.list();
```

```typescript
// Filter records by field
const activeRecords = await base44.entities.MyEntity.filter({ status: 'active' });
```

```typescript
// Get specific record by ID
const record = await base44.entities.MyEntity.get('entity-123');
```

```typescript
// Create new record
const newRecord = await base44.entities.MyEntity.create({
  name: 'My Item',
  status: 'active'
});
```

```typescript
// Update record
await base44.entities.MyEntity.update('entity-123', { status: 'completed' });
```

```typescript
// Delete record
await base44.entities.MyEntity.delete('entity-123');
```

```typescript
// Bulk operations
await base44.entities.MyEntity.bulkCreate([
  { name: 'Item 1' },
  { name: 'Item 2' }
]);
```

```typescript
// Delete many
await base44.entities.MyEntity.deleteMany({ status: 'completed' });
```

## Indexable

\[`entityName`: `string`\]: [`EntityHandler`](EntityHandler.md)

Access any entity by name.

Use this to access entities defined in your Base44 app.

### Example

```typescript
// Access entities dynamically
base44.entities.MyEntity
base44.entities.AnotherEntity
```
