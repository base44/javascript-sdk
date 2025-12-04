/**
 * App Logs module for tracking and analyzing app usage.
 *
 * This module provides a method to log user activity. The logs are reflected in the Analytics page in the app dashboard.
 *
 * This module is available to use with a client in all authentication modes.
 */
export interface AppLogsModule {
  /**
   * Log user activity in the app.
   *
   * Records when a user visits a specific page or section of the app. Useful for tracking user navigation patterns and popular features. The logs are reflected in the Analytics page in the app dashboard.
   *
   * The specified page name doesn't have to be the name of an actual page in the app, it can be any string you want to use to track the activity.
   *
   * @param pageName - Name of the page or section being visited.
   * @returns Promise that resolves when the log is recorded.
   *
   * @example
   * ```typescript
   * // Log page visit or feature usage
   * await base44.appLogs.logUserInApp('home');
   * await base44.appLogs.logUserInApp('features-section');
   * await base44.appLogs.logUserInApp('button-click');
   * ```
   */
  logUserInApp(pageName: string): Promise<void>;

  /**
   * Fetch app logs with optional parameters.
   *
   * @param params - Optional query parameters for filtering logs.
   * @returns Promise resolving to the logs data.
   * @internal
   */
  fetchLogs(params?: Record<string, any>): Promise<any>;

  /**
   * Get app statistics.
   *
   * @param params - Optional query parameters for filtering stats.
   * @returns Promise resolving to the stats data.
   * @internal
   */
  getStats(params?: Record<string, any>): Promise<any>;
}
