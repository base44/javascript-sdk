import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";
import type {
  EntityAggregateResult,
  EntityPage,
  EntityUpsertResult,
} from "../../src/modules/entities.types.ts";

interface Order {
  id: string;
  status: string;
  agent_id: string;
  amount: number;
  external_id: string;
  created_date: string;
}

declare module "../../src/modules/entities.types.ts" {
  interface EntityTypeRegistry {
    Order: Order;
  }
}

describe("Entities scan-free primitives", () => {
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;
  const appId = "test-app-id";
  const serverUrl = "https://api.base44.com";
  const base = `/api/apps/${appId}/entities/Order`;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
    scope = nock(serverUrl);
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test("filter() with an options object reads a cursor page from v2/list", async () => {
    const reply: EntityPage<Pick<Order, "id" | "amount">> = {
      items: [{ id: "1", amount: 10 }],
      next_cursor: "tok-2",
      has_more: true,
    };
    scope
      .get(`${base}/v2/list`)
      .query((q) => {
        return (
          JSON.parse(q.q as string).status === "open" &&
          q.sort === "-created_date" &&
          q.limit === "1000" &&
          q.cursor === "tok-1" &&
          q.fields === "id,amount"
        );
      })
      .reply(200, reply);

    const page = await base44.entities.Order.filter(
      { status: "open" },
      { sort: "-created_date", limit: 1000, cursor: "tok-1", fields: ["id", "amount"] }
    );

    expect(page.items[0].amount).toBe(10);
    expect(page.next_cursor).toBe("tok-2");
    expect(page.has_more).toBe(true);
    expect(scope.isDone()).toBe(true);
  });

  test("list() with an options object reads the first page when cursor is null, 100 rows by default", async () => {
    scope
      .get(`${base}/v2/list`)
      .query((q) => q.sort === "amount" && q.limit === "100" && q.cursor === undefined && q.q === undefined)
      .reply(200, { items: [], next_cursor: null, has_more: false });

    const page = await base44.entities.Order.list({ sort: "amount", cursor: null });
    expect(page).toEqual({ items: [], next_cursor: null, has_more: false });
    expect(scope.isDone()).toBe(true);
  });

  test("a later page needs only the cursor: no q, sort or fields are sent", async () => {
    scope
      .get(`${base}/v2/list`)
      .query((q) => q.cursor === "tok-1" && q.limit === "100" && q.q === undefined && q.sort === undefined && q.fields === undefined)
      .reply(200, { items: [], next_cursor: null, has_more: false });

    const page = await base44.entities.Order.list({ cursor: "tok-1" });
    expect(page.has_more).toBe(false);
    expect(scope.isDone()).toBe(true);
  });

  test("filter() with a distinct option reads a page of values from v2/list", async () => {
    scope
      .get(`${base}/v2/list`)
      .query((q) => JSON.parse(q.q as string).status === "open" && q.distinct === "agent_id" && q.limit === "100" && q.sort === undefined)
      .reply(200, { items: ["a1", "a2"], next_cursor: null, has_more: false });

    const page = await base44.entities.Order.filter({ status: "open" }, { distinct: "agent_id" });
    expect(page.items).toEqual(["a1", "a2"]);
    expect(scope.isDone()).toBe(true);
  });

  test("list() and filter() with positional arguments still return arrays from the list route", async () => {
    scope
      .get(base)
      .query((q) => q.sort === "-created_date" && q.limit === "10" && q.skip === "20")
      .reply(200, [{ id: "1" }]);
    scope
      .get(base)
      .query((q) => JSON.parse(q.q as string).status === "open" && q.limit === "5")
      .reply(200, [{ id: "2" }]);

    expect(await base44.entities.Order.list("-created_date", 10, 20)).toEqual([{ id: "1" }]);
    expect(await base44.entities.Order.filter({ status: "open" }, "-created_date", 5)).toEqual([{ id: "2" }]);
    expect(scope.isDone()).toBe(true);
  });

  test("count() returns the number and passes the filter as q", async () => {
    scope
      .get(`${base}/count`)
      .query((q) => JSON.parse(q.q as string).status === "open")
      .reply(200, { count: 42 });

    expect(await base44.entities.Order.count({ status: "open" })).toBe(42);
    expect(scope.isDone()).toBe(true);
  });

  test("count() without a query sends no q", async () => {
    scope
      .get(`${base}/count`)
      .query((q) => q.q === undefined)
      .reply(200, { count: 7 });

    expect(await base44.entities.Order.count()).toBe(7);
    expect(scope.isDone()).toBe(true);
  });

  test("aggregate() posts the spec as-is to /aggregate", async () => {
    const spec = {
      query: { status: "paid" },
      groupBy: "agent_id",
      sum: "amount",
      having: { count: { $gt: 1 } },
      sort: "-sum_amount",
      limit: 10,
    } as const;
    const reply: EntityAggregateResult = {
      rows: [{ agent_id: "a1", count: 3, sum_amount: 300 }],
      truncated: false,
    };
    scope.post(`${base}/aggregate`, spec as nock.RequestBodyMatcher).reply(200, reply);

    const result = await base44.entities.Order.aggregate(spec);
    expect(result.rows[0].sum_amount).toBe(300);
    expect(scope.isDone()).toBe(true);
  });

  test("upsert() posts records and the key", async () => {
    const records = [
      { external_id: "x1", amount: 5 },
      { external_id: "x2", amount: 6 },
    ];
    const reply: EntityUpsertResult<Order> = {
      created: 1,
      updated: 1,
      records: [
        { id: "1", status: "open", agent_id: "a1", amount: 5, external_id: "x1", created_date: "2026-01-01" },
        { id: "2", status: "open", agent_id: "a1", amount: 6, external_id: "x2", created_date: "2026-01-02" },
      ],
    };
    scope
      .post(`${base}/upsert`, { records, key: ["external_id", "agent_id"] } as nock.RequestBodyMatcher)
      .reply(200, reply);

    const result = await base44.entities.Order.upsert(records, { key: ["external_id", "agent_id"] });
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.records).toHaveLength(2);
    expect(scope.isDone()).toBe(true);
  });

  test("a coded API error surfaces its code and message on the thrown error", async () => {
    scope
      .get(`${base}/v2/list`)
      .query({ cursor: "stale", sort: "amount", limit: "100" })
      .reply(400, { error: { code: "invalid_cursor", message: "Cursor was issued for a different sort", details: {} } });

    const err = await base44.entities.Order.list({ cursor: "stale", sort: "amount" }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_cursor");
    expect(err.message).toBe("Cursor was issued for a different sort");
    expect(scope.isDone()).toBe(true);
  });
});
