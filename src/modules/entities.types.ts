/**
 * Entity handler providing CRUD operations for a specific entity type.
 *
 * Each entity in your Base44 app (like User, Todo, Product, etc.) gets
 * a handler with these methods for managing data.
 */
export interface EntityHandler {
  /**
   * List entities with optional pagination and sorting.
   *
   * Retrieves all entities of this type with support for sorting,
   * pagination, and field selection.
   *
   * @param sort - Sort parameter (e.g., "-created_date" for descending)
   * @param limit - Maximum number of results to return
   * @param skip - Number of results to skip (for pagination)
   * @param fields - Array of field names to include in the response
   * @returns Promise resolving to an array of entities
   *
   * @example
   * ```typescript
   * // Get all todos
   * const todos = await client.entities.Todo.list();
   *
   * // Get first 10 todos sorted by date
   * const recentTodos = await client.entities.Todo.list('-created_date', 10);
   *
   * // Get paginated results (skip first 20, get next 10)
   * const page3 = await client.entities.Todo.list(null, 10, 20);
   *
   * // Get only specific fields
   * const titles = await client.entities.Todo.list(null, null, null, ['title', 'completed']);
   * ```
   */
  list(
    sort?: string,
    limit?: number,
    skip?: number,
    fields?: string[]
  ): Promise<any>;

  /**
   * Filter entities based on a query.
   *
   * Retrieves entities that match specific criteria with support for
   * sorting, pagination, and field selection.
   *
   * @param query - Filter query object with field-value pairs
   * @param sort - Sort parameter (e.g., "-created_date" for descending)
   * @param limit - Maximum number of results to return
   * @param skip - Number of results to skip (for pagination)
   * @param fields - Array of field names to include in the response
   * @returns Promise resolving to an array of filtered entities
   *
   * @example
   * ```typescript
   * // Filter by single field
   * const completedTodos = await client.entities.Todo.filter({
   *   completed: true
   * });
   *
   * // Filter by multiple fields
   * const highPriorityTodos = await client.entities.Todo.filter({
   *   priority: 'high',
   *   completed: false
   * });
   *
   * // Filter with sorting and pagination
   * const results = await client.entities.Todo.filter(
   *   { status: 'active' },
   *   '-created_date',
   *   20,
   *   0
   * );
   *
   * // Filter with specific fields
   * const titles = await client.entities.Todo.filter(
   *   { priority: 'high' },
   *   null,
   *   null,
   *   null,
   *   ['title', 'priority']
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
   * Get a single entity by ID.
   *
   * Retrieves a specific entity using its unique identifier.
   *
   * @param id - The unique identifier of the entity
   * @returns Promise resolving to the entity
   *
   * @example
   * ```typescript
   * const todo = await client.entities.Todo.get('todo-123');
   * console.log(todo.title);
   *
   * const user = await client.entities.User.get('user-456');
   * console.log(user.email);
   * ```
   */
  get(id: string): Promise<any>;

  /**
   * Create a new entity.
   *
   * Creates a new entity with the provided data.
   *
   * @param data - Object containing the entity data
   * @returns Promise resolving to the created entity
   *
   * @example
   * ```typescript
   * const newTodo = await client.entities.Todo.create({
   *   title: 'Buy groceries',
   *   completed: false,
   *   priority: 'high'
   * });
   * console.log('Created todo with ID:', newTodo.id);
   *
   * const newUser = await client.entities.User.create({
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   role: 'user'
   * });
   * ```
   */
  create(data: Record<string, any>): Promise<any>;

  /**
   * Update an existing entity.
   *
   * Updates an entity by ID with the provided data. Only the fields
   * included in the data object will be updated.
   *
   * @param id - The unique identifier of the entity to update
   * @param data - Object containing the fields to update
   * @returns Promise resolving to the updated entity
   *
   * @example
   * ```typescript
   * // Update single field
   * const updated = await client.entities.Todo.update('todo-123', {
   *   completed: true
   * });
   *
   * // Update multiple fields
   * const updated = await client.entities.Todo.update('todo-123', {
   *   title: 'Updated title',
   *   priority: 'low',
   *   completed: true
   * });
   * ```
   */
  update(id: string, data: Record<string, any>): Promise<any>;

  /**
   * Delete a single entity by ID.
   *
   * Permanently removes an entity from the database.
   *
   * @param id - The unique identifier of the entity to delete
   * @returns Promise that resolves when the entity is deleted
   *
   * @example
   * ```typescript
   * await client.entities.Todo.delete('todo-123');
   * console.log('Todo deleted');
   *
   * await client.entities.User.delete('user-456');
   * ```
   */
  delete(id: string): Promise<void>;

  /**
   * Delete multiple entities matching a query.
   *
   * Permanently removes all entities that match the provided query.
   * Use with caution as this operation cannot be undone.
   *
   * @param query - Filter query object to match entities for deletion
   * @returns Promise that resolves when the entities are deleted
   *
   * @example
   * ```typescript
   * // Delete all completed todos
   * await client.entities.Todo.deleteMany({
   *   completed: true
   * });
   *
   * // Delete all low priority items
   * await client.entities.Todo.deleteMany({
   *   priority: 'low'
   * });
   *
   * // Delete by multiple criteria
   * await client.entities.Todo.deleteMany({
   *   completed: true,
   *   priority: 'low'
   * });
   * ```
   */
  deleteMany(query: Record<string, any>): Promise<void>;

  /**
   * Create multiple entities in a single request.
   *
   * Efficiently creates multiple entities at once. This is faster
   * than creating them individually.
   *
   * @param data - Array of entity data objects
   * @returns Promise resolving to an array of created entities
   *
   * @example
   * ```typescript
   * const newTodos = await client.entities.Todo.bulkCreate([
   *   { title: 'Task 1', completed: false },
   *   { title: 'Task 2', completed: false },
   *   { title: 'Task 3', completed: true }
   * ]);
   * console.log(`Created ${newTodos.length} todos`);
   *
   * const newUsers = await client.entities.User.bulkCreate([
   *   { name: 'Alice', email: 'alice@example.com' },
   *   { name: 'Bob', email: 'bob@example.com' }
   * ]);
   * ```
   */
  bulkCreate(data: Record<string, any>[]): Promise<any>;

  /**
   * Import entities from a file.
   *
   * Imports entities from a file (typically CSV or similar format).
   * The file format should match your entity structure. Requires a browser environment and cannot be used in the backend.
   *
   * @param file - File object to import
   * @returns Promise resolving to the import result
   *
   * @example
   * ```typescript
   * // In a browser with file input
   * const fileInput = document.querySelector('input[type="file"]');
   * const file = fileInput.files[0];
   *
   * const result = await client.entities.Todo.importEntities(file);
   * console.log(`Imported ${result.count} todos`);
   * ```
   */
  importEntities(file: File): Promise<any>;
}

/**
 * Entities module for managing application data.
 *
 * This module provides dynamic access to all entities in your Base44 app.
 * Each entity (like User, Todo, Product, etc.) gets a handler with full
 * CRUD operations and additional utility methods.
 *
 * **Dynamic Access:**
 * Entities are accessed dynamically using: `client.entities.EntityName.method()`
 *
 * **Available with both auth modes:**
 * - User auth: `client.entities.EntityName.method(...)`
 * - Service role: `client.asServiceRole.entities.EntityName.method(...)`
 *
 * @example
 * ```typescript
 * // List all todos
 * const todos = await client.entities.Todo.list();
 *
 * // Filter users by role
 * const admins = await client.entities.User.filter({ role: 'admin' });
 *
 * // Get specific product
 * const product = await client.entities.Product.get('prod-123');
 *
 * // Create new todo
 * const newTodo = await client.entities.Todo.create({
 *   title: 'Buy groceries',
 *   completed: false
 * });
 *
 * // Update entity
 * await client.entities.Todo.update('todo-123', { completed: true });
 *
 * // Delete entity
 * await client.entities.Todo.delete('todo-123');
 *
 * // Bulk operations
 * await client.entities.Todo.bulkCreate([
 *   { title: 'Task 1' },
 *   { title: 'Task 2' }
 * ]);
 *
 * // Delete many
 * await client.entities.Todo.deleteMany({ completed: true });
 * ```
 */
export type EntitiesModule = {
  /**
   * Access any entity by name.
   *
   * Use this to access custom entities defined in your Base44 app.
   *
   * @example
   * ```typescript
   * // Built-in entities
   * client.entities.User
   * client.entities.Todo
   *
   * // Custom entities
   * client.entities.Product
   * client.entities.Order
   * client.entities.Invoice
   * ```
   */
  [entityName: string]: EntityHandler;
};
