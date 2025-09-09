export * from "./modules/types.js";

export type ModelFilterParams = {
  q?: Record<string, any>;
  sort?: string | null;
  sort_by?: string | null;
  limit?: number | null;
  skip?: number | null;
  fields?: string[] | null;
};


