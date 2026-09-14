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
import type { ExperimentsContext } from "./experiments-config.types.js";
import { createExperimentsRuntime } from "./experiments-context.js";

const EMPTY: ExperimentsSnapshot = Object.freeze({
  flags: Object.freeze({}),
  isLoading: false,
});

/** @internal */
export function createExperimentsModule({
  getAuth,
  trackExposure,
  flushExposures = async () => {},
  context,
}: {
  getAuth: () => InternalAuthModule;
  trackExposure: ReturnType<typeof createExposureTracker>["track"];
  flushExposures?: () => Promise<void>;
  context?: ExperimentsContext;
}) {
  let runtime: ExperimentsRuntime | undefined = context ? createExperimentsRuntime(context) : undefined;
  let state: AuthState | undefined = context
    ? context.identity.status === "pending" ? { status: "pending" }
      : context.identity.userId ? { status: "authenticated", userId: context.identity.userId }
      : { status: "anonymous" }
    : undefined;
  let snapshot = EMPTY;
  let active = false;
  let disposed = false;
  const listeners = new Set<() => void>();
  const readyWaiters = new Set<(value: ExperimentsSnapshot) => void>();
  const initial = context?.serverSnapshot ?? (context ? {
    flags: context.identity.status === "pending" ? {} : runtime!.flags,
    isLoading: context.identity.status === "pending",
  } : EMPTY);
  const serverSnapshot: ExperimentsSnapshot = Object.freeze({ ...initial, flags: Object.freeze({ ...initial.flags }) });

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

  function activate() {
    if (disposed) return;
    active = true;
    if (!context) runtime = getExperimentsRuntime();
    if (!runtime) {
      publish();
      return;
    }
    if (!state)
      state = getAuth().hasToken()
        ? { status: "pending" }
        : { status: "anonymous" };
    applyIdentity();
  }

  function onAuthStateChange(next: AuthState) {
    if (disposed) return;
    state = next;
    if (!active) return;
    if (!context) runtime = getExperimentsRuntime();
    applyIdentity();
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
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      activate();
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async ready() {
      activate();
      if (snapshot.isLoading)
        return new Promise<ExperimentsSnapshot>((resolve) =>
          readyWaiters.add(resolve),
        );
      return snapshot;
    },
    flush: flushExposures,
  };

  return {
    module,
    onAuthStateChange,
    visitorId: () => runtime?.visitorId,
    cleanup() {
      disposed = true;
      runtime = undefined;
      snapshot = EMPTY;
      settleReady();
      listeners.clear();
    },
  };
}
