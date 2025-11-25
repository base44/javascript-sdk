[**@base44/sdk**](../README.md)

***

# Interface: EntityHandler

Entity handler providing CRUD operations for a specific entity type.

Each entity in the app gets a handler with these methods for managing data.

## Methods

### list()

> **list**(`sort?`, `limit?`, `skip?`, `fields?`): `Promise`\<`any`\>

Lists records with optional pagination and sorting.

Retrieves all records of this type with support for sorting,
pagination, and field selection.

#### Parameters

##### sort?

`string`

Sort parameter, such as `'-created_date'` for descending.

##### limit?

`number`

Maximum number of results to return.

##### skip?

`number`

Number of results to skip for pagination.

##### fields?

`string`[]

Array of field names to include in the response.

#### Returns

`Promise`\<`any`\>

Promise resolving to an array of records.

#### Examples

```typescript
// Get all records
const records = await base44.entities.MyEntity.list();
```

```typescript
// Get first 10 records sorted by date
const recentRecords = await base44.entities.MyEntity.list('-created_date', 10);
```

```typescript
// Get paginated results
// Skip first 20, get next 10
const page3 = await base44.entities.MyEntity.list('-created_date', 10, 20);
```

```typescript
// Get only specific fields
const fields = await base44.entities.MyEntity.list('-created_date', 10, 0, ['name', 'status']);
```

***

### filter()

> **filter**(`query`, `sort?`, `limit?`, `skip?`, `fields?`): `Promise`\<`any`\>

Filters records based on a query.

Retrieves records that match specific criteria with support for
sorting, pagination, and field selection.

#### Parameters

##### query

`Record`\<`string`, `any`\>

Query object with field-value pairs. Each key should be a field name
from your entity schema, and each value is the criteria to match. Records matching all
specified criteria are returned. Field names are case-sensitive.

##### sort?

`string`

Sort parameter, such as `'-created_date'` for descending.

##### limit?

`number`

Maximum number of results to return.

##### skip?

`number`

Number of results to skip for pagination.

##### fields?

`string`[]

Array of field names to include in the response.

#### Returns

`Promise`\<`any`\>

Promise resolving to an array of filtered records.

#### Examples

```typescript
// Filter by single field
const activeRecords = await base44.entities.MyEntity.filter({
  status: 'active'
});
```

```typescript
// Filter by multiple fields
const filteredRecords = await base44.entities.MyEntity.filter({
  priority: 'high',
  status: 'active'
});
```

```typescript
// Filter with sorting and pagination
const results = await base44.entities.MyEntity.filter(
  { status: 'active' },
  '-created_date',
  20,
  0
);
```

```typescript
// Filter with specific fields
const fields = await base44.entities.MyEntity.filter(
  { priority: 'high' },
  '-created_date',
  10,
  0,
  ['name', 'priority']
);
```

***

### get()

> **get**(`id`): `Promise`\<`any`\>

Gets a single record by ID.

Retrieves a specific record using its unique identifier.

#### Parameters

##### id

`string`

The unique identifier of the record.

#### Returns

`Promise`\<`any`\>

Promise resolving to the record.

#### Example

```typescript
// Get record by ID
const record = await base44.entities.MyEntity.get('entity-123');
console.log(record.name);
```

***

### create()

> **create**(`data`): `Promise`\<`any`\>

Creates a new record.

Creates a new record with the provided data.

#### Parameters

##### data

`Record`\<`string`, `any`\>

Object containing the record data.

#### Returns

`Promise`\<`any`\>

Promise resolving to the created record.

#### Example

```typescript
// Create a new record
const newRecord = await base44.entities.MyEntity.create({
  name: 'My Item',
  status: 'active',
  priority: 'high'
});
console.log('Created record with ID:', newRecord.id);
```

***

### update()

> **update**(`id`, `data`): `Promise`\<`any`\>

Updates an existing record.

Updates a record by ID with the provided data. Only the fields
included in the data object will be updated.

#### Parameters

##### id

`string`

The unique identifier of the record to update.

##### data

`Record`\<`string`, `any`\>

Object containing the fields to update.

#### Returns

`Promise`\<`any`\>

Promise resolving to the updated record.

#### Examples

```typescript
// Update single field
const updated = await base44.entities.MyEntity.update('entity-123', {
  status: 'completed'
});
```

```typescript
// Update multiple fields
const updated = await base44.entities.MyEntity.update('entity-123', {
  name: 'Updated name',
  priority: 'low',
  status: 'active'
});
```

***

### delete()

> **delete**(`id`): `Promise`\<`any`\>

Deletes a single record by ID.

Permanently removes a record from the database.

#### Parameters

##### id

`string`

The unique identifier of the record to delete.

#### Returns

`Promise`\<`any`\>

Promise resolving to the deletion result.

#### Example

```typescript
// Delete a record
const result = await base44.entities.MyEntity.delete('entity-123');
console.log('Deleted:', result);
```

***

### deleteMany()

> **deleteMany**(`query`): `Promise`\<`any`\>

Deletes multiple records matching a query.

Permanently removes all records that match the provided query.

#### Parameters

##### query

`Record`\<`string`, `any`\>

Query object with field-value pairs. Each key should be a field name
from your entity schema, and each value is the criteria to match. Records matching all
specified criteria will be deleted. Field names are case-sensitive.

#### Returns

`Promise`\<`any`\>

Promise resolving to the deletion result.

#### Example

```typescript
// Delete by multiple criteria
const result = await base44.entities.MyEntity.deleteMany({
  status: 'completed',
  priority: 'low'
});
console.log('Deleted:', result);
```

***

### bulkCreate()

> **bulkCreate**(`data`): `Promise`\<`any`\>

Creates multiple records in a single request.

Efficiently creates multiple records at once. This is faster
than creating them individually.

#### Parameters

##### data

`Record`\<`string`, `any`\>[]

Array of record data objects.

#### Returns

`Promise`\<`any`\>

Promise resolving to an array of created records.

#### Example

```typescript
// Create multiple records at once
const result = await base44.entities.MyEntity.bulkCreate([
  { name: 'Item 1', status: 'active' },
  { name: 'Item 2', status: 'active' },
  { name: 'Item 3', status: 'completed' }
]);
```

***

### importEntities()

> **importEntities**(`file`): `Promise`\<`any`\>

Imports records from a file.

Imports records from a file, typically CSV or similar format.
The file format should match your entity structure. Requires a browser environment and cannot be used in the backend.

#### Parameters

##### file

`File`

File object to import.

#### Returns

`Promise`\<`any`\>

Promise resolving to the import result.

#### Example

```typescript
// Import records from file in React
const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file) {
    const result = await base44.entities.MyEntity.importEntities(file);
    console.log(`Imported ${result.count} records`);
  }
};
```
