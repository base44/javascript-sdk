/**
 * WatchListManager - A utility for managing a sorted list from watch() subscription events.
 *
 * This class maintains a sorted list of entities based on watch events, optimizing
 * for common operations like insertions in sorted order and removals.
 */

import type { WatchEvent } from "../modules/entities.types";

/**
 * Comparator function for sorting entities.
 */
export type SortComparator<T> = (a: T, b: T) => number;

/**
 * Creates a comparator function from a sort string.
 *
 * @param sortField - Sort field with optional '-' prefix for descending order
 * @returns Comparator function
 *
 * @example
 * ```typescript
 * const comparator = createComparatorFromSort('-created_date');
 * // Sorts by created_date in descending order
 * ```
 */
export function createComparatorFromSort<T extends Record<string, any>>(
  sortField: string
): SortComparator<T> {
  const descending = sortField.startsWith("-");
  const field = descending ? sortField.slice(1) : sortField;

  return (a: T, b: T) => {
    const aValue = a[field];
    const bValue = b[field];

    // Handle undefined/null values (push to end)
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    // Compare values
    let result: number;
    if (typeof aValue === "string" && typeof bValue === "string") {
      result = aValue.localeCompare(bValue);
    } else if (aValue instanceof Date && bValue instanceof Date) {
      result = aValue.getTime() - bValue.getTime();
    } else {
      result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    }

    return descending ? -result : result;
  };
}

/**
 * Configuration options for WatchListManager.
 */
export interface WatchListManagerOptions<T> {
  /** Maximum number of items to keep in the list (for limit support) */
  limit?: number;
  /** Sort comparator function or sort field string */
  sort?: SortComparator<T> | string;
  /** Function to extract the ID from an entity */
  getId?: (item: T) => string;
}

/**
 * Manages a sorted list of entities from watch subscription events.
 *
 * Optimizes for:
 * - Insertions in sorted order (binary search)
 * - Removals by ID (Map lookup)
 * - Limit enforcement
 *
 * @example
 * ```typescript
 * const manager = new WatchListManager<Task>({
 *   sort: '-created_date',
 *   limit: 10,
 * });
 *
 * const unsubscribe = base44.entities.Task.watch(
 *   { filter: { status: 'active' }, sort: '-created_date', limit: 10 },
 *   (event) => {
 *     manager.handleEvent(event);
 *     // Update UI with manager.getItems()
 *     renderTaskList(manager.getItems());
 *   }
 * );
 * ```
 */
export class WatchListManager<T extends Record<string, any>> {
  private items: T[] = [];
  private itemsById: Map<string, T> = new Map();
  private limit?: number;
  private comparator?: SortComparator<T>;
  private getId: (item: T) => string;

  constructor(options: WatchListManagerOptions<T> = {}) {
    this.limit = options.limit;
    this.getId = options.getId || ((item) => item.id);

    if (options.sort) {
      this.comparator =
        typeof options.sort === "string"
          ? createComparatorFromSort(options.sort)
          : options.sort;
    }
  }

  /**
   * Handle a watch event and update the list accordingly.
   *
   * @param event - The watch event from the subscription
   * @returns Object with information about what changed
   */
  handleEvent(event: WatchEvent): {
    added: boolean;
    removed: boolean;
    modified: boolean;
    item?: T;
  } {
    const item = event.data as T;
    const id = event.id || this.getId(item);

    switch (event.changeType) {
      case "added":
        return { ...this.addItem(item, id), modified: false };

      case "modified":
        return { added: false, removed: false, modified: true, item: this.updateItem(item, id) };

      case "removed":
        return { added: false, removed: this.removeItem(id), modified: false };

      default:
        return { added: false, removed: false, modified: false };
    }
  }

  /**
   * Add an item to the list in sorted order.
   */
  private addItem(item: T, id: string): { added: boolean; removed: boolean; item?: T } {
    // Check if already exists
    if (this.itemsById.has(id)) {
      // Update existing item
      return { added: false, removed: false, item: this.updateItem(item, id) };
    }

    // Find insertion position using binary search if sorted
    let insertIndex = this.items.length;
    if (this.comparator) {
      insertIndex = this.findInsertionIndex(item);
    }

    // Check if this item would be beyond the limit
    if (this.limit && insertIndex >= this.limit) {
      return { added: false, removed: false };
    }

    // Insert the item
    this.items.splice(insertIndex, 0, item);
    this.itemsById.set(id, item);

    // Enforce limit by removing last item if needed
    let removed = false;
    if (this.limit && this.items.length > this.limit) {
      const removedItem = this.items.pop();
      if (removedItem) {
        const removedId = this.getId(removedItem);
        this.itemsById.delete(removedId);
        removed = true;
      }
    }

    return { added: true, removed, item };
  }

  /**
   * Update an existing item, re-sorting if necessary.
   */
  private updateItem(item: T, id: string): T | undefined {
    const existingItem = this.itemsById.get(id);
    if (!existingItem) {
      // Item doesn't exist, add it
      this.addItem(item, id);
      return item;
    }

    // Update the item in the map
    this.itemsById.set(id, item);

    // Find and update in the array
    const currentIndex = this.items.findIndex((i) => this.getId(i) === id);
    if (currentIndex === -1) return undefined;

    // If sorted, check if position changed
    if (this.comparator) {
      // Remove from current position
      this.items.splice(currentIndex, 1);
      // Find new position
      const newIndex = this.findInsertionIndex(item);
      // Insert at new position
      this.items.splice(newIndex, 0, item);
    } else {
      // No sorting, just update in place
      this.items[currentIndex] = item;
    }

    return item;
  }

  /**
   * Remove an item from the list.
   */
  private removeItem(id: string): boolean {
    if (!this.itemsById.has(id)) {
      return false;
    }

    this.itemsById.delete(id);
    const index = this.items.findIndex((item) => this.getId(item) === id);
    if (index !== -1) {
      this.items.splice(index, 1);
    }

    return true;
  }

  /**
   * Find the insertion index for an item using binary search.
   */
  private findInsertionIndex(item: T): number {
    if (!this.comparator || this.items.length === 0) {
      return this.items.length;
    }

    let left = 0;
    let right = this.items.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.comparator(item, this.items[mid]) < 0) {
        right = mid;
      } else {
        left = mid + 1;
      }
    }

    return left;
  }

  /**
   * Get the current list of items.
   */
  getItems(): readonly T[] {
    return this.items;
  }

  /**
   * Get an item by ID.
   */
  getById(id: string): T | undefined {
    return this.itemsById.get(id);
  }

  /**
   * Get the current count of items.
   */
  getCount(): number {
    return this.items.length;
  }

  /**
   * Clear all items from the list.
   */
  clear(): void {
    this.items = [];
    this.itemsById.clear();
  }

  /**
   * Initialize the list with an array of items.
   * This sorts and limits the items according to the configuration.
   */
  initialize(items: T[]): void {
    this.clear();

    // Sort if comparator exists
    let sortedItems = [...items];
    if (this.comparator) {
      sortedItems.sort(this.comparator);
    }

    // Apply limit
    if (this.limit) {
      sortedItems = sortedItems.slice(0, this.limit);
    }

    // Add to list and map
    this.items = sortedItems;
    for (const item of sortedItems) {
      this.itemsById.set(this.getId(item), item);
    }
  }
}
