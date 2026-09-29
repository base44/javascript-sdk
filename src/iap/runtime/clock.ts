/**
 * The clock seam.
 *
 * Subscription status is derived against "now" at read time, and consumption
 * deadlines are computed from it, so every test that pins a status needs to
 * pin the clock too.
 *
 * @internal
 */

/** Returns the current time in milliseconds since the epoch. */
export type Clock = () => number;

/** The real clock. */
export const systemClock: Clock = () => Date.now();
