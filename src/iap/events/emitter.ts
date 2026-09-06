/**
 * Delivering events to the app's handlers.
 *
 * Two rules, both about not letting an app's own code break Apple's contract:
 *
 * 1. **A handler runs after the write, never before.** An event means the data
 *    behind it is already stored.
 * 2. **A handler can never change the outcome.** If one throws, the throw is
 *    swallowed and reported; the HTTP response Apple sees is unaffected.
 *
 * Events are dispatched *synchronously* before the response is returned, not
 * after it. A Base44 backend function has no way to run work once it has
 * answered — there is no `waitUntil` — so anything deferred until after the
 * response is simply lost when the isolate stops.
 *
 * @internal
 */
import type { IapEvent, IapEventHandler } from "./events.types.js";

/** Reports a handler that threw. Defaults to a single console line. */
export type IapHandlerFailureReporter = (
  event: IapEvent,
  error: unknown
) => void;

/** The event bus for one client. */
export interface IapEmitter {
  /** Registers a handler. Returns a function that removes it. */
  onEvent(handler: IapEventHandler): () => void;
  /** Delivers events to every handler, swallowing their failures. */
  emit(events: readonly IapEvent[]): Promise<void>;
}

function defaultReporter(event: IapEvent, error: unknown): void {
  // Deliberately one line and not re-thrown. A broken handler must not take
  // the webhook down with it, and it must not be silent either.
  console.error(
    `[base44 iap] an onEvent handler failed for ${event.type}:`,
    error instanceof Error ? error.message : error
  );
}

export function createEmitter(
  reportFailure: IapHandlerFailureReporter = defaultReporter
): IapEmitter {
  const handlers = new Set<IapEventHandler>();

  return {
    onEvent(handler: IapEventHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    async emit(events: readonly IapEvent[]): Promise<void> {
      if (handlers.size === 0 || events.length === 0) return;

      // A snapshot, so a handler that registers another one during dispatch
      // does not change what this round delivers.
      const current = [...handlers];

      for (const event of events) {
        for (const handler of current) {
          try {
            await handler(event);
          } catch (error) {
            reportFailure(event, error);
          }
        }
      }
    },
  };
}
