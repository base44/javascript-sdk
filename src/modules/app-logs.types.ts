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
 * App Logs module for tracking and analyzing app usage.
 *
 * This module provides methods to log user activity, fetch logs, and retrieve
 * statistics about the app's usage. Useful for analytics, monitoring,
 * and understanding user behavior.
 *
 * This module is available to use with a client in all authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.appLogs`): Access is scoped to the current user's permissions. Anonymous users can create logs but cannot retrieve them, while authenticated users can create logs and retrieve only their own logs and statistics.
 * - **Service role authentication** (`base44.asServiceRole.appLogs`): Operations have elevated admin-level permissions. Can access all logs and statistics that the app's admin role has access to. This is useful for admin dashboards, analytics, and monitoring overall usage patterns.
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
 * // Get app statistics
 * const stats = await base44.appLogs.getStats({
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31'
 * });
 * ```
 */
export interface AppLogsModule {
  /**
   * Log user activity in the app.
   *
   * Records when a user visits a specific page or section of the app.
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
   * Fetch app logs with optional filtering.
   *
   * Retrieves logs of user activity with support for filtering, pagination,
   * and sorting. Use this to analyze user behavior and app usage patterns.
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
   * Gets app usage statistics.
   *
   * Retrieves aggregated statistics about app usage, such as page views,
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
