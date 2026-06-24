import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";

describe("entities.<Name>.asTool", () => {
  let base44: ReturnType<typeof createClient>;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId, token: "t" });
    nock.disableNetConnect();
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); vi.clearAllMocks(); });

  test("default is read-only: only read_<Entity> is produced", () => {
    const tools = base44.entities.Order.asTool();
    expect(Object.keys(tools)).toEqual(["read_Order"]);
  });

  test("operations select which per-op tools are produced (names match hosted)", () => {
    const tools = base44.entities.Order.asTool({ operations: ["read", "create", "update", "delete"] });
    expect(Object.keys(tools).sort()).toEqual(["create_Order", "delete_Order", "read_Order", "update_Order"]);
  });

  test("read tool: description carries Mongo instructions; FilterParams shape", () => {
    const { read_Order } = base44.entities.Order.asTool({ operations: ["read"] });
    expect(read_Order.description).toMatch(/^Read Order entities\./);
    expect(read_Order.description).toMatch(/MongoDB query syntax|Mongo/i);
    const props = (read_Order.parameters as any).properties;
    expect(Object.keys(props).sort()).toEqual(["fields", "limit", "query", "skip", "sort"]);
  });

  test("create/update/delete descriptions + required id match hosted format", () => {
    const t = base44.entities.Order.asTool({ operations: ["create", "update", "delete"] });
    expect(t.create_Order.description).toBe("Create a new Order entity");
    expect(t.update_Order.description).toBe("Update an existing Order entity");
    expect(t.delete_Order.description).toBe("Delete an existing Order entity");
    expect((t.update_Order.parameters as any).required).toContain("id");
    expect((t.delete_Order.parameters as any).required).toEqual(["id"]);
  });

  test("read_Order.execute -> entity filter endpoint", async () => {
    const scope = nock(serverUrl)
      .get(`/api/apps/${appId}/entities/Order`)
      .query(true)
      .reply(200, [{ id: "1", status: "open" }]);
    const { read_Order } = base44.entities.Order.asTool({ operations: ["read"] });
    const out = await read_Order.execute({ query: { status: "open" }, limit: 5 });
    expect(out).toEqual([{ id: "1", status: "open" }]);
    scope.done();
  });

  test("create_Order.execute -> POST; update -> PUT/:id (id stripped from body); delete -> DELETE/:id", async () => {
    const created = nock(serverUrl).post(`/api/apps/${appId}/entities/Order`, { status: "open" }).reply(200, { id: "9", status: "open" });
    const t = base44.entities.Order.asTool({ operations: ["create", "update", "delete"] });
    expect(await t.create_Order.execute({ status: "open" })).toEqual({ id: "9", status: "open" });
    created.done();

    const updated = nock(serverUrl).put(`/api/apps/${appId}/entities/Order/9`, { status: "shipped" }).reply(200, { id: "9", status: "shipped" });
    expect(await t.update_Order.execute({ id: "9", status: "shipped" })).toEqual({ id: "9", status: "shipped" });
    updated.done();

    const deleted = nock(serverUrl).delete(`/api/apps/${appId}/entities/Order/9`).reply(200, { deleted: true });
    await t.delete_Order.execute({ id: "9" });
    deleted.done();
  });
});
