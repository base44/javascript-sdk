export * from "./modules/types.js";

/**
 * Parameters for filtering, sorting, and paginating model data.
 *
 * This type is primarily used in the agents module for querying agent
 * conversations. It provides a structured way to specify query criteria,
 * sorting, pagination, and field selection.
 *
 * @property q - Query object with field-value pairs for filtering
 * @property sort - Sort parameter (e.g., "-created_date" for descending order)
 * @property sort_by - Alternative sort parameter (use either `sort` or `sort_by`)
 * @property limit - Maximum number of results to return
 * @property skip - Number of results to skip (for pagination)
 * @property fields - Array of field names to include in the response
 *
 * @example
 * ```typescript
 * // Basic filtering by agent name
 * const conversations = await client.agents.listConversations({
 *   q: { agent_name: 'support-bot' }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Filtering with sorting
 * const conversations = await client.agents.listConversations({
 *   q: { status: 'active' },
 *   sort: '-created_at'  // Sort by created_at descending
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Pagination with limit and skip
 * const conversations = await client.agents.listConversations({
 *   q: { agent_name: 'support-bot' },
 *   limit: 20,  // Get 20 results
 *   skip: 40    // Skip first 40 (page 3)
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Field selection (only return specific fields)
 * const conversations = await client.agents.listConversations({
 *   q: { status: 'active' },
 *   fields: ['id', 'agent_name', 'created_at']
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Complex query with multiple filters
 * const conversations = await client.agents.listConversations({
 *   q: {
 *     agent_name: 'support-bot',
 *     'metadata.priority': 'high',
 *     status: 'active'
 *   },
 *   sort: '-updated_at',
 *   limit: 50,
 *   skip: 0
 * });
 * ```
 */
export type ModelFilterParams = {
  q?: Record<string, any>;
  sort?: string | null;
  sort_by?: string | null;
  limit?: number | null;
  skip?: number | null;
  fields?: string[] | null;
};


