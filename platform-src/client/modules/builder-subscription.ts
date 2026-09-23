import type { Joined, PlatformEvent } from "./builder.events.types.js";
import { PlatformSocketError } from "../errors.js";
import type { PlatformSocketErrorCode } from "../errors.types.js";
import type { PlatformSubscription, SubscriptionOptions } from "./builder.types.js";

/** @internal */
export function notify(callback: (error: PlatformSocketError) => void, error: PlatformSocketError): void {
  try { callback(error); } catch { /* An error observer cannot interrupt other app subscriptions. */ }
}

/** @internal */
export class Subscription implements PlatformSubscription {
  cursor: string | undefined;
  active = true;
  private ready = false;
  private pending = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(readonly appId: string, private options: SubscriptionOptions, private remove: () => void) {
    this.cursor = options.afterSeq;
  }

  enqueue(work: () => void | Promise<void>): void {
    if (!this.active) return;
    if (this.pending >= 1000) { this.fail("resync_required"); return; }
    this.pending++;
    this.tail = this.tail.then(async () => {
      if (this.active) await work();
    }).catch(() => this.fail("handler_failed")).finally(() => { this.pending--; });
  }

  join(send: (cursor?: string) => void): void {
    this.enqueue(() => { this.ready = false; send(this.cursor); });
  }

  event(event: PlatformEvent): void {
    this.enqueue(async () => {
      // A fresh subscription starts at joined, not at any old in-flight room events.
      if ((!this.ready && this.cursor === undefined) || event.seq === this.cursor) return;
      await this.options.onEvent(event);
      if (this.active) this.cursor = event.seq;
    });
  }

  joined(joined: Joined): void {
    this.enqueue(async () => {
      await this.options.onJoined?.(joined);
      if (this.active) { this.cursor = joined.seq; this.ready = true; }
    });
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
