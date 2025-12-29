/**
 * Event types for realtime entity updates.
 */
export type RealtimeEventType = "create" | "update" | "delete";

/**
 * Payload received when a realtime event occurs.
 */
export interface RealtimeEvent<T = Record<string, any>> {
  /** The type of change that occurred */
  type: RealtimeEventType;
  /** The entity data (new/updated for create/update, previous for delete) */
  data: T;
  /** The unique identifier of the affected entity */
  id: string;
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
  /** For update events, contains the previous data before the change */
  previousData?: T;
}

/**
 * Callback function invoked when a realtime event occurs.
 */
export type RealtimeCallback<T = Record<string, any>> = (
  event: RealtimeEvent<T>
) => void;

/**
 * Options for subscribing to realtime updates.
 */
export interface SubscribeOptions {
  /** Filter events by type. Defaults to all types. */
  events?: RealtimeEventType[];
}

/**
 * Handle returned from subscribe, used to unsubscribe.
 */
export interface Subscription {
  /** Stops listening to updates and cleans up the subscription. */
  unsubscribe: () => void;
}

/**
 * Entity handler providing CRUD operations for a specific entity type.
 *
 * Each entity in the app gets a handler with these methods for managing data.
 */
export interface EntityHandler {
  /**
   * Lists records with optional pagination and sorting.
   *
   * Retrieves all records of this type with support for sorting,
   * pagination, and field selection.
   *
   * @param sort - Sort parameter, such as `'-created_date'` for descending. Defaults to `'-created_date'`.
   * @param limit - Maximum number of results to return. Defaults to `50`.
   * @param skip - Number of results to skip for pagination. Defaults to `0`.
   * @param fields - Array of field names to include in the response. Defaults to all fields.
   * @returns Promise resolving to an array of records.
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
  list(
    sort?: string,
    limit?: number,
    skip?: number,
    fields?: string[]
  ): Promise<any>;

  /**
   * Filters records based on a query.
   *
   * Retrieves records that match specific criteria with support for
   * sorting, pagination, and field selection.
   *
   * @param query - Query object with field-value pairs. Each key should be a field name
   * from your entity schema, and each value is the criteria to match. Records matching all
   * specified criteria are returned. Field names are case-sensitive.
   * @param sort - Sort parameter, such as `'-created_date'` for descending. Defaults to `'-created_date'`.
   * @param limit - Maximum number of results to return. Defaults to `50`.
   * @param skip - Number of results to skip for pagination. Defaults to `0`.
   * @param fields - Array of field names to include in the response. Defaults to all fields.
   * @returns Promise resolving to an array of filtered records.
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
  filter(
    query: Record<string, any>,
    sort?: string,
    limit?: number,
    skip?: number,
    fields?: string[]
  ): Promise<any>;

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
  get(id: string): Promise<any>;

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
  create(data: Record<string, any>): Promise<any>;

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
  update(id: string, data: Record<string, any>): Promise<any>;

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
   * console.log('Deleted:', result);
   * ```
   */
  delete(id: string): Promise<any>;

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
   * console.log('Deleted:', result);
   * ```
   */
  deleteMany(query: Record<string, any>): Promise<any>;

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
  bulkCreate(data: Record<string, any>[]): Promise<any>;

  /**
   * Imports records from a file.
   *
   * Imports records from a file, typically CSV or similar format.
   * The file format should match your entity structure. Requires a browser environment and can't be used in the backend.
   *
   * @param file - File object to import.
   * @returns Promise resolving to the import result.
   *
   * @example
   * ```typescript
   * // Import records from file in React
   * const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
   *   const file = event.target.files?.[0];
   *   if (file) {
   *     const result = await base44.entities.MyEntity.importEntities(file);
   *     console.log(`Imported ${result.count} records`);
   *   }
   * };
   * ```
   */
  importEntities(file: File): Promise<any>;

  /**
   * Subscribes to realtime updates for all records of this entity type.
   *
   * Receives notifications whenever any record is created, updated, or deleted.
   *
   * @param callback - Function called when an entity changes.
   * @param options - Optional configuration for filtering events.
   * @returns Subscription handle with an unsubscribe method.
   *
   * @example
   * ```typescript
   * // Subscribe to all Task changes
   * const subscription = base44.entities.Task.subscribe((event) => {
   *   console.log(`Task ${event.id} was ${event.type}d:`, event.data);
   * });
   *
   * // Later, unsubscribe
   * subscription.unsubscribe();
   * ```
   *
   * @example
   * ```typescript
   * // Subscribe only to create events
   * const subscription = base44.entities.Task.subscribe(
   *   (event) => console.log("New task:", event.data),
   *   { events: ["create"] }
   * );
   * ```
   */
  subscribe(callback: RealtimeCallback, options?: SubscribeOptions): Subscription;

  /**
   * Subscribes to realtime updates for a specific entity record.
   *
   * Receives notifications when the specified record is updated or deleted.
   *
   * @param id - The unique identifier of the record to watch.
   * @param callback - Function called when the entity changes.
   * @param options - Optional configuration for filtering events.
   * @returns Subscription handle with an unsubscribe method.
   *
   * @example
   * ```typescript
   * // Subscribe to a specific task
   * const subscription = base44.entities.Task.subscribe("task-123", (event) => {
   *   if (event.type === "update") {
   *     console.log("Task updated:", event.data);
   *   } else if (event.type === "delete") {
   *     console.log("Task was deleted");
   *   }
   * });
   * ```
   */
  subscribe(
    id: string,
    callback: RealtimeCallback,
    options?: SubscribeOptions
  ): Subscription;

  /**
   * Subscribes to realtime updates for records matching a query.
   *
   * Receives notifications for records that match the specified criteria.
   * Includes create events when new records match the query, update events
   * when matching records change, and delete events when matching records
   * are removed.
   *
   * @param query - Query object with field-value pairs to filter records.
   * @param callback - Function called when a matching entity changes.
   * @param options - Optional configuration for filtering events.
   * @returns Subscription handle with an unsubscribe method.
   *
   * @example
   * ```typescript
   * // Subscribe to all completed tasks
   * const subscription = base44.entities.Task.subscribe(
   *   { isCompleted: true },
   *   (event) => {
   *     console.log(`Completed task ${event.type}:`, event.data);
   *   }
   * );
   * ```
   *
   * @example
   * ```typescript
   * // Subscribe to high-priority active tasks
   * const subscription = base44.entities.Task.subscribe(
   *   { priority: "high", status: "active" },
   *   (event) => console.log("High priority task changed:", event.data)
   * );
   * ```
   */
  subscribe(
    query: Record<string, any>,
    callback: RealtimeCallback,
    options?: SubscribeOptions
  ): Subscription;
}

/**
 * Entities module for managing app data.
 *
 * This module provides dynamic access to all entities in the app.
 * Each entity gets a handler with full CRUD operations and additional utility methods.
 *
 * Entities are accessed dynamically using the pattern:
 * `base44.entities.EntityName.method()`
 *
 * This module is available to use with a client in all three authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.entities`): Access is scoped to the current user's permissions. Anonymous users can only access public entities, while authenticated users can access entities they have permission to view or modify.
 * - **Service role authentication** (`base44.asServiceRole.entities`): Operations have elevated admin-level permissions. Can access all entities that the app's admin role has access to.
 *
 * ## Built-in User Entity
 *
 * Every app includes a built-in `User` entity that stores user account information. This entity has special security rules that can't be changed.
 *
 * Regular users can only read and update their own user record. With service role authentication, you can read, update, and delete any user. You can't create users using the entities module. Instead, use the functions of the {@link AuthModule | auth module} to invite or register new users.
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
export interface EntitiesModule {
  /**
   * Access any entity by name.
   *
   * Use this to access entities defined in the app.
   *
   * @example
   * ```typescript
   * // Access entities dynamically
   * base44.entities.MyEntity
   * base44.entities.AnotherEntity
   * ```
   */
  [entityName: string]: EntityHandler;
}
