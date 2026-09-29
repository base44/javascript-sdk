import { http, HttpResponse } from "msw";
import { recordRequest, state, type PlatformRecord } from "./state";

function matches(record: PlatformRecord, query: Record<string, any>): boolean {
  return Object.entries(query).every(([field, expected]) => {
    if (field === "$or")
      return expected.some((alternative: Record<string, any>) =>
        matches(record, alternative),
      );
    if (expected && typeof expected === "object" && "$in" in expected)
      return expected.$in.includes(record[field]);
    return record[field] === expected;
  });
}

function collection(appId: string, entityName: string) {
  let appEntities = state.entities.get(appId);
  if (!appEntities) {
    appEntities = new Map();
    state.entities.set(appId, appEntities);
  }
  let records = appEntities.get(entityName);
  if (!records) {
    records = [];
    appEntities.set(entityName, records);
  }
  return records;
}

function nextId(appId: string) {
  const id = state.nextEntityIds.get(appId) ?? 1;
  state.nextEntityIds.set(appId, id + 1);
  return String(id);
}

function compareValues(left: unknown, right: unknown) {
  const leftNullish = left == null;
  const rightNullish = right == null;
  if (leftNullish || rightNullish) {
    // Apper groups Mongo missing and explicit-null values together. Their
    // relative backend order is unspecified; returning zero preserves fixture
    // insertion order and keeps this comparator anti-symmetric.
    if (leftNullish && rightNullish) return 0;
    return leftNullish ? -1 : 1;
  }
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  if (left === right) return 0;
  if (typeof left === "boolean" && typeof right === "boolean")
    return Number(left) - Number(right);
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function select(records: PlatformRecord[], request: Request) {
  const search = new URL(request.url).searchParams;
  const query = search.get("q");
  let selected = query
    ? records.filter((item) => matches(item, JSON.parse(query)))
    : [...records];
  const sort = search.get("sort");
  if (sort) {
    const descending = sort.startsWith("-");
    const field = descending ? sort.slice(1) : sort;
    selected.sort((left, right) => {
      const comparison = compareValues(left[field], right[field]);
      return descending ? -comparison : comparison;
    });
  }
  const skip = Number(search.get("skip") ?? 0);
  const limit = Number(search.get("limit") ?? selected.length);
  selected = selected.slice(skip, skip + limit);
  const fields = search.get("fields")?.split(",");
  if (fields) {
    const projectedFields = ["id", ...fields.filter((field) => field !== "id")];
    selected = selected.map((item) =>
      Object.fromEntries(projectedFields.map((field) => [field, item[field]])),
    ) as PlatformRecord[];
  }
  return selected;
}

export const entityHandlers = [
  http.get(
    "*/api/apps/:appId/entities/:entityName",
    async ({ params, request }) => {
      await recordRequest("entities.list", request);
      return HttpResponse.json(
        select(
          collection(String(params.appId), String(params.entityName)),
          request,
        ),
      );
    },
  ),
  http.post(
    "*/api/apps/:appId/entities/:entityName",
    async ({ params, request }) => {
      await recordRequest("entities.create", request);
      const input = (await request.clone().json()) as Record<string, any>;
      const appId = String(params.appId);
      const created = { id: nextId(appId), ...input };
      collection(appId, String(params.entityName)).push(created);
      return HttpResponse.json(created, { status: 201 });
    },
  ),
  http.get(
    "*/api/apps/:appId/entities/:entityName/:id",
    async ({ params, request }) => {
      await recordRequest("entities.get", request);
      const found = collection(
        String(params.appId),
        String(params.entityName),
      ).find((item) => item.id === params.id);
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json(
            { detail: "Entity not found", code: "NOT_FOUND" },
            { status: 404 },
          );
    },
  ),
  http.put(
    "*/api/apps/:appId/entities/:entityName/bulk",
    async ({ params, request }) => {
      await recordRequest("entities.bulkUpdate", request);
      const updates = (await request.clone().json()) as PlatformRecord[];
      const records = collection(
        String(params.appId),
        String(params.entityName),
      );
      const changed = updates.map((update) => {
        const index = records.findIndex((item) => item.id === update.id);
        if (index < 0) return update;
        records[index] = { ...records[index], ...update };
        return records[index];
      });
      return HttpResponse.json(changed);
    },
  ),
  http.put(
    "*/api/apps/:appId/entities/:entityName/:id",
    async ({ params, request }) => {
      await recordRequest("entities.update", request);
      const updates = (await request.clone().json()) as Record<string, any>;
      const records = collection(
        String(params.appId),
        String(params.entityName),
      );
      const index = records.findIndex((item) => item.id === params.id);
      if (index < 0)
        return HttpResponse.json(
          { detail: "Entity not found", code: "NOT_FOUND" },
          { status: 404 },
        );
      records[index] = { ...records[index], ...updates };
      return HttpResponse.json(records[index]);
    },
  ),
  http.delete(
    "*/api/apps/:appId/entities/:entityName/:id",
    async ({ params, request }) => {
      await recordRequest("entities.delete", request);
      const records = collection(
        String(params.appId),
        String(params.entityName),
      );
      const index = records.findIndex((item) => item.id === params.id);
      if (index >= 0) records.splice(index, 1);
      return HttpResponse.json({ success: index >= 0 });
    },
  ),
  http.patch(
    "*/api/apps/:appId/entities/:entityName/update-many",
    async ({ params, request }) => {
      await recordRequest("entities.updateMany", request);
      const { query, data } = (await request.clone().json()) as {
        query: Record<string, any>;
        data: { $set?: Record<string, any>; $inc?: Record<string, number> };
      };
      const matching = collection(
        String(params.appId),
        String(params.entityName),
      ).filter((item) => matches(item, query));
      const selected = matching.slice(0, 500);
      for (const item of selected) {
        Object.assign(item, data.$set ?? {});
        for (const [field, amount] of Object.entries(data.$inc ?? {}))
          item[field] = Number(item[field] ?? 0) + amount;
      }
      return HttpResponse.json({
        success: true,
        updated: selected.length,
        has_more: matching.length > selected.length,
      });
    },
  ),
];
