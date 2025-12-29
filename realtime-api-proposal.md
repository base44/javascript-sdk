# Realtime API Proposal

This document outlines the proposed public API for realtime entity subscriptions in the Base44 SDK.

## Overview

The realtime API enables users to subscribe to live updates on entities. It supports:

- **All entity changes**: Subscribe to any create/update/delete on an entity type
- **Single entity instance**: Subscribe to changes on a specific entity by ID
- **Query-based subscriptions**: Subscribe to entities matching a filter (e.g., all completed tasks)

---

## Type Definitions

```typescript
// In entities.types.ts

/**
 * Event types for realtime entity updates.
 */
export type RealtimeEventType = "create" | "update" | "delete";

/**
 * Payload received when a realtime event occurs.
 */
export interface RealtimeEvent<T = Record<string, any>> {
  /** The type of change that occurred */
  type: RealtimeEventType;
  /** The entity data (new/updated for create/update, previous for delete) */
  data: T;
  /** The unique identifier of the affected entity */
  id: string;
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
  /** For update events, contains the previous data before the change */
  previousData?: T;
}

/**
 * Callback function invoked when a realtime event occurs.
 */
export type RealtimeCallback<T = Record<string, any>> = (
  event: RealtimeEvent<T>
) => void;

/**
 * Options for subscribing to realtime updates.
 */
export interface SubscribeOptions {
  /** Filter events by type. Defaults to all types. */
  events?: RealtimeEventType[];
}

/**
 * Handle returned from subscribe, used to unsubscribe.
 */
export interface Subscription {
  /** Stops listening to updates and cleans up the subscription. */
  unsubscribe: () => void;
}
```

---

## Extended EntityHandler Interface

````typescript
export interface EntityHandler {
  // ... existing methods (list, filter, get, create, update, delete, etc.) ...

  /**
   * Subscribes to realtime updates for all records of this entity type.
   *
   * Receives notifications whenever any record is created, updated, or deleted.
   *
   * @param callback - Function called when an entity changes.
   * @param options - Optional configuration for filtering events.
   * @returns Subscription handle with an unsubscribe method.
   *
   * @example
   * ```typescript
   * // Subscribe to all Task changes
   * const subscription = base44.entities.Task.subscribe((event) => {
   *   console.log(`Task ${event.id} was ${event.type}d:`, event.data);
   * });
   *
   * // Later, unsubscribe
   * subscription.unsubscribe();
   * ```
   *
   * @example
   * ```typescript
   * // Subscribe only to create events
   * const subscription = base44.entities.Task.subscribe(
   *   (event) => console.log('New task:', event.data),
   *   { events: ['create'] }
   * );
   * ```
   */
  subscribe(
    callback: RealtimeCallback,
    options?: SubscribeOptions
  ): Subscription;

  /**
   * Subscribes to realtime updates for a specific entity record.
   *
   * Receives notifications when the specified record is updated or deleted.
   *
   * @param id - The unique identifier of the record to watch.
   * @param callback - Function called when the entity changes.
   * @param options - Optional configuration for filtering events.
   * @returns Subscription handle with an unsubscribe method.
   *
   * @example
   * ```typescript
   * // Subscribe to a specific task
   * const subscription = base44.entities.Task.subscribe('task-123', (event) => {
   *   if (event.type === 'update') {
   *     console.log('Task updated:', event.data);
   *   } else if (event.type === 'delete') {
   *     console.log('Task was deleted');
   *   }
   * });
   * ```
   */
  subscribe(
    id: string,
    callback: RealtimeCallback,
    options?: SubscribeOptions
  ): Subscription;

  /**
   * Subscribes to realtime updates for records matching a query.
   *
   * Receives notifications for records that match the specified criteria.
   * Includes create events when new records match the query, update events
   * when matching records change, and delete events when matching records
   * are removed.
   *
   * @param query - Query object with field-value pairs to filter records.
   * @param callback - Function called when a matching entity changes.
   * @param options - Optional configuration for filtering events.
   * @returns Subscription handle with an unsubscribe method.
   *
   * @example
   * ```typescript
   * // Subscribe to all completed tasks
   * const subscription = base44.entities.Task.subscribe(
   *   { isCompleted: true },
   *   (event) => {
   *     console.log(`Completed task ${event.type}:`, event.data);
   *   }
   * );
   * ```
   *
   * @example
   * ```typescript
   * // Subscribe to high-priority active tasks
   * const subscription = base44.entities.Task.subscribe(
   *   { priority: 'high', status: 'active' },
   *   (event) => console.log('High priority task changed:', event.data)
   * );
   * ```
   */
  subscribe(
    query: Record<string, any>,
    callback: RealtimeCallback,
    options?: SubscribeOptions
  ): Subscription;
}
````

---

## Usage Examples

### 1. Subscribe to ALL changes on an entity type

```typescript
const allTasksSub = base44.entities.Task.subscribe((event) => {
  console.log(`Task ${event.id} was ${event.type}d`);
  console.log("Data:", event.data);
});
```

### 2. Subscribe to a SPECIFIC entity instance by ID

```typescript
const singleTaskSub = base44.entities.Task.subscribe("task-123", (event) => {
  if (event.type === "update") {
    console.log("Task updated:", event.data);
    console.log("Previous:", event.previousData);
  } else if (event.type === "delete") {
    console.log("Task was deleted");
  }
});
```

### 3. Subscribe to entities matching a QUERY

```typescript
const completedTasksSub = base44.entities.Task.subscribe(
  { isCompleted: true },
  (event) => {
    console.log("Completed task changed:", event.type, event.data);
  }
);
```

### 4. Filter by EVENT TYPE (only listen to creates)

```typescript
const newTasksSub = base44.entities.Task.subscribe(
  (event) => console.log("New task created:", event.data),
  { events: ["create"] }
);
```

### 5. Combined: query + event filter

```typescript
const newHighPrioritySub = base44.entities.Task.subscribe(
  { priority: "high" },
  (event) => console.log("New high-priority task:", event.data),
  { events: ["create"] }
);
```

### 6. Works with service role too

```typescript
const adminSub = base44.asServiceRole.entities.User.subscribe((event) => {
  console.log("User changed:", event.type, event.data);
});
```

### 7. Cleanup

```typescript
allTasksSub.unsubscribe();
singleTaskSub.unsubscribe();
completedTasksSub.unsubscribe();
```

---

## Room Naming Convention (Internal)

Based on the existing socket infrastructure, the room names follow this pattern:

| Subscription Type  | Room Name Format                                  |
| ------------------ | ------------------------------------------------- |
| All entity changes | `entities:{appId}:{entityName}`                   |
| Single entity      | `entities:{appId}:{entityName}:{entityId}`        |
| Query-based        | `entities:{appId}:{entityName}:query:{queryHash}` |

---

## Design Decisions

| Aspect                    | Choice                                        | Rationale                                                   |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| **Method name**           | `subscribe`                                   | Matches Appwrite pattern, intuitive                         |
| **Callback position**     | Callback before options (or after ID/query)   | Matches SDK pattern where main data comes first             |
| **Returns**               | `Subscription` object with `unsubscribe()`    | Clean, explicit cleanup; matches Appwrite/Supabase patterns |
| **Event payload**         | Object with `type`, `data`, `id`, `timestamp` | Comprehensive info like Appwrite, typed for TypeScript      |
| **Overloaded signatures** | 3 variants (all, by ID, by query)             | Ergonomic API that covers all use cases                     |
| **Options parameter**     | Optional event filtering                      | Extensible for future options                               |

---

## Comparison with Similar Products

### Appwrite

```javascript
client.subscribe("databases.A.tables.A.rows.A", (response) => {
  console.log(response.payload);
});
```

- Uses channel strings for targeting
- Returns unsubscribe function directly
- Callback receives `{ events, channels, timestamp, payload }`

### Supabase

```typescript
const channel = supabase
  .channel("room:123:messages")
  .on("broadcast", { event: "message_sent" }, (payload) => {
    console.log("New message:", payload);
  })
  .subscribe();
```

- Channel-based with chained `.on().subscribe()` pattern
- Separates channel creation from event listening

### Meteor

```javascript
Meteor.subscribe('roomAndMessages', roomId);

// With observeChanges
Messages.find({ roomId }).observeChanges({
  added: (id, fields) => { ... },
  changed: (id, fields) => { ... },
  removed: (id) => { ... }
});
```

- Separate `added`, `changed`, `removed` callbacks
- Cursor-based observation

### Our Proposed API

```typescript
base44.entities.Task.subscribe({ isCompleted: true }, (event) => {
  console.log(event.type, event.data);
});
```

- Matches existing SDK style (`base44.entities.EntityName.method()`)
- Single callback with event type in payload
- Overloaded for flexibility (all, by ID, by query)
- Returns subscription handle with `unsubscribe()` method
