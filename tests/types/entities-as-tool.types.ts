import type { Base44Client } from "../../src/index.js";

declare const base44: Base44Client;

// asTool returns a Record<string, Tool> (one per allowed operation)
const tools = base44.entities.Order.asTool({ operations: ["read", "update"] });
const _read = tools["read_Order"];
const _desc: string = _read.description;

// default (no args) is allowed
const _readOnly = base44.entities.Order.asTool();

// @ts-expect-error operations must be from the allowed union
base44.entities.Order.asTool({ operations: ["purge"] });

import type { Tool } from "../../src/index.js";

// A returned entry is assignable to Tool
const _t: Tool = tools["read_Order"];
