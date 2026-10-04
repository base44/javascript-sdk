import type { PlatformEvent, Snapshot } from "./builder.events.types.js";
import { PlatformSocketError } from "../errors.js";
import type { PlatformSocketErrorCode } from "../errors.types.js";
import type { PlatformSubscription, SubscriptionOptions } from "./builder.types.js";

/** @internal */
export function notify(callback: (error: PlatformSocketError) => void, error: PlatformSocketError): void {
  try { callback(error); } catch { /* An error observer cannot interrupt other app subscriptions. */ }
}

/** @internal */
export class Subscription implements PlatformSubscription {
  active = true;
  private pending = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(readonly appId: string, private options: SubscriptionOptions, private remove: () => void) {}

  private enqueue(work: () => void | Promise<void>): void {
    if (!this.active) return;
    if (this.pending >= 1000) { this.fail("delivery_overflow"); return; }
    this.pending++;
    this.tail = this.tail.then(async () => {
      if (this.active) await work();
    }).catch(() => this.fail("handler_failed")).finally(() => { this.pending--; });
  }

  event(event: PlatformEvent): void {
    this.enqueue(() => this.options.onEvent(event));
  }

  snapshot(snapshot: Snapshot): void {
    this.enqueue(() => this.options.onSnapshot(snapshot));
  }

  /** A non-fatal problem; the subscription keeps receiving events. */
  warn(code: PlatformSocketErrorCode): void {
    if (this.active) notify(this.options.onError, new PlatformSocketError(code, this.appId));
  }

  fail(code: PlatformSocketErrorCode): void {
    if (!this.active) return;
    this.unsubscribe();
    notify(this.options.onError, new PlatformSocketError(code, this.appId));
  }

  unsubscribe(): void {
    if (!this.active) return;
    this.active = false;
    this.remove();
  }
}
