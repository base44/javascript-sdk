[**@base44/sdk**](../README.md)

***

# Interface: EntityHandler

Entity handler providing CRUD operations for a specific entity type.

Each entity in your Base44 app (like User, Todo, Product, etc.) gets
a handler with these methods for managing data.

## Methods

### list()

> **list**(`sort?`, `limit?`, `skip?`, `fields?`): `Promise`\<`any`\>

List entities with optional pagination and sorting.

Retrieves all entities of this type with support for sorting,
pagination, and field selection.

#### Parameters

##### sort?

`string`

Sort parameter (e.g., "-created_date" for descending)

##### limit?

`number`

Maximum number of results to return

##### skip?

`number`

Number of results to skip (for pagination)

##### fields?

`string`[]

Array of field names to include in the response

#### Returns

`Promise`\<`any`\>

Promise resolving to an array of entities

#### Example

```typescript
// Get all todos
const todos = await client.entities.Todo.list();

// Get first 10 todos sorted by date
const recentTodos = await client.entities.Todo.list('-created_date', 10);

// Get paginated results (skip first 20, get next 10)
const page3 = await client.entities.Todo.list(null, 10, 20);

// Get only specific fields
const titles = await client.entities.Todo.list(null, null, null, ['title', 'completed']);
```

***

### filter()

> **filter**(`query`, `sort?`, `limit?`, `skip?`, `fields?`): `Promise`\<`any`\>

Filter entities based on a query.

Retrieves entities that match specific criteria with support for
sorting, pagination, and field selection.

#### Parameters

##### query

`Record`\<`string`, `any`\>

Filter query object with field-value pairs

##### sort?

`string`

Sort parameter (e.g., "-created_date" for descending)

##### limit?

`number`

Maximum number of results to return

##### skip?

`number`

Number of results to skip (for pagination)

##### fields?

`string`[]

Array of field names to include in the response

#### Returns

`Promise`\<`any`\>

Promise resolving to an array of filtered entities

#### Example

```typescript
// Filter by single field
const completedTodos = await client.entities.Todo.filter({
  completed: true
});

// Filter by multiple fields
const highPriorityTodos = await client.entities.Todo.filter({
  priority: 'high',
  completed: false
});

// Filter with sorting and pagination
const results = await client.entities.Todo.filter(
  { status: 'active' },
  '-created_date',
  20,
  0
);

// Filter with specific fields
const titles = await client.entities.Todo.filter(
  { priority: 'high' },
  null,
  null,
  null,
  ['title', 'priority']
);
```

***

### get()

> **get**(`id`): `Promise`\<`any`\>

Get a single entity by ID.

Retrieves a specific entity using its unique identifier.

#### Parameters

##### id

`string`

The unique identifier of the entity

#### Returns

`Promise`\<`any`\>

Promise resolving to the entity

#### Example

```typescript
const todo = await client.entities.Todo.get('todo-123');
console.log(todo.title);

const user = await client.entities.User.get('user-456');
console.log(user.email);
```

***

### create()

> **create**(`data`): `Promise`\<`any`\>

Create a new entity.

Creates a new entity with the provided data.

#### Parameters

##### data

`Record`\<`string`, `any`\>

Object containing the entity data

#### Returns

`Promise`\<`any`\>

Promise resolving to the created entity

#### Example

```typescript
const newTodo = await client.entities.Todo.create({
  title: 'Buy groceries',
  completed: false,
  priority: 'high'
});
console.log('Created todo with ID:', newTodo.id);

const newUser = await client.entities.User.create({
  name: 'John Doe',
  email: 'john@example.com',
  role: 'user'
});
```

***

### update()

> **update**(`id`, `data`): `Promise`\<`any`\>

Update an existing entity.

Updates an entity by ID with the provided data. Only the fields
included in the data object will be updated.

#### Parameters

##### id

`string`

The unique identifier of the entity to update

##### data

`Record`\<`string`, `any`\>

Object containing the fields to update

#### Returns

`Promise`\<`any`\>

Promise resolving to the updated entity

#### Example

```typescript
// Update single field
const updated = await client.entities.Todo.update('todo-123', {
  completed: true
});

// Update multiple fields
const updated = await client.entities.Todo.update('todo-123', {
  title: 'Updated title',
  priority: 'low',
  completed: true
});
```

***

### delete()

> **delete**(`id`): `Promise`\<`void`\>

Delete a single entity by ID.

Permanently removes an entity from the database.

#### Parameters

##### id

`string`

The unique identifier of the entity to delete

#### Returns

`Promise`\<`void`\>

Promise that resolves when the entity is deleted

#### Example

```typescript
await client.entities.Todo.delete('todo-123');
console.log('Todo deleted');

await client.entities.User.delete('user-456');
```

***

### deleteMany()

> **deleteMany**(`query`): `Promise`\<`void`\>

Delete multiple entities matching a query.

Permanently removes all entities that match the provided query.
Use with caution as this operation cannot be undone.

#### Parameters

##### query

`Record`\<`string`, `any`\>

Filter query object to match entities for deletion

#### Returns

`Promise`\<`void`\>

Promise that resolves when the entities are deleted

#### Example

```typescript
// Delete all completed todos
await client.entities.Todo.deleteMany({
  completed: true
});

// Delete all low priority items
await client.entities.Todo.deleteMany({
  priority: 'low'
});

// Delete by multiple criteria
await client.entities.Todo.deleteMany({
  completed: true,
  priority: 'low'
});
```

***

### bulkCreate()

> **bulkCreate**(`data`): `Promise`\<`any`\>

Create multiple entities in a single request.

Efficiently creates multiple entities at once. This is faster
than creating them individually.

#### Parameters

##### data

`Record`\<`string`, `any`\>[]

Array of entity data objects

#### Returns

`Promise`\<`any`\>

Promise resolving to an array of created entities

#### Example

```typescript
const newTodos = await client.entities.Todo.bulkCreate([
  { title: 'Task 1', completed: false },
  { title: 'Task 2', completed: false },
  { title: 'Task 3', completed: true }
]);
console.log(`Created ${newTodos.length} todos`);

const newUsers = await client.entities.User.bulkCreate([
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' }
]);
```

***

### importEntities()

> **importEntities**(`file`): `Promise`\<`any`\>

Import entities from a file.

Imports entities from a file (typically CSV or similar format).
The file format should match your entity structure. Requires a browser environment and cannot be used in the backend.

#### Parameters

##### file

`File`

File object to import

#### Returns

`Promise`\<`any`\>

Promise resolving to the import result

#### Example

```typescript
// In a browser with file input
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const result = await client.entities.Todo.importEntities(file);
console.log(`Imported ${result.count} todos`);
```
