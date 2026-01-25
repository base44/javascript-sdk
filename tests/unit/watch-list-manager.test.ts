import { describe, it, expect, beforeEach } from "vitest";
import {
  WatchListManager,
  createComparatorFromSort,
} from "../../src/utils/watch-list-manager";
import type { WatchEvent } from "../../src/modules/entities.types";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: number;
  created_date: string;
}

function createWatchEvent(
  changeType: "added" | "modified" | "removed",
  data: Partial<Task>,
  eventType: "create" | "update" | "delete" = "update"
): WatchEvent {
  return {
    changeType,
    eventType,
    id: data.id || "unknown",
    data: data as Task,
    timestamp: new Date().toISOString(),
  };
}

describe("createComparatorFromSort", () => {
  it("should sort ascending by default", () => {
    const comparator = createComparatorFromSort<Task>("priority");
    const tasks: Task[] = [
      { id: "1", title: "A", status: "active", priority: 3, created_date: "" },
      { id: "2", title: "B", status: "active", priority: 1, created_date: "" },
      { id: "3", title: "C", status: "active", priority: 2, created_date: "" },
    ];

    const sorted = [...tasks].sort(comparator);
    expect(sorted.map((t) => t.id)).toEqual(["2", "3", "1"]);
  });

  it("should sort descending with - prefix", () => {
    const comparator = createComparatorFromSort<Task>("-priority");
    const tasks: Task[] = [
      { id: "1", title: "A", status: "active", priority: 3, created_date: "" },
      { id: "2", title: "B", status: "active", priority: 1, created_date: "" },
      { id: "3", title: "C", status: "active", priority: 2, created_date: "" },
    ];

    const sorted = [...tasks].sort(comparator);
    expect(sorted.map((t) => t.id)).toEqual(["1", "3", "2"]);
  });

  it("should handle string comparisons", () => {
    const comparator = createComparatorFromSort<Task>("title");
    const tasks: Task[] = [
      { id: "1", title: "Charlie", status: "active", priority: 1, created_date: "" },
      { id: "2", title: "Alpha", status: "active", priority: 1, created_date: "" },
      { id: "3", title: "Bravo", status: "active", priority: 1, created_date: "" },
    ];

    const sorted = [...tasks].sort(comparator);
    expect(sorted.map((t) => t.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("should handle null/undefined values", () => {
    const comparator = createComparatorFromSort<any>("value");
    const items = [
      { id: "1", value: 2 },
      { id: "2", value: null },
      { id: "3", value: 1 },
      { id: "4", value: undefined },
    ];

    const sorted = [...items].sort(comparator);
    // null/undefined should be pushed to end
    expect(sorted.map((i) => i.id)).toEqual(["3", "1", "2", "4"]);
  });
});

describe("WatchListManager", () => {
  let manager: WatchListManager<Task>;

  describe("without sorting", () => {
    beforeEach(() => {
      manager = new WatchListManager<Task>();
    });

    it("should add items on 'added' events", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );

      expect(manager.getItems()).toHaveLength(1);
      expect(manager.getById("1")?.title).toBe("Task 1");
    });

    it("should remove items on 'removed' events", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("removed", { id: "1" }, "delete")
      );

      expect(manager.getItems()).toHaveLength(0);
      expect(manager.getById("1")).toBeUndefined();
    });

    it("should update items on 'modified' events", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("modified", { id: "1", title: "Updated Task", status: "active", priority: 1, created_date: "" })
      );

      expect(manager.getItems()).toHaveLength(1);
      expect(manager.getById("1")?.title).toBe("Updated Task");
    });
  });

  describe("with sorting", () => {
    beforeEach(() => {
      manager = new WatchListManager<Task>({ sort: "-priority" });
    });

    it("should maintain sorted order when adding items", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Low", status: "active", priority: 1, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("added", { id: "2", title: "High", status: "active", priority: 3, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("added", { id: "3", title: "Medium", status: "active", priority: 2, created_date: "" }, "create")
      );

      const items = manager.getItems();
      expect(items.map((t) => t.id)).toEqual(["2", "3", "1"]);
    });

    it("should re-sort when modifying sort field", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("added", { id: "2", title: "Task 2", status: "active", priority: 2, created_date: "" }, "create")
      );

      // Update task 1 to have highest priority
      manager.handleEvent(
        createWatchEvent("modified", { id: "1", title: "Task 1", status: "active", priority: 5, created_date: "" })
      );

      const items = manager.getItems();
      expect(items.map((t) => t.id)).toEqual(["1", "2"]);
    });
  });

  describe("with limit", () => {
    beforeEach(() => {
      manager = new WatchListManager<Task>({ sort: "-priority", limit: 2 });
    });

    it("should enforce limit when adding items", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Low", status: "active", priority: 1, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("added", { id: "2", title: "Medium", status: "active", priority: 2, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("added", { id: "3", title: "High", status: "active", priority: 3, created_date: "" }, "create")
      );

      const items = manager.getItems();
      expect(items).toHaveLength(2);
      // Should keep highest priority items
      expect(items.map((t) => t.id)).toEqual(["3", "2"]);
    });

    it("should not add items that would be beyond limit", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "High", status: "active", priority: 3, created_date: "" }, "create")
      );
      manager.handleEvent(
        createWatchEvent("added", { id: "2", title: "Medium", status: "active", priority: 2, created_date: "" }, "create")
      );

      // This low priority task should not be added (beyond limit)
      const result = manager.handleEvent(
        createWatchEvent("added", { id: "3", title: "Low", status: "active", priority: 1, created_date: "" }, "create")
      );

      expect(result.added).toBe(false);
      expect(manager.getItems()).toHaveLength(2);
      expect(manager.getById("3")).toBeUndefined();
    });
  });

  describe("initialize", () => {
    it("should initialize with sorted and limited items", () => {
      manager = new WatchListManager<Task>({ sort: "-priority", limit: 2 });

      const tasks: Task[] = [
        { id: "1", title: "Low", status: "active", priority: 1, created_date: "" },
        { id: "2", title: "High", status: "active", priority: 3, created_date: "" },
        { id: "3", title: "Medium", status: "active", priority: 2, created_date: "" },
      ];

      manager.initialize(tasks);

      const items = manager.getItems();
      expect(items).toHaveLength(2);
      expect(items.map((t) => t.id)).toEqual(["2", "3"]);
    });
  });

  describe("clear", () => {
    it("should clear all items", () => {
      manager = new WatchListManager<Task>();
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );

      manager.clear();

      expect(manager.getItems()).toHaveLength(0);
      expect(manager.getCount()).toBe(0);
    });
  });

  describe("handleEvent return values", () => {
    beforeEach(() => {
      manager = new WatchListManager<Task>();
    });

    it("should return added: true when item is added", () => {
      const result = manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );

      expect(result.added).toBe(true);
      expect(result.removed).toBe(false);
      expect(result.modified).toBe(false);
    });

    it("should return removed: true when item is removed", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );

      const result = manager.handleEvent(
        createWatchEvent("removed", { id: "1" }, "delete")
      );

      expect(result.added).toBe(false);
      expect(result.removed).toBe(true);
      expect(result.modified).toBe(false);
    });

    it("should return modified: true when item is modified", () => {
      manager.handleEvent(
        createWatchEvent("added", { id: "1", title: "Task 1", status: "active", priority: 1, created_date: "" }, "create")
      );

      const result = manager.handleEvent(
        createWatchEvent("modified", { id: "1", title: "Updated", status: "active", priority: 1, created_date: "" })
      );

      expect(result.added).toBe(false);
      expect(result.removed).toBe(false);
      expect(result.modified).toBe(true);
    });
  });
});
