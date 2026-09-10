/** A stable, read-only view of the browser's current feature flags. */
export interface ExperimentsSnapshot {
  /** Resolved flags. Empty when the runtime is absent or identity is unresolved. */
  readonly flags: Readonly<Record<string, boolean>>;
  /** Whether the SDK is resolving the signed-in user's identity. */
  readonly isLoading: boolean;
}

/**
 * Evaluates feature flags locally from platform-provided configuration and identity.
 *
 * - Reads flags and reports experiment exposures when a flag is used.
 * - Synchronizes assignments with this client's SDK login, token changes, and logout.
 * - Provides readiness and subscriptions without requiring React.
 *
 * Available as `base44.experiments` for anonymous and signed-in app visitors,
 * not in service role mode. Use one client for the app whose runtime is on the page.
 * Browsers read the platform bootstrap. Servers and Workers use the request-scoped
 * context passed by createClientFromRequest(), or explicit createClient options.
 * Missing context returns fallbacks. For authenticated first render, the platform's
 * common auth bootstrap must supply a resolved identity before mounting the app.
 * Goal conversions use the existing {@link AnalyticsModule | analytics module}.
 * Visitor-keyed conversions share the injected runtime's visitor ID. When browser
 * storage is blocked, the platform must supply a unique per-page ID; attribution
 * then lasts for that page only, not across reloads or tabs.
 */
export interface ExperimentsModule {
  /**
   * Reads a flag and queues an acknowledged exposure for its current assignment.
   *
   * Never starts an authentication request. Reads return the fallback while the
   * app's normal auth initialization is pending or failed. Supply trusted bootstrap
   * identity or let the app's existing auth.me()/login flow resolve it.
   *
   * Call only where the feature is used: a read counts as exposure, not proof of
   * visibility. Preview overrides and flags without an assignment are not tracked.
   * Exposures respect the client's analytics setting, are deduplicated per client,
   * experiment run, variant and identity. Failed sends retry up to three attempts
   * with the same event ID, timestamp and credentials. Await flush() on servers.
   *
   * @param flagKey - Feature flag key defined in your app.
   * @param fallback - Value for an unavailable flag or unresolved identity. Defaults to `false`.
   * @returns The evaluated boolean, or the fallback when unavailable.
   * @example
   * ```typescript
   * await base44.experiments.ready();
   * const showNewCheckout = base44.experiments.isEnabled('new_checkout');
   * ```
   */
  isEnabled(flagKey: string, fallback?: boolean): boolean;

  /**
   * Returns the current flags and identity-loading state without tracking exposures.
   *
   * Observes identity resolution without starting it. The returned object retains its
   * reference until its values change, for use with external-store subscriptions.
   * Use {@link ExperimentsModule.isEnabled | isEnabled()} at the feature boundary
   * to record exposure rather than displaying a variant directly from this snapshot.
   *
   * @returns A stable, read-only snapshot.
   * @example
   * ```typescript
   * const { isLoading } = base44.experiments.getSnapshot();
   * ```
   */
  getSnapshot(): ExperimentsSnapshot;

  /** Immutable initial platform snapshot for matching server render and hydration. */
  getServerSnapshot(): ExperimentsSnapshot;

  /**
   * Listens for flag or loading-state changes caused by this client's SDK auth flows.
   *
   * Does not poll for platform configuration changes or observe token writes outside
   * the SDK. {@link Base44Client.cleanup | cleanup()} removes all listeners.
   *
   * @param listener - Callback invoked when the snapshot changes.
   * @returns A function that removes the listener.
   * @example
   * ```typescript
   * const unsubscribe = base44.experiments.subscribe(() => {
   *   renderCheckout(base44.experiments.isEnabled('new_checkout'));
   * });
   * unsubscribe();
   * ```
   */
  subscribe(listener: () => void): () => void;

  /**
   * Waits for the app's common auth initialization, including a token change.
   *
   * Resolves with empty flags after an identity lookup failure. Retrying authentication
   * belongs to the normal auth flow. Missing runtimes resolve immediately. This does not wait for a future
   * runtime injection or for exposure delivery, and never records an exposure itself.
   *
   * @returns A snapshot after the current identity lookup settles.
   * @example
   * ```typescript
   * await base44.experiments.ready();
   * renderCheckout(base44.experiments.isEnabled('new_checkout'));
   * ```
   */
  ready(): Promise<ExperimentsSnapshot>;

  /**
   * Waits until queued exposures are acknowledged; rejects after bounded retries.
   * Server/Worker handlers must await this before ending the request (or use waitUntil).
   * Retries preserve event IDs but raw storage is not exactly-once. Calling again
   * retries unacknowledged events with the same IDs. No new exposures are created.
   */
  flush(): Promise<void>;
}
