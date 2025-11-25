[**@base44/sdk**](../README.md)

***

# Interface: AppLogsModule

App Logs module for tracking and analyzing app usage.

This module provides methods to log user activity, fetch logs, and retrieve
statistics about the app's usage. Useful for analytics, monitoring,
and understanding user behavior.

This module is available to use with a client in both user and service role authentication modes:

- **User authentication** (`base44.appLogs`): Operations are scoped to the currently
  authenticated user. For example, `fetchLogs()` returns only logs for the current user,
  and `getStats()` returns statistics about that user's activity.

- **Service role authentication** (`client.asServiceRole.appLogs`): Operations have
  elevated permissions and can access data across all users. For example, `fetchLogs()`
  returns logs from all users in the app, and `getStats()` returns app-wide
  statistics. This is useful for admin dashboards, analytics, and monitoring overall usage patterns.

## Examples

```typescript
// Log user visiting a page
await base44.appLogs.logUserInApp('dashboard');
```

```typescript
// Fetch recent logs
const logs = await base44.appLogs.fetchLogs({
  limit: 100,
  sort: '-timestamp'
});
```

```typescript
// Get app statistics
const stats = await base44.appLogs.getStats({
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});
```

## Methods

### logUserInApp()

> **logUserInApp**(`pageName`): `Promise`\<`void`\>

Log user activity in the app.

Records when a user visits a specific page or section of the app.
Useful for tracking user navigation patterns and popular features.

#### Parameters

##### pageName

`string`

Name of the page or section being visited.

#### Returns

`Promise`\<`void`\>

Promise that resolves when the log is recorded.

#### Examples

```typescript
// Log page visit
await base44.appLogs.logUserInApp('home');
await base44.appLogs.logUserInApp('profile');
await base44.appLogs.logUserInApp('settings');
```

```typescript
// Log specific feature usage
await base44.appLogs.logUserInApp('checkout-page');
await base44.appLogs.logUserInApp('product-details');
```

***

### fetchLogs()

> **fetchLogs**(`params?`): `Promise`\<`any`\>

Fetch app logs with optional filtering.

Retrieves logs of user activity with support for filtering, pagination,
and sorting. Use this to analyze user behavior and app usage patterns.

#### Parameters

##### params?

[`FetchLogsParams`](FetchLogsParams.md)

Query parameters for filtering logs.

#### Returns

`Promise`\<`any`\>

Promise resolving to the logs data.

#### Examples

```typescript
// Fetch all logs
const allLogs = await base44.appLogs.fetchLogs();
```

```typescript
// Fetch logs with pagination
const recentLogs = await base44.appLogs.fetchLogs({
  limit: 50,
  skip: 0,
  sort: '-timestamp'
});
```

```typescript
// Fetch logs for a specific page
const dashboardLogs = await base44.appLogs.fetchLogs({
  pageName: 'dashboard'
});
```

```typescript
// Fetch logs within a date range
const periodLogs = await base44.appLogs.fetchLogs({
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});
```

***

### getStats()

> **getStats**(`params?`): `Promise`\<`any`\>

Gets app usage statistics.

Retrieves aggregated statistics about app usage, such as page views,
active users, and popular features. Useful for dashboards and analytics.

#### Parameters

##### params?

[`GetStatsParams`](GetStatsParams.md)

Query parameters for filtering and grouping statistics.

#### Returns

`Promise`\<`any`\>

Promise resolving to the statistics data.

#### Examples

```typescript
// Get overall stats
const stats = await base44.appLogs.getStats();
```

```typescript
// Get stats for a specific time period
const monthlyStats = await base44.appLogs.getStats({
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});
```

```typescript
// Get stats grouped by page
const pageStats = await base44.appLogs.getStats({
  groupBy: 'page'
});
```

```typescript
// Get daily active users
const dailyStats = await base44.appLogs.getStats({
  period: 'daily',
  metric: 'active_users'
});
```
