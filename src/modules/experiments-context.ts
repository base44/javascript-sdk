import type { ExperimentsContext } from "./experiments-config.types.js";
import { evaluateExperiments } from "./experiments-evaluator.js";
import type { ExperimentsRuntime } from "./experiments-runtime.types.js";

/** @internal Platform ingress overwrites this header; it is not authentication. */
export const EXPERIMENTS_CONTEXT_HEADER = "Base44-Experiments-Context";

/** @internal */
export function readExperimentsContext(encoded: string | null, appId: string): ExperimentsContext | undefined {
  if (!encoded || encoded.length > 96 * 1024) return;
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    return matchingContext(JSON.parse(new TextDecoder().decode(bytes)), appId);
  } catch {
    return;
  }
}

function matchingContext(value: ExperimentsContext | undefined, appId: string): ExperimentsContext | undefined {
  return value?.config?.v === 1 && value.config.app_id === appId &&
    typeof value.identity?.visitorId === "string" && value.identity.visitorId &&
    (value.identity.userId === null || typeof value.identity.userId === "string")
    ? value : undefined;
}

/** @internal */
export function getBrowserExperimentsContext(appId: string): ExperimentsContext | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  return matchingContext((window as Window & {
    __B44_EXPERIMENTS_BOOTSTRAP__?: ExperimentsContext;
  }).__B44_EXPERIMENTS_BOOTSTRAP__, appId);
}

/** One independent evaluator instance for one client/request. @internal */
export function createExperimentsRuntime(context: ExperimentsContext): ExperimentsRuntime {
  const identity = { ...context.identity };
  const evaluate = () => evaluateExperiments(context.config, identity, context.preview);
  const runtime: ExperimentsRuntime = {
    ...evaluate(),
    visitorId: identity.visitorId,
    userId: identity.userId,
    pendingUser: identity.status === "pending",
    setUser(userId) {
      identity.userId = userId;
      Object.assign(runtime, evaluate(), { userId, pendingUser: false });
    },
  };
  return runtime;
}
