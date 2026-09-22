import type {
  EntityAggregateSpec,
  EntityDistinctOptions,
  EntityListOptions,
  EntityUpsertOptions,
} from "../../src/index.js";

interface Sale {
  id: string;
  agent_id: string;
  store: string;
  amount: number;
  sale_date: string;
  created_date: string;
}

const perAgent = {
  query: { sale_date: { $gte: "2026-09-01" } },
  groupBy: "agent_id",
  sum: ["amount"],
  avg: "amount",
  sort: "-sum_amount",
  limit: 50,
} satisfies EntityAggregateSpec<Sale>;

const perDay = {
  dateBucket: { field: "created_date", unit: "day" },
  countDistinct: "agent_id",
} satisfies EntityAggregateSpec<Sale>;

const duplicates = {
  groupBy: ["agent_id", "store"],
  having: { count: { $gt: 1 } },
} satisfies EntityAggregateSpec<Sale>;

// @ts-expect-error unknown field names are rejected
const badGroup = { groupBy: "region" } satisfies EntityAggregateSpec<Sale>;

// @ts-expect-error unknown bucket unit
const badUnit = { dateBucket: { field: "created_date", unit: "hour" } } satisfies EntityAggregateSpec<Sale>;

const firstPage = {
  sort: "-created_date",
  limit: 1000,
  fields: ["id", "amount"],
} satisfies EntityListOptions<Sale, "id" | "amount">;

const nextPage = { cursor: "opaque", sort: "-created_date" } satisfies EntityListOptions<Sale>;

// @ts-expect-error sort must name a field of the entity
const badSort = { sort: "-total" } satisfies EntityListOptions<Sale>;

const distinctStores = { distinct: "store", limit: 500 } satisfies EntityDistinctOptions<Sale, "store">;

// @ts-expect-error distinct must name a field of the entity
const badDistinct = { distinct: "region" } satisfies EntityDistinctOptions<Sale>;

const singleKey = { key: "id" } satisfies EntityUpsertOptions<Sale>;
const compoundKey = { key: ["agent_id", "store"] } satisfies EntityUpsertOptions<Sale>;

// @ts-expect-error key must name fields of the entity
const badKey = { key: "sku" } satisfies EntityUpsertOptions<Sale>;

export { perAgent, perDay, duplicates, badGroup, badUnit, firstPage, nextPage, badSort, distinctStores, badDistinct, singleKey, compoundKey, badKey };

import { createClient } from "../../src/index.js";
declare module "../../src/modules/entities.types.js" {
  interface EntityTypeRegistry {
    Sale: Sale;
  }
}
async function inferred() {
  const client = createClient({ appId: "x" });
  const stores = await client.entities.Sale.filter({ store: "s1" }, { distinct: "store" });
  const s: string = stores.items[0];
  const amounts = await client.entities.Sale.list({ distinct: "amount" });
  const n: number = amounts.items[0];
  const page = await client.entities.Sale.list({ cursor: "tok", fields: ["id"] });
  const id: string = page.items[0].id;
  // @ts-expect-error amount was not selected
  page.items[0].amount;
  return [s, n, id];
}
export { inferred };
