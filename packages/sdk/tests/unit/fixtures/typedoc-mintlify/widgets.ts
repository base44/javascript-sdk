// Input for typedoc-mintlify.test.ts: one case per thing the Mintlify pipeline once rendered wrong.

/** A widget the API returns. */
export interface Widget {
  /** ID of the widget, such as `w_1`. */
  id: string;
  /** Name of the widget. */
  name: string;
}

/** Options for {@link makeWidgets}. */
export interface WidgetOptions {
  /** ID to start from. */
  start: string;
  /**
   * Called with each new widget.
   *
   * @param widget - The widget that was made.
   */
  onWidget?: (widget: Widget) => void;
}

/** Calls on widgets. */
export interface Widgets {
  /**
   * Gets a widget.
   *
   * @param id - ID of the widget.
   * @returns Promise resolving to the widget.
   */
  get(id: string): Promise<Widget>;
  /**
   * Saves values.
   *
   * @param values - The values, keyed by name.
   * @returns Promise resolving once the values are sent.
   */
  save(values: Record<string, string>): Promise<void>;
  /**
   * Describes a widget.
   *
   * @returns Promise resolving to a string or an object.
   */
  describe(): Promise<string | object>;
}

/**
 * Makes widgets.
 *
 * @param options - Where to start, and what to call for each widget.
 * @returns The widgets, with `get` and `save`.
 */
export function makeWidgets(options: WidgetOptions): Widgets {
  void options;
  throw new Error("fixture");
}

/**
 * Makes one widget.
 *
 * @param name - Name of the widget.
 * @returns Promise resolving to the widget, with its `id`.
 */
export async function makeWidget(name: string): Promise<Widget> {
  void name;
  throw new Error("fixture");
}
