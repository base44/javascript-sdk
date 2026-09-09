/** A stable, read-only view of the browser's current feature flags. */
export interface ExperimentsSnapshot {
  /** Resolved flags. Empty when the runtime is absent or identity is unresolved. */
  readonly flags: Readonly<Record<string, boolean>>;
  /** Whether the SDK is resolving the signed-in user's identity. */
  readonly isLoading: boolean;
}

/**
 * Reads feature flags evaluated by the Base44 browser runtime.
 *
 * - Reads flags and reports experiment exposures when a flag is used.
 * - Synchronizes assignments with this client's SDK login, token changes, and logout.
 * - Provides readiness and subscriptions without requiring React.
 *
 * Available as `base44.experiments` for anonymous and signed-in app visitors,
 * not in service role mode. Use one client for the app whose runtime is on the page.
 * The platform must inject the Experiments runtime before this module can evaluate
 * flags. Without it, including on servers and Workers, reads return their fallback;
 * this module does not provide server-side evaluation or hydration guarantees.
 * Goal conversions use the existing {@link AnalyticsModule | analytics module}.
 * Visitor-keyed conversion attribution requires matching runtime and analytics
 * visitor IDs; blocked browser storage is not currently supported for attribution.
 */
export interface ExperimentsModule {
  /**
   * Reads a flag and reports a best-effort exposure for its current assignment.
   *
   * The first use resolves identity through {@link AuthModule.me | auth.me()}
   * when the client has a token. Reads return the fallback while identity is
   * pending or could not be resolved. Await {@link ExperimentsModule.ready | ready()}
   * or subscribe to updates before displaying authenticated variants.
   *
   * Call only where the feature is used: a read counts as exposure, not proof of
   * visibility. Preview overrides and flags without an assignment are not tracked.
   * Exposures respect the client's analytics setting, are deduplicated per client,
   * experiment run, variant and identity, and retry only on a later read after failure.
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
   * Starts lazy identity resolution if needed. The returned object retains its
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
   * Waits for the current identity lookup, including a token change during that lookup.
   *
   * Resolves with empty flags after an identity lookup failure; calling again retries
   * the lookup. Missing runtimes resolve immediately. This does not wait for a future
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
}
