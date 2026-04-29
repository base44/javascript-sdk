import type { EntityFilterQuery } from "../../src/index.js";

interface ExampleRecord {
  external_id: string;
  title: string;
  count: number;
  active: boolean;
  notes?: string;
  labels: string[];
  created_date: string;
}

const exactValues = {
  external_id: "item-1",
  title: "Example item",
  count: 37,
  active: false,
} satisfies EntityFilterQuery<ExampleRecord>;

const nullValues = {
  title: null,
  notes: null,
} satisfies EntityFilterQuery<ExampleRecord>;

const arrayShorthand = {
  external_id: ["item-1", "item-2"],
} satisfies EntityFilterQuery<ExampleRecord>;

const equalityOperators = {
  external_id: {
    $eq: "item-1",
    $ne: "item-2",
    $in: ["item-1", "item-2"],
    $nin: ["item-3", null],
  },
} satisfies EntityFilterQuery<ExampleRecord>;

const comparisonOperators = {
  count: {
    $gt: 10,
    $gte: 37,
    $lt: 100,
    $lte: 37,
  },
  created_date: {
    $gte: "2026-04-01T00:00:00.000000",
  },
} satisfies EntityFilterQuery<ExampleRecord>;

const fieldOperators = {
  title: {
    $exists: true,
    $regex: "Example",
  },
  labels: {
    $all: ["featured", "demo"],
    $size: 2,
  },
  count: {
    $not: { $lt: 10 },
  },
} satisfies EntityFilterQuery<ExampleRecord>;

const logicalOperators = {
  $and: [{ active: false }, { count: { $gt: 10 } }],
  $or: [{ external_id: "item-1" }, { title: "Example item" }],
  $nor: [{ active: true }, { count: { $lt: 1 } }],
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsUnknownField = {
  // @ts-expect-error Unknown fields should be rejected.
  missing: "value",
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsWrongScalarType = {
  // @ts-expect-error Field values should match the entity field type.
  count: "37",
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsWrongInType = {
  // @ts-expect-error $in values should match the entity field type.
  external_id: { $in: [37] },
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsWrongExistsType = {
  // @ts-expect-error $exists expects a boolean.
  external_id: { $exists: "yes" },
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsRegexOnNumber = {
  // @ts-expect-error $regex is only valid for string fields.
  count: { $regex: "37" },
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsAllOnString = {
  // @ts-expect-error $all is only valid for array fields.
  title: { $all: ["Example"] },
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsRootNot = {
  // @ts-expect-error $not is field-level only.
  $not: { count: { $lt: 10 } },
} satisfies EntityFilterQuery<ExampleRecord>;

const rejectsFieldOr = {
  // @ts-expect-error $or is root-level only.
  title: { $or: [{ title: "Example item" }] },
} satisfies EntityFilterQuery<ExampleRecord>;
