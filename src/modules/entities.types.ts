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
   * @param sort - Sort parameter, such as `'-created_date'` for descending.
   * @param limit - Maximum number of results to return.
   * @param skip - Number of results to skip for pagination.
   * @param fields - Array of field names to include in the response.
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
   * @param sort - Sort parameter, such as `'-created_date'` for descending.
   * @param limit - Maximum number of results to return.
   * @param skip - Number of results to skip for pagination.
   * @param fields - Array of field names to include in the response.
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
   * The file format should match your entity structure. Requires a browser environment and cannot be used in the backend.
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
 * This module is available to use with a client in both user and service role authentication modes:
 *
 * - **User authentication** (`base44.entities`): Operations are scoped to the currently
 *   authenticated user's permissions. Access is limited to entities the user has permission to view or modify.
 *
 * - **Service role authentication** (`client.asServiceRole.entities`): Operations have
 *   elevated permissions and can access entities across all users. This is useful for admin
 *   operations or workflows that need to operate on data regardless of user permissions.
 *
 * @example
 * ```typescript
 * // List all records
 * const records = await base44.entities.MyEntity.list();
 * ```
 *
 * @example
 * ```typescript
 * // Filter records by field
 * const activeRecords = await base44.entities.MyEntity.filter({ status: 'active' });
 * ```
 *
 * @example
 * ```typescript
 * // Get specific record by ID
 * const record = await base44.entities.MyEntity.get('entity-123');
 * ```
 *
 * @example
 * ```typescript
 * // Create new record
 * const newRecord = await base44.entities.MyEntity.create({
 *   name: 'My Item',
 *   status: 'active'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Update record
 * await base44.entities.MyEntity.update('entity-123', { status: 'completed' });
 * ```
 *
 * @example
 * ```typescript
 * // Delete record
 * await base44.entities.MyEntity.delete('entity-123');
 * ```
 *
 * @example
 * ```typescript
 * // Bulk operations
 * await base44.entities.MyEntity.bulkCreate([
 *   { name: 'Item 1' },
 *   { name: 'Item 2' }
 * ]);
 * ```
 *
 * @example
 * ```typescript
 * // Delete many
 * await base44.entities.MyEntity.deleteMany({ status: 'completed' });
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
