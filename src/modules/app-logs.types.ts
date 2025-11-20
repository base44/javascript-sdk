/**
 * Parameters for fetching app logs.
 */
export interface FetchLogsParams {
  /** Maximum number of logs to return. */
  limit?: number;
  /** Number of logs to skip for pagination. */
  skip?: number;
  /** Sort order, such as `'-timestamp'` for descending by timestamp. */
  sort?: string;
  /** Filter logs by page name. */
  pageName?: string;
  /** Filter logs from this date as an ISO string. */
  startDate?: string;
  /** Filter logs until this date as an ISO string. */
  endDate?: string;
  /** Additional filter parameters. */
  [key: string]: any;
}

/**
 * Parameters for fetching app statistics.
 */
export interface GetStatsParams {
  /** Filter stats from this date as an ISO string. */
  startDate?: string;
  /** Filter stats until this date as an ISO string. */
  endDate?: string;
  /** Group statistics by a specific field, such as `'page'`. */
  groupBy?: string;
  /** Time period for grouping, such as `'daily'`, `'weekly'`, or `'monthly'`. */
  period?: string;
  /** Specific metric to retrieve, such as `'active_users'` or `'page_views'`. */
  metric?: string;
  /** Additional query parameters. */
  [key: string]: any;
}

/**
 * App Logs module for tracking and analyzing application usage.
 *
 * This module provides methods to log user activity, fetch logs, and retrieve
 * statistics about your application's usage. Useful for analytics, monitoring,
 * and understanding user behavior.
 *
 * Methods in this module respect the authentication mode used when calling them:
 *
 * - **User authentication** (`base44.appLogs`): Operations are scoped to the currently
 *   authenticated user. For example, `fetchLogs()` returns only logs for the current user,
 *   and `getStats()` returns statistics about that user's activity.
 *
 * - **Service role authentication** (`client.asServiceRole.appLogs`): Operations have
 *   elevated permissions and can access data across all users. For example, `fetchLogs()`
 *   returns logs from all users in your application, and `getStats()` returns application-wide
 *   statistics. This is useful for admin dashboards, analytics, and monitoring overall usage patterns.
 *
 * @example
 * ```typescript
 * // Log user visiting a page
 * await base44.appLogs.logUserInApp('dashboard');
 * ```
 *
 * @example
 * ```typescript
 * // Fetch recent logs
 * const logs = await base44.appLogs.fetchLogs({
 *   limit: 100,
 *   sort: '-timestamp'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Get application statistics
 * const stats = await base44.appLogs.getStats({
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31'
 * });
 * ```
 */
export interface AppLogsModule {
  /**
   * Log user activity in the application.
   *
   * Records when a user visits a specific page or section of your application.
   * Useful for tracking user navigation patterns and popular features.
   *
   * @param pageName - Name of the page or section being visited.
   * @returns Promise that resolves when the log is recorded.
   *
   * @example
   * ```typescript
   * // Log page visit
   * await base44.appLogs.logUserInApp('home');
   * await base44.appLogs.logUserInApp('profile');
   * await base44.appLogs.logUserInApp('settings');
   * ```
   *
   * @example
   * ```typescript
   * // Log specific feature usage
   * await base44.appLogs.logUserInApp('checkout-page');
   * await base44.appLogs.logUserInApp('product-details');
   * ```
   */
  logUserInApp(pageName: string): Promise<void>;

  /**
   * Fetch application logs with optional filtering.
   *
   * Retrieves logs of user activity with support for filtering, pagination,
   * and sorting. Use this to analyze user behavior and application usage patterns.
   *
   * @param params - Query parameters for filtering logs.
   * @returns Promise resolving to the logs data.
   *
   * @example
   * ```typescript
   * // Fetch all logs
   * const allLogs = await base44.appLogs.fetchLogs();
   * ```
   *
   * @example
   * ```typescript
   * // Fetch logs with pagination
   * const recentLogs = await base44.appLogs.fetchLogs({
   *   limit: 50,
   *   skip: 0,
   *   sort: '-timestamp'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Fetch logs for a specific page
   * const dashboardLogs = await base44.appLogs.fetchLogs({
   *   pageName: 'dashboard'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Fetch logs within a date range
   * const periodLogs = await base44.appLogs.fetchLogs({
   *   startDate: '2024-01-01',
   *   endDate: '2024-01-31'
   * });
   * ```
   */
  fetchLogs(params?: FetchLogsParams): Promise<any>;

  /**
   * Gets application usage statistics.
   *
   * Retrieves aggregated statistics about application usage, such as page views,
   * active users, and popular features. Useful for dashboards and analytics.
   *
   * @param params - Query parameters for filtering and grouping statistics.
   * @returns Promise resolving to the statistics data.
   *
   * @example
   * ```typescript
   * // Get overall stats
   * const stats = await base44.appLogs.getStats();
   * ```
   *
   * @example
   * ```typescript
   * // Get stats for a specific time period
   * const monthlyStats = await base44.appLogs.getStats({
   *   startDate: '2024-01-01',
   *   endDate: '2024-01-31'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Get stats grouped by page
   * const pageStats = await base44.appLogs.getStats({
   *   groupBy: 'page'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Get daily active users
   * const dailyStats = await base44.appLogs.getStats({
   *   period: 'daily',
   *   metric: 'active_users'
   * });
   * ```
   */
  getStats(params?: GetStatsParams): Promise<any>;
}
