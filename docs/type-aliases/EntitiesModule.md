[**@base44/sdk**](../README.md)

***

# Type Alias: EntitiesModule

> **EntitiesModule** = `object`

Entities module for managing application data.

This module provides dynamic access to all entities in your Base44 app.
Each entity (like User, Todo, Product, etc.) gets a handler with full
CRUD operations and additional utility methods.

**Dynamic Access:**
Entities are accessed dynamically using: `client.entities.EntityName.method()`

**Available with both auth modes:**
- User auth: `client.entities.EntityName.method(...)`
- Service role: `client.asServiceRole.entities.EntityName.method(...)`

## Index Signature

\[`entityName`: `string`\]: [`EntityHandler`](../interfaces/EntityHandler.md)

Access any entity by name.

Use this to access custom entities defined in your Base44 app.

### Example

```typescript
// Built-in entities
client.entities.User
client.entities.Todo

// Custom entities
client.entities.Product
client.entities.Order
client.entities.Invoice
```

## Example

```typescript
// List all todos
const todos = await client.entities.Todo.list();

// Filter users by role
const admins = await client.entities.User.filter({ role: 'admin' });

// Get specific product
const product = await client.entities.Product.get('prod-123');

// Create new todo
const newTodo = await client.entities.Todo.create({
  title: 'Buy groceries',
  completed: false
});

// Update entity
await client.entities.Todo.update('todo-123', { completed: true });

// Delete entity
await client.entities.Todo.delete('todo-123');

// Bulk operations
await client.entities.Todo.bulkCreate([
  { title: 'Task 1' },
  { title: 'Task 2' }
]);

// Delete many
await client.entities.Todo.deleteMany({ completed: true });
```
