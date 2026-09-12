import type { ExperimentsSnapshot } from "./experiments.types.js";

/** Shared versioned configuration published by the platform, never visitor-specific. */
export interface ExperimentsConfig {
  v: 1;
  app_id: string;
  revision?: number;
  flags: { key: string; rollout_percentage: number }[];
  experiments: {
    id: string;
    flag_key: string;
    run_version: number;
    assign_by: "visitor" | "user";
    traffic_allocation: number;
    variants: { key: string; value: boolean; weight: number }[];
  }[];
}

/** Identity supplied by the platform's normal authenticated request/bootstrap path. */
export interface ExperimentsIdentity {
  visitorId: string;
  userId: string | null;
  status?: "authenticated" | "anonymous" | "pending";
}

/** One request's or browser page's context. Never share it between server requests. */
export interface ExperimentsContext {
  config: ExperimentsConfig;
  identity: ExperimentsIdentity;
  preview?: Readonly<Record<string, boolean>>;
  /** Request pathname used for server-side exposure events. */
  pageUrl?: string;
  /** Exact server-rendered flags, retained for the browser's first hydration render. */
  serverSnapshot?: ExperimentsSnapshot;
}
