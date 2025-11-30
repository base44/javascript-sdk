[**@base44/sdk**](../README)

***

# Interface: FetchLogsParams

Parameters for fetching app logs.

## Indexable

\[`key`: `string`\]: `any`

Additional filter parameters.

## Properties

### limit?

> `optional` **limit**: `number`

Maximum number of logs to return.

***

### skip?

> `optional` **skip**: `number`

Number of logs to skip for pagination.

***

### sort?

> `optional` **sort**: `string`

Sort order, such as `'-timestamp'` for descending by timestamp.

***

### pageName?

> `optional` **pageName**: `string`

Filter logs by page name.

***

### startDate?

> `optional` **startDate**: `string`

Filter logs from this date as an ISO string.

***

### endDate?

> `optional` **endDate**: `string`

Filter logs until this date as an ISO string.
