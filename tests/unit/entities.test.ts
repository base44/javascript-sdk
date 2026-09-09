import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  description?: string | null;
  view_count?: number;
}

declare module "../../src/modules/entities.types.ts" {
  interface EntityTypeRegistry {
    Todo: Todo;
  }
}

describe("Entities Module", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";

  beforeEach(() => {
    platform.reset();
    base44 = createClient({
      serverUrl: "https://api.base44.com",
      appId,
    });
  });

  afterEach(() => base44.cleanup());

  test("list() fetches arranged entities with the correct parameters", async () => {
    platform.given.app(appId).entities.records("Todo", [
      { id: "1", title: "Task 1", completed: false },
      { id: "2", title: "Task 2", completed: true },
    ]);

    const result = await base44.entities.Todo.list("title", 10, 0, [
      "id",
      "title",
    ]);

    expect(result).toEqual([
      { id: "1", title: "Task 1" },
      { id: "2", title: "Task 2" },
    ]);
    expect(platform.requests.last("entities.list").query).toEqual({
      fields: "id,title",
      limit: "10",
      sort: "title",
    });
  });

  test("list() retains id when a field projection omits it", async () => {
    platform.given
      .app(appId)
      .entities.records("Todo", [
        { id: "1", title: "Projected", completed: false },
      ]);

    await expect(
      base44.entities.Todo.list(undefined, undefined, undefined, ["title"]),
    ).resolves.toEqual([{ id: "1", title: "Projected" }]);
  });

  test("filter() sends the query and returns matching domain state", async () => {
    platform.given.app(appId).entities.records("Todo", [
      { id: "1", title: "Task 1", completed: false },
      { id: "2", title: "Task 2", completed: true },
    ]);

    const result = await base44.entities.Todo.filter({ completed: true });

    expect(result).toEqual([{ id: "2", title: "Task 2", completed: true }]);
    expect(JSON.parse(platform.requests.last("entities.list").query.q)).toEqual(
      {
        completed: true,
      },
    );
  });

  test("filter() supports typed advanced query syntax", async () => {
    platform.given.app(appId).entities.records("Todo", [
      { id: "1", title: "Task 1", completed: false, description: "notes" },
      { id: "2", title: "Task 2", completed: true, description: null },
    ]);
    const query = {
      title: { $in: ["Task 1", "Task 2"] },
      description: null,
      $or: [{ title: "Task 2" }, { completed: true }],
    };

    const result = await base44.entities.Todo.filter(query);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
    expect(JSON.parse(platform.requests.last("entities.list").query.q)).toEqual(
      query,
    );
  });

  test("get() fetches one arranged entity", async () => {
    platform.given
      .app(appId)
      .entities.records("Todo", [
        { id: "123", title: "Get milk", completed: false },
      ]);

    await expect(base44.entities.Todo.get("123")).resolves.toEqual({
      id: "123",
      title: "Get milk",
      completed: false,
    });
  });

  test("create() persists so subsequent get() and list() observe the record", async () => {
    platform.given.app(appId).entities.records("Todo", []);

    const created = await base44.entities.Todo.create({
      title: "New task",
      completed: false,
    });

    expect(created).toEqual({ id: "1", title: "New task", completed: false });
    await expect(base44.entities.Todo.get(created.id)).resolves.toEqual(
      created,
    );
    await expect(base44.entities.Todo.list()).resolves.toContainEqual(created);
    expect(platform.requests.last("entities.create").body).toEqual({
      title: "New task",
      completed: false,
    });
  });

  test("isolates entity state and generated identifiers by application", async () => {
    const otherAppId = "other-entity-app";
    const otherClient = createClient({
      serverUrl: "https://api.base44.com",
      appId: otherAppId,
    });
    platform.given
      .app(appId)
      .entities.records("Todo", [
        { id: "7", title: "App A", completed: false },
      ]);
    platform.given
      .app(otherAppId)
      .entities.records("Todo", [{ id: "7", title: "App B", completed: true }]);

    const createdA = await base44.entities.Todo.create({
      title: "Only A",
      completed: false,
    });
    expect(createdA.id).toBe("8");
    await expect(base44.entities.Todo.list()).resolves.toHaveLength(2);
    await expect(otherClient.entities.Todo.list()).resolves.toEqual([
      { id: "7", title: "App B", completed: true },
    ]);
    otherClient.cleanup();
  });

  test("update() changes the stored entity", async () => {
    platform.given
      .app(appId)
      .entities.records("Todo", [
        { id: "123", title: "Old task", completed: false },
      ]);

    const updated = await base44.entities.Todo.update("123", {
      title: "Updated task",
      completed: true,
    });

    expect(updated).toEqual({
      id: "123",
      title: "Updated task",
      completed: true,
    });
    await expect(base44.entities.Todo.get("123")).resolves.toEqual(updated);
    expect(platform.requests.last("entities.update").body).toEqual({
      title: "Updated task",
      completed: true,
    });
  });

  test("delete() removes the stored entity and returns DeleteResult", async () => {
    platform.given
      .app(appId)
      .entities.records("Todo", [
        { id: "123", title: "Delete me", completed: false },
      ]);

    await expect(base44.entities.Todo.delete("123")).resolves.toEqual({
      success: true,
    });
    await expect(base44.entities.Todo.list()).resolves.toEqual([]);
  });

  test("updateMany() applies update operators to matching records", async () => {
    platform.given.app(appId).entities.records("Todo", [
      { id: "1", title: "One", completed: false },
      { id: "2", title: "Two", completed: false },
      { id: "3", title: "Three", completed: false },
      { id: "4", title: "Done", completed: true },
    ]);

    const result = await base44.entities.Todo.updateMany(
      { completed: false },
      { $set: { completed: true } },
    );

    expect(result).toEqual({ success: true, updated: 3, has_more: false });
    expect(await base44.entities.Todo.filter({ completed: true })).toHaveLength(
      4,
    );
    expect(platform.requests.last("entities.updateMany").body).toEqual({
      query: { completed: false },
      data: { $set: { completed: true } },
    });
  });

  test("updateMany() reports has_more at the platform batch limit", async () => {
    platform.given.app(appId).entities.records(
      "Todo",
      Array.from({ length: 501 }, (_, index) => ({
        id: String(index + 1),
        title: `Task ${index + 1}`,
        completed: false,
        view_count: 0,
      })),
    );

    const result = await base44.entities.Todo.updateMany(
      {},
      { $inc: { view_count: 1 } },
    );

    expect(result).toEqual({ success: true, updated: 500, has_more: true });
    expect((await base44.entities.Todo.get("1")).view_count).toBe(1);
    expect((await base44.entities.Todo.get("501")).view_count).toBe(0);
  });

  test("bulkUpdate() updates records without dropping existing fields", async () => {
    platform.given.app(appId).entities.records("Todo", [
      { id: "1", title: "Task 1", completed: false },
      { id: "2", title: "Task 2", completed: false },
    ]);
    const updates = [
      { id: "1", title: "Updated Task 1", completed: true },
      { id: "2", title: "Updated Task 2" },
    ];

    const result = await base44.entities.Todo.bulkUpdate(updates);

    expect(result).toEqual([
      { id: "1", title: "Updated Task 1", completed: true },
      { id: "2", title: "Updated Task 2", completed: false },
    ]);
    expect(platform.requests.last("entities.bulkUpdate").body).toEqual(updates);
  });

  test("reset() isolates platform state and request history", async () => {
    platform.given
      .app(appId)
      .entities.records("Todo", [
        { id: "1", title: "Transient", completed: false },
      ]);
    await base44.entities.Todo.list();

    platform.reset();

    await expect(base44.entities.Todo.list()).resolves.toEqual([]);
    expect(platform.requests.count("entities.list")).toBe(1);
  });
});
