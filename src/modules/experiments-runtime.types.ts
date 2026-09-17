/** @internal */
export interface ExperimentAssignment {
  experiment_id: string;
  flag_key: string;
  run_version: number;
  variant_key: string;
  preview: boolean;
}

/** @internal */
export interface ExperimentsRuntime {
  flags: Record<string, boolean>;
  assignments: ExperimentAssignment[];
  visitorId: string;
  userId: string | null;
  pendingUser: boolean;
  setUser(id: string | null): void;
}

/** @internal */
export function getExperimentsRuntime(appId?: string): ExperimentsRuntime | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const page = window as Window & {
    __B44_EXPERIMENTS__?: ExperimentsRuntime;
    __B44_EXPERIMENTS_BOOTSTRAP__?: { config: { app_id: string } };
  };
  // The legacy evaluator has no app ID; its companion bootstrap identifies its owner.
  if (appId !== undefined && page.__B44_EXPERIMENTS_BOOTSTRAP__?.config?.app_id !== appId) return;
  return page.__B44_EXPERIMENTS__;
}
