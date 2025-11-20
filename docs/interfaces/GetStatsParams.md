[**@base44/sdk**](../README.md)

***

# Interface: GetStatsParams

Parameters for fetching app statistics.

## Indexable

\[`key`: `string`\]: `any`

Additional query parameters.

## Properties

### startDate?

> `optional` **startDate**: `string`

Filter stats from this date as an ISO string.

***

### endDate?

> `optional` **endDate**: `string`

Filter stats until this date as an ISO string.

***

### groupBy?

> `optional` **groupBy**: `string`

Group statistics by a specific field, such as `'page'`.

***

### period?

> `optional` **period**: `string`

Time period for grouping, such as `'daily'`, `'weekly'`, or `'monthly'`.

***

### metric?

> `optional` **metric**: `string`

Specific metric to retrieve, such as `'active_users'` or `'page_views'`.
