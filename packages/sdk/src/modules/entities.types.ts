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
 * Result returned when updating multiple entities using a query.
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
 * Options object accepted by {@linkcode EntityHandler.list | list()} and
 * {@linkcode EntityHandler.filter | filter()} to read one cursor page.
 *
 * @typeParam T - Entity record type.
 * @typeParam K - The fields to include in each record.
 */
export interface EntityListOptions<T, K extends keyof T = keyof T> {
  /** Sort parameter, such as `'-priority'` for descending. Defaults to `'-created_date'`. */
  sort?: SortField<T>;
  /** Maximum number of records per page, up to 5,000. Defaults to 100. */
  limit?: number;
  /**
   * The `next_cursor` from the previous page. Omit or pass `null` for the first page.
   *
   * The token carries this walk's parameters, so a later page needs only
   * `cursor` and `limit`. Passing different parameters with a cursor is an error.
   */
  cursor?: string | null;
  /** Array of field names to include in each record. Defaults to all fields. */
  fields?: K[];
}

/**
 * Options object accepted by {@linkcode EntityHandler.list | list()} and
 * {@linkcode EntityHandler.filter | filter()} to read the distinct values of one field
 * instead of records.
 *
 * @typeParam T - Entity record type.
 * @typeParam K - The field whose distinct values to read.
 */
export interface EntityDistinctOptions<T, K extends keyof T = keyof T> {
  /** Field whose distinct values to return, in ascending order. For an array field like `tags`, this returns the distinct individual tags used across records, not the distinct arrays. */
  distinct: K;
  /** Maximum number of values per page, up to 1,000. Defaults to 100. */
  limit?: number;
  /** The `next_cursor` from the previous page. Omit or pass `null` for the first page. The token carries this lookup's parameters. */
  cursor?: string | null;
}

/**
 * One page of items, with a cursor to continue.
 *
 * @typeParam T - Type of the items.
 */
export interface EntityPage<T> {
  /** The page's items. Without `distinct`, these are records in the requested sort order. With `distinct`, these are that field's distinct values instead of records, in ascending order. */
  items: T[];
  /** A cursor for the next page, or `null` on the last page. Pass it as `cursor` to keep paging. */
  next_cursor: string | null;
  /** Whether records remain after this page. */
  has_more: boolean;
}

/**
 * A time bucket to group a date field by, for {@linkcode EntityAggregateSpec.dateBucket | dateBucket}.
 *
 * @typeParam T - Entity record type.
 */
export interface EntityDateBucket<T> {
  /** The date field to bucket by: `created_date`, `updated_date`, or a date field of your schema. */
  field: keyof T & string;
  /** Every date field supports `day`, `month` and `year`. The `created_date` and `updated_date` fields also support `week`. */
  unit: "day" | "week" | "month" | "year";
}

/**
 * Describes what {@linkcode EntityHandler.aggregate | aggregate()} computes.
 *
 * Name the fields to group by and the measures to compute, and the server does the work and
 * returns one row per group. Field names are the entity's own field names.
 *
 * @typeParam T - Entity record type.
 */
export interface EntityAggregateSpec<T> {
  /** Filter applied before grouping, matching {@linkcode EntityFilterQuery}. Defaults to all records. */
  query?: EntityFilterQuery<T>;
  /** Field, or up to four fields, to group by. Omit to get one total row. */
  groupBy?: (keyof T & string) | (keyof T & string)[];
  /** Group by a time bucket of a date field. */
  dateBucket?: EntityDateBucket<T>;
  /** Whether to include the number of records per group as `count`. Defaults to `true`. */
  count?: boolean;
  /** Field, or fields, to sum. Each appears in the rows as `sum_<field>`. */
  sum?: (keyof T & string) | (keyof T & string)[];
  /** Field, or fields, to average. Each appears in the rows as `avg_<field>`. */
  avg?: (keyof T & string) | (keyof T & string)[];
  /** Field, or fields, to take the minimum of. Each appears in the rows as `min_<field>`. */
  min?: (keyof T & string) | (keyof T & string)[];
  /** Field, or fields, to take the maximum of. Each appears in the rows as `max_<field>`. */
  max?: (keyof T & string) | (keyof T & string)[];
  /** Field whose distinct values to count per group, returned as `count_distinct_<field>`. Unlike `distinct` on `list()`/`filter()`, an array field here counts each whole array as one value, not its individual elements. */
  countDistinct?: keyof T & string;
  /** Filter applied to the computed fields after grouping, not to raw or `groupBy` fields. Supports `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, and `$nin`. With more than one key, a row is kept only when every key's condition holds. For example, grouped by `external_id`, `having: { count: { $gt: 1 } }` keeps only the external ids that appear in more than one record. */
  having?: Record<string, any>;
  /** Computed or group field to sort the rows by, with a `-` prefix for descending. For example `'-count'`. */
  sort?: string;
  /** Maximum number of rows, up to 1,000. Defaults to 1,000. */
  limit?: number;
}

/**
 * Rows returned by {@linkcode EntityHandler.aggregate | aggregate()}.
 */
export interface EntityAggregateResult {
  /** One row per group. Each row has the group fields by name, then `count`, `sum_<field>`, `avg_<field>`, `min_<field>`, `max_<field>` or `count_distinct_<field>`. */
  rows: Record<string, any>[];
  /** Set to `true` when more groups exist than `limit` allowed. */
  truncated: boolean;
}

/**
 * Options for {@linkcode EntityHandler.upsert | upsert()}.
 *
 * @typeParam T - Entity record type.
 */
export interface EntityUpsertOptions<T> {
  /** Field, or fields, that identify a record. A record whose key values match an existing record updates it, and any other record is created. */
  key: (keyof T & string) | (keyof T & string)[];
}

/**
 * Result returned by {@linkcode EntityHandler.upsert | upsert()}.
 *
 * @typeParam T - Entity record type.
 */
export interface EntityUpsertResult<T = any> {
  /** Number of records that were created. */
  created: number;
  /** Number of existing records that were updated. */
  updated: number;
  /** The written records, created and updated, as they now exist. */
  records: T[];
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
 * Value accepted when filtering an entity field.
 *
 * Supports exact matches, `null`, array shorthand for matching any of the
 * provided values, and documented MongoDB-style query operators.
 *
 * @typeParam T - Field value type.
 */
export type EntityFilterValue<T> =
  | EntityFilterComparable<T>
  | EntityFilterComparable<T>[]
  | EntityFilterOperators<T>;

/**
 * MongoDB-style query operators accepted for a single entity field.
 *
 * @typeParam T - Field value type.
 */
export type EntityFilterOperators<T> = EntityFilterCommonOperators<T> & {
  /** Negates another field-level filter expression. */
  $not?: EntityFilterCommonOperators<T>;
};

type EntityFilterComparable<T> = Exclude<T, undefined> | null;

type EntityFilterCommonOperators<T> = {
  $eq?: EntityFilterComparable<T>;
  $ne?: EntityFilterComparable<T>;
  $gt?: EntityFilterComparable<T>;
  $gte?: EntityFilterComparable<T>;
  $lt?: EntityFilterComparable<T>;
  $lte?: EntityFilterComparable<T>;
  $in?: EntityFilterComparable<T>[];
  $nin?: EntityFilterComparable<T>[];
  $exists?: boolean;
} & EntityFilterStringOperators<T> &
  EntityFilterArrayOperators<T>;

type EntityFilterStringOperators<T> = Extract<
  Exclude<T, undefined | null>,
  string
> extends never
  ? {}
  : {
      $regex?: string;
    };

type EntityFilterArrayElement<T> = T extends readonly (infer U)[] ? U : never;

type EntityFilterArrayOperators<T> = [
  EntityFilterArrayElement<Exclude<T, undefined | null>>,
] extends [never]
  ? {}
  : {
      $all?: EntityFilterArrayElement<Exclude<T, undefined | null>>[];
      $size?: number;
    };

/**
 * Query object accepted by {@linkcode EntityHandler.filter | filter()},
 * {@linkcode EntityHandler.count | count()}, {@linkcode EntityHandler.deleteMany | deleteMany()},
 * {@linkcode EntityHandler.updateMany | updateMany()}, and the `query` field of
 * `EntityAggregateSpec`.
 *
 * Field keys are typed from the entity schema. Each field can use an exact value, `null`,
 * an array shorthand for matching any of the listed values, or a field-level operator
 * object. Root-level `$and`, `$or`, and `$nor` combine nested filter queries.
 *
 * Operator values are typed from the field they filter where possible. For example,
 * numeric fields accept numeric comparison values, string fields accept `$regex`, and
 * array fields accept `$all` and `$size`.
 *
 * @typeParam T - Entity record type.
 *
 * @example
 * ```typescript
 * // Exact match, a comparison operator, and a nested $or
 * const query: EntityFilterQuery<Task> = {
 *   status: 'open',
 *   priority: { $gte: 3 },
 *   $or: [{ assignee: 'me' }, { team: 'core' }]
 * };
 * ```
 */
export type EntityFilterQuery<T> = {
  [K in keyof T]?: EntityFilterValue<T[K]>;
} & {
  $and?: EntityFilterQuery<T>[];
  $or?: EntityFilterQuery<T>[];
  $nor?: EntityFilterQuery<T>[];
};

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
   * Lists one cursor page of records, sorted and optionally field-selected.
   *
   * Pass `cursor` from the previous page's `next_cursor` to keep paging, or omit it
   * for the first page. Records added or deleted between pages never shift the boundary.
   *
   * @typeParam K - The fields to include in each record. Defaults to all fields.
   * @param options - Paging options.
   * @returns Promise resolving to a page of records.
   *
   * @example
   * ```typescript
   * // Get one page of records
   * const page = await base44.entities.MyEntity.list({ limit: 10 });
   * console.log(page.items);
   * ```
   *
   * @example
   * ```typescript
   * // Sort records
   * const page = await base44.entities.MyEntity.list({ sort: '-priority', limit: 10 });
   * ```
   *
   * @example
   * ```typescript
   * // Only return specific fields
   * const page = await base44.entities.MyEntity.list({ fields: ['name', 'status'], limit: 10 });
   * ```
   *
   * @example
   * ```typescript
   * // Walk every record with a cursor
   * const allItems = [];
   * let page = await base44.entities.MyEntity.list({ sort: '-created_date', limit: 1000 });
   * allItems.push(...page.items);
   * while (page.has_more) {
   *   page = await base44.entities.MyEntity.list({ cursor: page.next_cursor, limit: 1000 });
   *   allItems.push(...page.items);
   * }
   * ```
   */
  list<K extends keyof T = keyof T>(
    options: EntityListOptions<T, K>,
  ): Promise<EntityPage<Pick<T, K>>>;

  /**
   * Lists one cursor page of a single field's distinct values, instead of records.
   *
   * @typeParam K - The field whose distinct values to read.
   * @param options - Paging options naming the field to read.
   * @returns Promise resolving to a page of distinct values.
   *
   * @example
   * ```typescript
   * // Regular field
   * const { items: categories } = await base44.entities.Product.list({ distinct: 'category' });
   * // categories: ['books', 'electronics', 'toys']
   * ```
   *
   * @example
   * ```typescript
   * // Array field
   * // Each tag counts once, not each array
   * const { items: tags } = await base44.entities.Product.list({ distinct: 'tags' });
   * // tags: ['bestseller', 'clearance', 'new']
   * ```
   */
  list<K extends keyof T>(
    options: EntityDistinctOptions<T, K>,
  ): Promise<EntityPage<T[K]>>;

  /**
   * Lists records as an array, using `skip` for pagination.
   *
   * Kept for existing code. Prefer a cursor for pagination instead.
   *
   * @typeParam K - The fields to include in the response. Defaults to all fields.
   * @param sort - Sort parameter, such as `'-priority'` for descending. Defaults to `'-created_date'`.
   * @param limit - Maximum number of results to return. Defaults to `5000`.
   * @param skip - Number of results to skip for pagination. Defaults to `0`. Prefer a cursor for loops instead.
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
   * Filters and returns one cursor page of matching records, sorted and
   * optionally field-selected.
   *
   * Pass `cursor` from the previous page's `next_cursor` to keep paging, or omit it
   * for the first page. Records added or deleted between pages never shift the boundary.
   *
   * @typeParam K - The fields to include in each record. Defaults to all fields.
   * @param query - Query matching {@linkcode EntityFilterQuery}. Field names are
   * case-sensitive, and records matching every field are returned.
   * @param options - Paging options.
   * @returns Promise resolving to a page of matching records.
   *
   * @example
   * ```typescript
   * // Get one page of matching records
   * const page = await base44.entities.Order.filter({ status: 'open' }, { limit: 10 });
   * console.log(page.items);
   * ```
   *
   * @example
   * ```typescript
   * // Sort matching records
   * const page = await base44.entities.Order.filter({ status: 'open' }, { sort: '-priority', limit: 10 });
   * ```
   *
   * @example
   * ```typescript
   * // Only return specific fields
   * const page = await base44.entities.Order.filter({ status: 'open' }, { fields: ['status', 'region'], limit: 10 });
   * ```
   *
   * @example
   * ```typescript
   * // Walk all matching records with a cursor
   * const allOrders = [];
   * let page = await base44.entities.Order.filter(
   *   { status: 'open' },
   *   { sort: '-created_date', limit: 1000 }
   * );
   * allOrders.push(...page.items);
   * while (page.has_more) {
   *   page = await base44.entities.Order.filter({ status: 'open' }, { cursor: page.next_cursor, limit: 1000 });
   *   allOrders.push(...page.items);
   * }
   * ```
   */
  filter<K extends keyof T = keyof T>(
    query: EntityFilterQuery<T>,
    options: EntityListOptions<T, K>,
  ): Promise<EntityPage<Pick<T, K>>>;

  /**
   * Filters and returns one cursor page of a single field's distinct values
   * among matching records.
   *
   * @typeParam K - The field whose distinct values to read.
   * @param query - Query matching {@linkcode EntityFilterQuery}. Field names are
   * case-sensitive, and records matching every field are returned.
   * @param options - Paging options naming the field to read.
   * @returns Promise resolving to a page of distinct values.
   *
   * @example
   * ```typescript
   * // Regular field
   * const { items: regions } = await base44.entities.Order.filter(
   *   { status: 'open' },
   *   { distinct: 'region' }
   * );
   * // regions: ['east', 'north', 'west']
   * ```
   *
   * @example
   * ```typescript
   * // Array field
   * // Each tag counts once, not each array
   * const { items: tags } = await base44.entities.Order.filter(
   *   { status: 'open' },
   *   { distinct: 'tags' }
   * );
   * // tags: ['gift', 'international', 'rush']
   * ```
   */
  filter<K extends keyof T>(
    query: EntityFilterQuery<T>,
    options: EntityDistinctOptions<T, K>,
  ): Promise<EntityPage<T[K]>>;

  /**
   * Filters records as an array, using `skip` for pagination.
   *
   * Kept for existing code. Prefer a cursor for pagination instead.
   *
   * @typeParam K - The fields to include in the response. Defaults to all fields.
   * @param query - Query matching {@linkcode EntityFilterQuery}. Field names are
   * case-sensitive, and records matching every field are returned.
   * @param sort - Sort parameter, such as `'-priority'` for descending. Defaults to `'-created_date'`.
   * @param limit - Maximum number of results to return. Defaults to `5000`.
   * @param skip - Number of results to skip for pagination. Defaults to `0`. Prefer a cursor for loops instead.
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
   * // Filter by any matching value
   * const records = await base44.entities.MyEntity.filter({
   *   external_id: ['item-1', 'item-2']
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Filter with query operators
   * const popularRecords = await base44.entities.MyEntity.filter({
   *   count: { $gte: 100 },
   *   external_id: { $in: ['item-1', 'item-2'] }
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Filter with logical operators
   * const records = await base44.entities.MyEntity.filter({
   *   $or: [
   *     { name: 'Example item' },
   *     { slug: 'example-item' }
   *   ]
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Filter null values
   * const recordsWithoutDescription = await base44.entities.MyEntity.filter({
   *   description: null
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
    query: EntityFilterQuery<T>,
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
   * To update a single record by ID, use this method. To apply the same
   * update to many records matching a query, use {@linkcode updateMany | updateMany()}.
   * To update multiple specific records with different data each, use
   * {@linkcode bulkUpdate | bulkUpdate()}.
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
   * @param query - Query matching {@linkcode EntityFilterQuery}. Every matching record is deleted.
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
   * Applies the same update to all records that match a query.
   *
   * Use this when you need to make the same change across all records that
   * match specific criteria. For example, you could set every completed order
   * to "archived", or increment a counter on all active users.
   *
   * Results are batched in groups of up to 500. When `has_more` is `true`
   * in the response, call `updateMany` again with the same query to update
   * the next batch. Make sure the query excludes already-updated records
   * so you don't re-process the same entities on each iteration. For
   * example, filter by `status: 'pending'` when setting status to `'processed'`.
   *
   * To update a single record by ID, use {@linkcode update | update()} instead. To update
   * multiple specific records with different data each, use {@linkcode bulkUpdate | bulkUpdate()}.
   *
   * @param query - Query matching {@linkcode EntityFilterQuery}, selecting which records to update.
   * @param data - Update operation object containing one or more
   * [MongoDB update operators](https://www.mongodb.com/docs/manual/reference/operator/update/).
   * Each field may only appear in one operator per call.
   * Supported update operators include `$set`, `$rename`, `$unset`, `$inc`, `$mul`, `$min`, `$max`,
   * `$currentDate`, `$addToSet`, `$push`, and `$pull`.
   * @returns Promise resolving to the update result.
   *
   * @example
   * ```typescript
   * // Basic usage
   * // Archive all completed orders
   * const result = await base44.entities.Order.updateMany(
   *   { status: 'completed' },
   *   { $set: { status: 'archived' } }
   * );
   * console.log(`Updated ${result.updated} records`);
   * ```
   *
   * @example
   * ```typescript
   * // Multiple query operators
   * // Flag urgent items that haven't been handled yet
   * const result = await base44.entities.Task.updateMany(
   *   { priority: { $in: ['high', 'critical'] }, status: { $ne: 'done' } },
   *   { $set: { flagged: true } }
   * );
   * ```
   *
   * @example
   * ```typescript
   * // Multiple update operators
   * // Close out sales records and bump the view count
   * const result = await base44.entities.Deal.updateMany(
   *   { category: 'sales' },
   *   { $set: { status: 'done' }, $inc: { view_count: 1 } }
   * );
   * ```
   *
   * @example
   * ```typescript
   * // Batched updates
   * // Process all pending items in batches of 500.
   * // The query filters by 'pending', so updated records (now 'processed')
   * // are automatically excluded from the next batch.
   * let hasMore = true;
   * let totalUpdated = 0;
   * while (hasMore) {
   *   const result = await base44.entities.Job.updateMany(
   *     { status: 'pending' },
   *     { $set: { status: 'processed' } }
   *   );
   *   totalUpdated += result.updated;
   *   hasMore = result.has_more;
   * }
   * ```
   */
  updateMany(
    query: Partial<T>,
    data: Record<string, Record<string, any>>,
  ): Promise<UpdateManyResult>;

  /**
   * Counts the records that match a query.
   *
   * Returns the number of records the current user can read, without fetching them.
   * Use it for totals, badges and "page N of M".
   *
   * @param query - Query matching {@linkcode EntityFilterQuery}. Defaults to all records.
   * @returns Promise resolving to the number of matching records.
   *
   * @example
   * ```typescript
   * // Count matching records
   * const open = await base44.entities.Task.count({ status: 'open' });
   * ```
   *
   * @example
   * ```typescript
   * // Count all records
   * const total = await base44.entities.Task.count();
   * ```
   *
   * @example
   * ```typescript
   * // Page N of M
   * const pageSize = 20;
   * const total = await base44.entities.Task.count({ status: 'open' });
   * const totalPages = Math.ceil(total / pageSize);
   * ```
   */
  count(query?: EntityFilterQuery<T>): Promise<number>;

  /**
   * Computes counts, sums, averages, minimums, maximums or distinct counts, grouped by fields.
   *
   * Use it for dashboards, leaderboards and reports instead of loading every record
   * and adding up in the browser. The server groups the records you can read and
   * returns one row per group, up to 1,000 rows.
   *
   * @param spec - What to group by and what to compute.
   * @returns Promise resolving to the rows and a `truncated` flag.
   *
   * @example
   * ```typescript
   * // Sales per agent this month, biggest first
   * const { rows } = await base44.entities.Sale.aggregate({
   *   query: { sale_date: { $gte: '2026-09-01' } },
   *   groupBy: 'agent_id',
   *   sum: 'amount',
   *   sort: '-sum_amount'
   * });
   * // rows: [
   * //   { agent_id: 'a1', count: 42, sum_amount: 18250 },
   * //   { agent_id: 'a2', count: 37, sum_amount: 15400 },
   * //   ...
   * // ]
   * ```
   *
   * @example
   * ```typescript
   * // Tasks created per day
   * const { rows } = await base44.entities.Task.aggregate({
   *   dateBucket: { field: 'created_date', unit: 'day' }
   * });
   * // rows: [
   * //   { created_date: '2026-09-01', count: 8 },
   * //   { created_date: '2026-09-02', count: 11 },
   * //   ...
   * // ]
   * ```
   *
   * @example
   * ```typescript
   * // Find duplicated external ids
   * const { rows } = await base44.entities.Order.aggregate({
   *   groupBy: 'external_id',
   *   having: { count: { $gt: 1 } }
   * });
   * // rows: [
   * //   { external_id: 'ext-42', count: 3 },
   * //   { external_id: 'ext-77', count: 2 }
   * // ]
   * ```
   *
   * @example
   * ```typescript
   * // Unique customers per product
   * const { rows } = await base44.entities.Order.aggregate({
   *   groupBy: 'product_id',
   *   countDistinct: 'customer_id'
   * });
   * // rows: [
   * //   { product_id: 'p1', count_distinct_customer_id: 86 },
   * //   { product_id: 'p2', count_distinct_customer_id: 34 }
   * // ]
   * ```
   */
  aggregate(spec: EntityAggregateSpec<T>): Promise<EntityAggregateResult>;

  /**
   * Creates or updates records by a key you define, instead of by `id`.
   *
   * Use this whenever records have a natural key, such as an ID from another system or a
   * one-per-user record keyed by `user_id`, so you don't have to look up each record first
   * to decide between create and update. Name the field, or fields, that identify a record,
   * and the server updates the records whose key already exists and creates the rest, in
   * one call.
   *
   * You can upsert up to 500 records per request. When two records in one call share a
   * key, the last one wins. Updates merge the given fields into the existing record, like
   * {@linkcode update | update()}.
   *
   * @param records - Array of record data objects. Each must carry a value, not an object or
   * array, for every field named in `options.key`, to find or create by. Other fields are
   * optional, and only the ones you include are merged into a matched record, like `update()`.
   * @param options - The key field or fields.
   * @returns Promise resolving to the counts and the written records.
   *
   * @example
   * ```typescript
   * // Sync by sku
   * const result = await base44.entities.Product.upsert(
   *   supplierCatalog.map(p => ({ sku: p.sku, name: p.name, price: p.price })),
   *   { key: 'sku' }
   * );
   * console.log(`${result.created} new, ${result.updated} updated`);
   * ```
   *
   * @example
   * ```typescript
   * // Compound key
   * const result = await base44.entities.Inventory.upsert(
   *   warehouseFeed.map(row => ({ sku: row.sku, warehouse: row.warehouseCode, quantity: row.qty })),
   *   { key: ['sku', 'warehouse'] }
   * );
   * console.log(`${result.created} new, ${result.updated} updated`);
   * ```
   */
  upsert(
    records: Partial<T>[],
    options: EntityUpsertOptions<T>,
  ): Promise<EntityUpsertResult<T>>;

  /**
   * Updates the specified records in a single request, each with its own data.
   *
   * Use this when you already know which records to update and each one needs
   * different field values. For example, you could update the status and amount
   * on three separate invoices in one call.
   *
   * You can update up to 500 records per request.
   *
   * To apply the same update to all records matching a query, use
   * {@linkcode updateMany | updateMany()}. To update a single record by ID, use
   * {@linkcode update | update()}.
   *
   * @param data - Array of objects to update. Each object must contain an `id` field identifying which record to update and any fields to change.
   * @returns Promise resolving to an array of the updated records.
   *
   * @example
   * ```typescript
   * // Basic usage
   * // Update three invoices with different statuses and amounts
   * const updated = await base44.entities.Invoice.bulkUpdate([
   *   { id: 'inv-1', status: 'paid', amount: 999 },
   *   { id: 'inv-2', status: 'cancelled' },
   *   { id: 'inv-3', amount: 450 }
   * ]);
   * ```
   *
   * @example
   * ```typescript
   * // More than 500 items
   * // Reassign each task to a different owner in batches
   * const allUpdates = reassignments.map(r => ({ id: r.taskId, owner: r.newOwner }));
   * for (let i = 0; i < allUpdates.length; i += 500) {
   *   const batch = allUpdates.slice(i, i + 500);
   *   await base44.entities.Task.bulkUpdate(batch);
   * }
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
 * - **Service role authentication** (`base44.asServiceRole.entities`): Operations bypass entity access rules and field-level security entirely. Can read and write any record in any entity.
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
 * // List every user, bypassing the User entity's access rules
 * const allUsers = await base44.asServiceRole.entities.User.list();
 * ```
 */
export type EntitiesModule = TypedEntitiesModule & DynamicEntitiesModule;
