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
export function getExperimentsRuntime(): ExperimentsRuntime | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  return (window as Window & { __B44_EXPERIMENTS__?: ExperimentsRuntime })
    .__B44_EXPERIMENTS__;
}
