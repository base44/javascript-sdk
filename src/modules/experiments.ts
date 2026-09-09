import type { AuthState, InternalAuthModule } from "./auth.types.js";
import type {
  ExperimentsModule,
  ExperimentsSnapshot,
} from "./experiments.types.js";
import {
  getExperimentsRuntime,
  type ExperimentsRuntime,
} from "./experiments-runtime.types.js";
import type { createExposureTracker } from "./experiment-exposures.js";

const EMPTY: ExperimentsSnapshot = Object.freeze({
  flags: Object.freeze({}),
  isLoading: false,
});

/** @internal */
export function createExperimentsModule({
  getAuth,
  trackExposure,
}: {
  getAuth: () => InternalAuthModule;
  trackExposure: ReturnType<typeof createExposureTracker>["track"];
}) {
  let runtime: ExperimentsRuntime | undefined;
  let state: AuthState | undefined;
  let snapshot = EMPTY;
  let active = false;
  let disposed = false;
  let generation = 0;
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const readyWaiters = new Set<(value: ExperimentsSnapshot) => void>();

  function settleReady() {
    if (snapshot.isLoading) return;
    for (const resolve of readyWaiters) resolve(snapshot);
    readyWaiters.clear();
  }

  function publish() {
    const isLoading = !!runtime && state?.status === "pending";
    const flags =
      runtime &&
      (state?.status === "authenticated" || state?.status === "anonymous")
        ? runtime.flags
        : EMPTY.flags;
    if (
      snapshot.isLoading === isLoading &&
      Object.keys(snapshot.flags).length === Object.keys(flags).length &&
      Object.keys(flags).every(
        (key) =>
          Object.prototype.hasOwnProperty.call(snapshot.flags, key) &&
          snapshot.flags[key] === flags[key],
      )
    ) {
      settleReady();
      return;
    }
    snapshot = Object.freeze({ flags: Object.freeze({ ...flags }), isLoading });
    settleReady();
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Observers must not interrupt authentication. */
      }
    }
  }

  function applyIdentity() {
    if (runtime) {
      const userId = state?.status === "authenticated" ? state.userId : null;
      if (runtime.userId !== userId || runtime.pendingUser)
        runtime.setUser(userId);
    }
    publish();
  }

  function resolveIdentity() {
    if (!runtime || pending || disposed) return;
    state = { status: "pending" };
    applyIdentity();
    const currentGeneration = generation;
    pending = getAuth()
      .me()
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        if (currentGeneration === generation) pending = undefined;
      });
  }

  function activate() {
    if (disposed) return;
    active = true;
    runtime = getExperimentsRuntime();
    if (!runtime) {
      publish();
      return;
    }
    if (!state)
      state = getAuth().hasToken()
        ? { status: "pending" }
        : { status: "anonymous" };
    applyIdentity();
    if (state.status === "pending") resolveIdentity();
  }

  function onAuthStateChange(next: AuthState) {
    if (disposed) return;
    state = next;
    if (next.status === "pending" || next.status === "anonymous") {
      generation++;
      pending = undefined;
    }
    if (!active) return;
    runtime = getExperimentsRuntime();
    applyIdentity();
    if (next.status === "pending") resolveIdentity();
  }

  const module: ExperimentsModule = {
    isEnabled(flagKey, fallback = false) {
      activate();
      if (!Object.prototype.hasOwnProperty.call(snapshot.flags, flagKey))
        return fallback;
      const assignment = runtime?.assignments.find(
        (item) => item.flag_key === flagKey && !item.preview,
      );
      if (runtime && assignment) trackExposure(assignment, runtime);
      return snapshot.flags[flagKey];
    },
    getSnapshot() {
      activate();
      return snapshot;
    },
    subscribe(listener) {
      activate();
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async ready() {
      activate();
      if (state?.status === "error") {
        // Wait for auth.me() to release its shared, failed request before retrying.
        await pending;
        if (state?.status === "error") resolveIdentity();
      }
      if (snapshot.isLoading)
        return new Promise<ExperimentsSnapshot>((resolve) =>
          readyWaiters.add(resolve),
        );
      return snapshot;
    },
  };

  return {
    module,
    onAuthStateChange,
    cleanup() {
      disposed = true;
      generation++;
      pending = undefined;
      runtime = undefined;
      snapshot = EMPTY;
      settleReady();
      listeners.clear();
    },
  };
}
