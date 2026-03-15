/**
 * Event types for realtime entity updates.
 */
export type RealtimeEventType = "create" | "update" | "delete";

/**
 * Payload received when a realtime event occurs.
 *
 * @typeParam T - The entity type for the data field. Defaults to `any`.
 */
export interface RealtimeEvent<T = any> {
  /** The type of change that occurred */
  type: RealtimeEventType;
  /** The entity data */
  data: T;
  /** The unique identifier of the affected entity */
  id: string;
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
}

/**
 * Callback function invoked when a realtime event occurs.
 *
 * @typeParam T - The entity type for the event data. Defaults to `any`.
 */
export type RealtimeCallback<T = any> = (event: RealtimeEvent<T>) => void;

/**
 * Result returned when deleting a single entity.
 */
export interface DeleteResult {
  /** Whether the deletion was successful. */
  success: boolean;
}

/**
 * Result returned when deleting multiple entities.
 */
export interface DeleteManyResult {
  /** Whether the deletion was successful. */
  success: boolean;
  /** Number of entities that were deleted. */
  deleted: number;
}

/**
 * Result returned when updating multiple entities via a query.
 */
export interface UpdateManyResult {
  /** Whether the operation was successful. */
  success: boolean;
  /** Number of entities that were updated. */
  updated: number;
  /** Whether there are more entities matching the query that were not updated in this batch. When `true`, call `updateMany` again with the same query to update the next batch. */
  has_more: boolean;
}

/**
 * Result returned when importing entities from a file.
 *
 * @typeParam T - The entity type for imported records. Defaults to `any`.
 */
export interface ImportResult<T = any> {
  /** Status of the import operation. */
  status: "success" | "error";
  /** Details message, e.g., "Successfully imported 3 entities with RLS enforcement". */
  details: string | null;
  /** Array of created entity objects when successful, or null on error. */
  output: T[] | null;
}

/**
 * Sort field type for entity queries.
 *
 * Accepts any field name from the entity type with an optional prefix:
 * - `'+'` prefix or no prefix: ascending sort
 * - `'-'` prefix: descending sort
 *
 * @typeParam T - The entity type to derive sortable fields from.
 *
 * @example
 * ```typescript
 * // Specify sort direction by prefixing field names with + or -
 * // Ascending sort
 * 'created_date'
 * '+created_date'
 *
 * // Descending sort
 * '-created_date'
 * ```
 */
export type SortField<T> =
  | (keyof T & string)
  | `+${keyof T & string}`
  | `-${keyof T & string}`;

/**
 * Fields added by the server to every entity record, such as `id`, `created_date`, `updated_date`, and `created_by`.
 */
interface ServerEntityFields {
  /** Unique identifier of the record */
  id: string;
  /** ISO 8601 timestamp when the record was created */
  created_date: string;
  /** ISO 8601 timestamp when the record was last updated */
  updated_date: string;
  /** Email of the user who created the record (may be hidden in some responses) */
  created_by?: string | null;
  /** ID of the user who created the record */
  created_by_id?: string | null;
  /** Whether the record is sample/seed data */
  is_sample?: boolean;
}

/**
 * Registry mapping entity names to their TypeScript types. The [`types generate`](/developers/references/cli/commands/types-generate) command fills this registry, then [`EntityRecord`](#entityrecord) adds server fields.
 */
export interface EntityTypeRegistry {}

/**
 * Combines the [`EntityTypeRegistry`](#entitytyperegistry) schemas with server fields like `id`, `created_date`, and `updated_date` to give the complete record type for each entity. Use this when you need to type variables holding entity data.
 *
 * @example
 * ```typescript
 * // Using EntityRecord to get the complete type for an entity
 * // Combine your schema with server fields (id, created_date, etc.)
 * type TaskRecord = EntityRecord['Task'];
 *
 * const task: TaskRecord = await base44.entities.Task.create({
 *   title: 'My task',
 *   status: 'pending'
 * });
 *
 * // Task now includes both your fields and server fields:
 * console.log(task.id);           // Server field
 * console.log(task.created_date); // Server field
 * console.log(task.title);        // Your field
 * ```
 */
export type EntityRecord = {
  [K in keyof EntityTypeRegistry]: EntityTypeRegistry[K] & ServerEntityFields;
};

/**
 * Entity handler providing CRUD operations for a specific entity type.
 *
 * Each entity in the app gets a handler with these methods for managing data.
 *
 * @typeParam T - The entity type. Defaults to `any` for backward compatibility.
 */
export interface EntityHandler<T = any> {
  /**
   * Lists records with optional pagination and sorting.
   *
   * Retrieves all records of this type with support for sorting,
   * pagination, and field selection.
   *
   * **Note:** The maximum limit is 5,000 items per request.
   *
   * @typeParam K - The fields to include in the response. Defaults to all fields.
   * @param sort - Sort parameter, such as `'-created_date'` for descending. Defaults to `'-created_date'`.
   * @param limit - Maximum number of results to return. Defaults to `50`.
   * @param skip - Number of results to skip for pagination. Defaults to `0`.
   * @param fields - Array of field names to include in the response. Defaults to all fields.
   * @returns Promise resolving to an array of records with selected fields.
   *
   * @example
   * ```typescript
   * // Get all records
   * const records = await base44.entities.MyEntity.list();
   * ```
   *
   * @example
   * ```typescript
   * // Get first 10 records sorted by date
   * const recentRecords = await base44.entities.MyEntity.list('-created_date', 10);
   * ```
   *
   * @example
   * ```typescript
   * // Get paginated results
   * // Skip first 20, get next 10
   * const page3 = await base44.entities.MyEntity.list('-created_date', 10, 20);
   * ```
   *
   * @example
   * ```typescript
   * // Get only specific fields
   * const fields = await base44.entities.MyEntity.list('-created_date', 10, 0, ['name', 'status']);
   * ```
   */
  list<K extends keyof T = keyof T>(
    sort?: SortField<T>,
    limit?: number,
    skip?: number,
    fields?: K[],
  ): Promise<Pick<T, K>[]>;

  /**
   * Filters records based on a query.
   *
   * Retrieves records that match specific criteria with support for
   * sorting, pagination, and field selection.
   *
   * **Note:** The maximum limit is 5,000 items per request.
   *
   * @typeParam K - The fields to include in the response. Defaults to all fields.
   * @param query - Query object with field-value pairs. Each key should be a field name
   * from your entity schema, and each value is the criteria to match. Records matching all
   * specified criteria are returned. Field names are case-sensitive.
   * @param sort - Sort parameter, such as `'-created_date'` for descending. Defaults to `'-created_date'`.
   * @param limit - Maximum number of results to return. Defaults to `50`.
   * @param skip - Number of results to skip for pagination. Defaults to `0`.
   * @param fields - Array of field names to include in the response. Defaults to all fields.
   * @returns Promise resolving to an array of filtered records with selected fields.
   *
   * @example
   * ```typescript
   * // Filter by single field
   * const activeRecords = await base44.entities.MyEntity.filter({
   *   status: 'active'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Filter by multiple fields
   * const filteredRecords = await base44.entities.MyEntity.filter({
   *   priority: 'high',
   *   status: 'active'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Filter with sorting and pagination
   * const results = await base44.entities.MyEntity.filter(
   *   { status: 'active' },
   *   '-created_date',
   *   20,
   *   0
   * );
   * ```
   *
   * @example
   * ```typescript
   * // Filter with specific fields
   * const fields = await base44.entities.MyEntity.filter(
   *   { priority: 'high' },
   *   '-created_date',
   *   10,
   *   0,
   *   ['name', 'priority']
   * );
   * ```
   */
  filter<K extends keyof T = keyof T>(
    query: Partial<T>,
    sort?: SortField<T>,
    limit?: number,
    skip?: number,
    fields?: K[],
  ): Promise<Pick<T, K>[]>;

  /**
   * Gets a single record by ID.
   *
   * Retrieves a specific record using its unique identifier.
   *
   * @param id - The unique identifier of the record.
   * @returns Promise resolving to the record.
   *
   * @example
   * ```typescript
   * // Get record by ID
   * const record = await base44.entities.MyEntity.get('entity-123');
   * console.log(record.name);
   * ```
   */
  get(id: string): Promise<T>;

  /**
   * Creates a new record.
   *
   * Creates a new record with the provided data.
   *
   * @param data - Object containing the record data.
   * @returns Promise resolving to the created record.
   *
   * @example
   * ```typescript
   * // Create a new record
   * const newRecord = await base44.entities.MyEntity.create({
   *   name: 'My Item',
   *   status: 'active',
   *   priority: 'high'
   * });
   * console.log('Created record with ID:', newRecord.id);
   * ```
   */
  create(data: Partial<T>): Promise<T>;

  /**
   * Updates an existing record.
   *
   * Updates a record by ID with the provided data. Only the fields
   * included in the data object will be updated.
   *
   * @param id - The unique identifier of the record to update.
   * @param data - Object containing the fields to update.
   * @returns Promise resolving to the updated record.
   *
   * @example
   * ```typescript
   * // Update single field
   * const updated = await base44.entities.MyEntity.update('entity-123', {
   *   status: 'completed'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Update multiple fields
   * const updated = await base44.entities.MyEntity.update('entity-123', {
   *   name: 'Updated name',
   *   priority: 'low',
   *   status: 'active'
   * });
   * ```
   */
  update(id: string, data: Partial<T>): Promise<T>;

  /**
   * Deletes a single record by ID.
   *
   * Permanently removes a record from the database.
   *
   * @param id - The unique identifier of the record to delete.
   * @returns Promise resolving to the deletion result.
   *
   * @example
   * ```typescript
   * // Delete a record
   * const result = await base44.entities.MyEntity.delete('entity-123');
   * console.log('Deleted:', result.success);
   * ```
   */
  delete(id: string): Promise<DeleteResult>;

  /**
   * Deletes multiple records matching a query.
   *
   * Permanently removes all records that match the provided query.
   *
   * @param query - Query object with field-value pairs. Each key should be a field name
   * from your entity schema, and each value is the criteria to match. Records matching all
   * specified criteria will be deleted. Field names are case-sensitive.
   * @returns Promise resolving to the deletion result.
   *
   * @example
   * ```typescript
   * // Delete by multiple criteria
   * const result = await base44.entities.MyEntity.deleteMany({
   *   status: 'completed',
   *   priority: 'low'
   * });
   * console.log('Deleted:', result.deleted);
   * ```
   */
  deleteMany(query: Partial<T>): Promise<DeleteManyResult>;

  /**
   * Creates multiple records in a single request.
   *
   * Efficiently creates multiple records at once. This is faster
   * than creating them individually.
   *
   * @param data - Array of record data objects.
   * @returns Promise resolving to an array of created records.
   *
   * @example
   * ```typescript
   * // Create multiple records at once
   * const result = await base44.entities.MyEntity.bulkCreate([
   *   { name: 'Item 1', status: 'active' },
   *   { name: 'Item 2', status: 'active' },
   *   { name: 'Item 3', status: 'completed' }
   * ]);
   * ```
   */
  bulkCreate(data: Partial<T>[]): Promise<T[]>;

  /**
   * Updates multiple records matching a query using a MongoDB update operator.
   *
   * Applies the same update operation to all records matching the query.
   * The `data` parameter must contain exactly one MongoDB update operator
   * (e.g., `$set`, `$inc`, `$push`).
   *
   * Results are batched — when `has_more` is `true` in the response, call
   * `updateMany` again with the same query to update the next batch.
   *
   * @param query - Query object to filter which records to update. Records matching all
   * specified criteria will be updated.
   * @param data - Update operation object containing exactly one MongoDB update operator.
   * Supported operators: `$set`, `$rename`, `$unset`, `$inc`, `$mul`, `$min`, `$max`,
   * `$currentDate`, `$addToSet`, `$push`, `$pull`.
   * @returns Promise resolving to the update result.
   *
   * @example
   * ```typescript
   * // Set status to 'archived' for all completed records
   * const result = await base44.entities.MyEntity.updateMany(
   *   { status: 'completed' },
   *   { $set: { status: 'archived' } }
   * );
   * console.log(`Updated ${result.updated} records`);
   * ```
   *
   * @example
   * ```typescript
   * // Increment a counter on all matching records
   * const result = await base44.entities.MyEntity.updateMany(
   *   { category: 'sales' },
   *   { $inc: { view_count: 1 } }
   * );
   * ```
   *
   * @example
   * ```typescript
   * // Handle batched updates for large datasets
   * let hasMore = true;
   * let totalUpdated = 0;
   * while (hasMore) {
   *   const result = await base44.entities.MyEntity.updateMany(
   *     { status: 'pending' },
   *     { $set: { status: 'processed' } }
   *   );
   *   totalUpdated += result.updated;
   *   hasMore = result.has_more;
   * }
   * ```
   */
  updateMany(query: Partial<T>, data: Record<string, Record<string, any>>): Promise<UpdateManyResult>;

  /**
   * Updates multiple records in a single request, each with its own update data.
   *
   * Unlike `updateMany` which applies the same update to all matching records,
   * `bulkUpdate` allows different updates for each record. Each item in the
   * array must include an `id` field identifying which record to update.
   *
   * @param data - Array of update objects. Each object must have an `id` field
   * and any number of fields to update.
   * @returns Promise resolving to an array of updated records.
   *
   * @example
   * ```typescript
   * // Update multiple records with different data
   * const updated = await base44.entities.MyEntity.bulkUpdate([
   *   { id: 'entity-1', status: 'paid', amount: 999 },
   *   { id: 'entity-2', status: 'cancelled' },
   *   { id: 'entity-3', name: 'Renamed Item' }
   * ]);
   * ```
   */
  bulkUpdate(data: (Partial<T> & { id: string })[]): Promise<T[]>;

  /**
   * Imports records from a file.
   *
   * Imports records from a file, typically CSV or similar format.
   * The file format should match your entity structure. Requires a browser environment and can't be used in the backend.
   *
   * @param file - File object to import.
   * @returns Promise resolving to the import result containing status, details, and created records.
   *
   * @example
   * ```typescript
   * // Import records from file in React
   * const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
   *   const file = event.target.files?.[0];
   *   if (file) {
   *     const result = await base44.entities.MyEntity.importEntities(file);
   *     if (result.status === 'success' && result.output) {
   *       console.log(`Imported ${result.output.length} records`);
   *     }
   *   }
   * };
   * ```
   */
  importEntities(file: File): Promise<ImportResult<T>>;

  /**
   * Subscribes to realtime updates for all records of this entity type.
   *
   * Establishes a WebSocket connection to receive instant updates when any
   * record is created, updated, or deleted. Returns an unsubscribe function
   * to clean up the connection.
   *
   * @param callback - Callback function called when an entity changes. The callback receives an event object with the following properties:
   * - `type`: The type of change that occurred - `'create'`, `'update'`, or `'delete'`.
   * - `data`: The entity data after the change.
   * - `id`: The unique identifier of the affected entity.
   * - `timestamp`: ISO 8601 timestamp of when the event occurred.
   * @returns Unsubscribe function to stop receiving updates.
   *
   * @example
   * ```typescript
   * // Subscribe to all Task changes
   * const unsubscribe = base44.entities.Task.subscribe((event) => {
   *   console.log(`Task ${event.id} was ${event.type}d:`, event.data);
   * });
   *
   * // Later, clean up the subscription
   * unsubscribe();
   * ```
   */
  subscribe(callback: RealtimeCallback<T>): () => void;
}

/**
 * Typed entities module - maps registry keys to typed handlers (full record type).
 */
type TypedEntitiesModule = {
  [K in keyof EntityTypeRegistry]: EntityHandler<EntityRecord[K]>;
};

/**
 * Dynamic entities module - allows any entity name with untyped handler.
 */
type DynamicEntitiesModule = {
  [entityName: string]: EntityHandler<any>;
};

/**
 * Entities module for managing app data.
 *
 * This module provides dynamic access to all entities in the app.
 * Each entity gets a handler with full CRUD operations and additional utility methods.
 *
 * Entities are accessed dynamically using the pattern:
 * `base44.entities.EntityName.method()`
 *
 * This module is available to use with a client in all authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.entities`): Access is scoped to the current user's permissions. Anonymous users can only access public entities, while authenticated users can access entities they have permission to view or modify.
 * - **Service role authentication** (`base44.asServiceRole.entities`): Operations have elevated admin-level permissions. Can access all entities that the app's admin role has access to.
 *
 * ## Entity Handlers
 *
 * An entity handler is the object you get when you access an entity through `base44.entities.EntityName`. Every entity in your app automatically gets a handler with CRUD methods for managing records.
 *
 * For example, `base44.entities.Task` is an entity handler for Task records, and `base44.entities.User` is an entity handler for User records. Each handler provides methods like `list()`, `create()`, `update()`, and `delete()`.
 *
 * You don't need to instantiate or import entity handlers. They're automatically available for every entity you create in your app.
 *
 * ## Built-in User Entity
 *
 * Every app includes a built-in `User` entity that stores user account information. This entity has special security rules that can't be changed.
 *
 * Regular users can only read and update their own user record. With service role authentication, you can read, update, and delete any user. You can't create users using the entities module. Instead, use the functions of the {@link AuthModule | auth module} to invite or register new users.
 *
 * ## Generated Types
 *
 * If you're working in a TypeScript project, you can generate types from your entity schemas to get autocomplete and type checking on all entity methods. See the [Dynamic Types](/developers/references/sdk/getting-started/dynamic-types) guide to get started.
 *
 * @example
 * ```typescript
 * // Get all records from the MyEntity entity
 * // Get all records the current user has permissions to view
 * const myRecords = await base44.entities.MyEntity.list();
 * ```
 *
 * @example
 * ```typescript
 * // List all users (admin only)
 * const allUsers = await base44.asServiceRole.entities.User.list();
 * ```
 */
export type EntitiesModule = TypedEntitiesModule & DynamicEntitiesModule;
