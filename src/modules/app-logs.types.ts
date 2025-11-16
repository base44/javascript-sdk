/**
 * App Logs module for tracking and analyzing application usage.
 *
 * This module provides methods to log user activity, fetch logs, and retrieve
 * statistics about your application's usage. Useful for analytics, monitoring,
 * and understanding user behavior.
 *
 * **Available with both auth modes:**
 * - User auth: `client.appLogs.method(...)`
 * - Service role: `client.asServiceRole.appLogs.method(...)`
 *
 * @example
 * ```typescript
 * // Log user visiting a page
 * await client.appLogs.logUserInApp('dashboard');
 *
 * // Fetch recent logs
 * const logs = await client.appLogs.fetchLogs({
 *   limit: 100,
 *   sort: '-timestamp'
 * });
 *
 * // Get application statistics
 * const stats = await client.appLogs.getStats({
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
   * @param pageName - Name of the page or section being visited
   * @returns Promise that resolves when the log is recorded
   *
   * @example
   * ```typescript
   * // Log page visit
   * await client.appLogs.logUserInApp('home');
   * await client.appLogs.logUserInApp('profile');
   * await client.appLogs.logUserInApp('settings');
   *
   * // Log specific feature usage
   * await client.appLogs.logUserInApp('checkout-page');
   * await client.appLogs.logUserInApp('product-details');
   * ```
   */
  logUserInApp(pageName: string): Promise<void>;

  /**
   * Fetch application logs with optional filtering.
   *
   * Retrieves logs of user activity with support for filtering, pagination,
   * and sorting. Use this to analyze user behavior and application usage patterns.
   *
   * @param params - Query parameters for filtering logs (limit, sort, date ranges, etc.)
   * @returns Promise resolving to the logs data
   *
   * @example
   * ```typescript
   * // Fetch all logs
   * const allLogs = await client.appLogs.fetchLogs();
   *
   * // Fetch logs with pagination
   * const recentLogs = await client.appLogs.fetchLogs({
   *   limit: 50,
   *   skip: 0,
   *   sort: '-timestamp'
   * });
   *
   * // Fetch logs for a specific page
   * const dashboardLogs = await client.appLogs.fetchLogs({
   *   pageName: 'dashboard'
   * });
   *
   * // Fetch logs within a date range
   * const periodLogs = await client.appLogs.fetchLogs({
   *   startDate: '2024-01-01',
   *   endDate: '2024-01-31'
   * });
   * ```
   */
  fetchLogs(params?: Record<string, any>): Promise<any>;

  /**
   * Get application usage statistics.
   *
   * Retrieves aggregated statistics about application usage, such as page views,
   * active users, and popular features. Useful for dashboards and analytics.
   *
   * @param params - Query parameters for filtering statistics (date ranges, grouping, etc.)
   * @returns Promise resolving to the statistics data
   *
   * @example
   * ```typescript
   * // Get overall stats
   * const stats = await client.appLogs.getStats();
   *
   * // Get stats for a specific time period
   * const monthlyStats = await client.appLogs.getStats({
   *   startDate: '2024-01-01',
   *   endDate: '2024-01-31'
   * });
   *
   * // Get stats grouped by page
   * const pageStats = await client.appLogs.getStats({
   *   groupBy: 'page'
   * });
   *
   * // Get daily active users
   * const dailyStats = await client.appLogs.getStats({
   *   period: 'daily',
   *   metric: 'active_users'
   * });
   * ```
   */
  getStats(params?: Record<string, any>): Promise<any>;
}
