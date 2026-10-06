/**
 * Properties for analytics events.
 *
 * Key-value pairs with additional event data. Values can be strings, numbers, booleans, or null.
 */
export type TrackEventProperties = {
  [key: string]: string | number | boolean | null | undefined;
};

/**
 * Parameters for tracking an analytics event.
 */
export type TrackEventParams = {
  /**
   * Name of the event to track.
   *
   * Use descriptive names like `button_click`, `form_submit`, or `purchase_completed`.
   */
  eventName: string;
  /**
   * Optional key-value pairs with additional event data.
   *
   * Values can be strings, numbers, booleans, or null.
   *
   * @example
   * ```typescript
   * base44.analytics.track({
   *   eventName: 'add_to_cart',
   *   properties: {
   *     product_id: 'prod_123',
   *     price: 29.99,
   *     quantity: 2
   *   }
   * });
   * ```
   */
  properties?: TrackEventProperties;
};

export type TrackEventIntrinsicData = {
  timestamp: string;
  pageUrl?: string | null;
};

export type TrackEventData = {
  properties?: TrackEventProperties;
  eventName: string;
} & TrackEventIntrinsicData;

export type SessionContext = {
  user_id?: string | null;
  session_id?: string | null;
};

export type AnalyticsApiRequestData = {
  event_name: string;
  properties?: TrackEventProperties;
  timestamp?: string;
  page_url?: string | null;
} & SessionContext;

export type AnalyticsApiBatchRequest = {
  method: "POST";
  url: `/apps/${string}/analytics/track/batch`;
  data: {
    events: AnalyticsApiRequestData[];
  };
};

export type AnalyticsModuleOptions = {
  enabled?: boolean;
  maxQueueSize?: number;
  throttleTime?: number;
  batchSize?: number;
  // used for live users count tracking
  heartBeatInterval?: number;
};

/**
 * Analytics module for tracking custom events in your app.
 *
 * Use this module to track specific user actions. Track things like button clicks, form submissions, purchases, and feature usage.
 *
 * <Note> Analytics events tracked with this module appear as custom event cards in the [Analytics dashboard](/documentation/performance-and-seo/app-analytics).</Note>
 *
 * ## Best Practices
 *
 * When tracking events:
 *
 * - Choose clear, descriptive event names in snake_case like `signup_button_click` or `purchase_completed` rather than generic names like `click`.
 * - Include relevant context in your properties such as identifiers like `product_id`, measurements like `price`, and flags like `is_first_purchase`.
 *
 * ## Authentication Modes
 *
 * This module is only available in user authentication mode (`base44.analytics`).
 */
export interface AnalyticsModule {
  /**
   * Tracks a custom event that appears as a card in your Analytics dashboard.
   *
   * Each unique event name becomes its own card showing total count and trends over time. This method returns immediately and events are sent in batches in the background.
   *
   * @param params - Event parameters.
   * @param params.eventName - Name of the event. This becomes the card title in your dashboard. Use descriptive names like `'signup_button_click'` or `'purchase_completed'`.
   * @param params.properties - Optional data to attach to the event. You can filter and analyze events by these properties in the dashboard.
   *
   * @example Track a button click
   * ```typescript
   * // Track a button click
   * base44.analytics.track({
   *   eventName: 'signup_button_click'
   * });
   * ```
   *
   * @example Track with properties
   * ```typescript
   * // Track with properties
   * base44.analytics.track({
   *   eventName: 'add_to_cart',
   *   properties: {
   *     product_id: 'prod_123',
   *     product_name: 'Premium Widget',
   *     price: 29.99,
   *     quantity: 2,
   *     is_first_purchase: true
   *   }
   * });
   * ```
   */
  track(params: TrackEventParams): void;
}
