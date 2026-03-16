/**
 * Registry of function names. The [`types generate`](/developers/references/cli/commands/types-generate) command fills this registry, then [`FunctionName`](#functionname) resolves to a union of the keys.
 */
export interface FunctionNameRegistry {}

/**
 * Union of all function names from the [`FunctionNameRegistry`](#functionnameregistry). Defaults to `string` when no types have been generated.
 *
 * @example
 * ```typescript
 * // Using generated function name types
 * // With generated types, you get autocomplete on function names
 * await base44.functions.invoke('calculateTotal', { items: ['item1', 'item2'] });
 * ```
 */
export type FunctionName = keyof FunctionNameRegistry extends never
  ? string
  : keyof FunctionNameRegistry;

/**
 * Options for {@linkcode FunctionsModule.fetch}.
 *
 * Uses native `fetch` options directly.
 */
export type FunctionsFetchInit = RequestInit;

/**
 * Functions module for invoking custom backend functions.
 *
 * This module allows you to invoke the custom backend functions defined in the app.
 *
 * ## Authentication Modes
 *
 * This module is available to use with a client in all authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.functions`): Functions are invoked with the current user's permissions. Anonymous users invoke functions without authentication, while authenticated users invoke functions with their authentication context.
 * - **Service role authentication** (`base44.asServiceRole.functions`): Functions are invoked with elevated admin-level permissions. The function code receives a request with admin authentication context.
 *
 * ## Generated Types
 *
 * If you're working in a TypeScript project, you can generate types from your backend functions to get autocomplete on function names when calling `invoke()`. See the [Dynamic Types](/developers/references/sdk/getting-started/dynamic-types) guide to get started.
 */
export interface FunctionsModule {
  /**
   * Invokes a custom backend function by name.
   *
   * Calls a custom backend function deployed to the app.
   * The function receives the provided data as named parameters and returns
   * the result. If any parameter is a `File` object, the request will automatically be
   * sent as `multipart/form-data`. Otherwise, it will be sent as JSON.
   *
   * @param functionName - The name of the function to invoke.
   * @param data - An object containing named parameters for the function.
   * @returns Promise resolving to the function's response. The `data` property contains the data returned by the function, if there is any.
   *
   * @example
   * ```typescript
   * // Basic function call
   * const result = await base44.functions.invoke('calculateTotal', {
   *   items: ['item1', 'item2'],
   * });
   * console.log(result.data.total);
   * ```
   *
   * @example
   * ```typescript
   * // Function with file upload in React
   * const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
   *   const file = event.target.files?.[0];
   *   if (file) {
   *     const processedImage = await base44.functions.invoke('processImage', {
   *       image: file,
   *       filter: 'grayscale',
   *       quality: 80
   *     });
   *   }
   * };
   * ```
   */
  invoke(functionName: FunctionName, data?: Record<string, any>): Promise<any>;

  /**
   * Performs a direct HTTP request to a backend function path and returns the native `Response`.
   *
   * Use this method when you need low-level control over the request/response that the higher-level
   * `invoke()` abstraction doesn't provide, such as:
   * - Streaming responses (SSE, chunked text, NDJSON)
   * - Custom HTTP methods (PUT, PATCH, DELETE, etc.)
   * - Custom headers or request configuration
   * - Access to raw response metadata (status, headers)
   * - Direct control over request/response bodies
   *
   * Requests are sent to `/api/functions/<path>`.
   *
   * @param path - Function path, e.g. `/streaming_demo` or `/streaming_demo/deep/path`
   * @param init - Native fetch options.
   * @returns Promise resolving to a native fetch `Response`
   */
  fetch(path: string, init?: FunctionsFetchInit): Promise<Response>;
}
