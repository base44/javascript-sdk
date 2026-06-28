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
 * Alias of the native [`RequestInit`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit) type.
 * Any option accepted by the browser `fetch` API is valid (`method`, `headers`, `body`, `signal`, etc.).
 * Auth headers are merged in automatically; you do not need to set them.
 */
export type FunctionsFetchInit = RequestInit;

/**
 * Configuration for the functions module.
 * @internal
 */
export interface FunctionsModuleConfig {
  getAuthHeaders?: () => Record<string, string>;
  baseURL?: string;
}

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
 * - **Service role authentication** (`base44.asServiceRole.functions`): Functions are invoked with the service role for backend code that needs elevated permissions.
 *
 * ## Generated Types
 *
 * If you're working in a TypeScript project, you can generate types from your backend functions to get autocomplete on function names when calling `invoke()`. See the [Dynamic Types](/developers/references/sdk/getting-started/dynamic-types) guide to get started.
 */
export interface FunctionsModule {
  /**
   * Invokes a custom backend function by name.
   *
   * Sends a POST request to a custom backend function deployed to the app.
   * The function receives the provided data as named parameters and returns
   * the result. If any parameter is a `File` object, the request will automatically be
   * sent as `multipart/form-data`. Otherwise, it will be sent as JSON.
   *
   * For streaming responses, non-POST methods, or raw response access, use {@linkcode fetch | fetch()} instead.
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
   * Use `fetch()` when you need low-level control that {@linkcode invoke | invoke()} doesn't provide, such as:
   * - Streaming responses, like SSE, chunked text, or NDJSON
   * - Custom HTTP methods, like PUT, PATCH, or DELETE
   * - Raw response access, including status codes, headers, and binary bodies
   *
   * @param path - Function path. Leading slash is optional, so `/chat` and `chat` are equivalent. For example, `'/streaming_demo'` or `'reports/export'`.
   * @param init - Optional [`RequestInit`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit) options such as `method`, `headers`, `body`, and `signal`. Auth headers are added automatically.
   * @returns Promise resolving to a native [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response).
   *
   * @example
   * ```typescript
   * // Stream an SSE response
   * const response = await base44.functions.fetch('/chat', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ prompt: 'Hello!' }),
   * });
   *
   * const reader = response.body!.getReader();
   * const decoder = new TextDecoder();
   *
   * while (true) {
   *   const { done, value } = await reader.read();
   *   if (done) break;
   *   console.log(decoder.decode(value, { stream: true }));
   * }
   * ```
   *
   * @example
   * ```typescript
   * // PUT request
   * const response = await base44.functions.fetch('/users/profile', {
   *   method: 'PUT',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ name: 'Jane', role: 'admin' }),
   * });
   *
   * if (!response.ok) {
   *   throw new Error(`Request failed: ${response.status}`);
   * }
   *
   * const updated = await response.json();
   * ```
   *
   * @example
   * ```typescript
   * // Download a binary file
   * const response = await base44.functions.fetch('/export/report');
   * const blob = await response.blob();
   *
   * const url = URL.createObjectURL(blob);
   * const a = document.createElement('a');
   * a.href = url;
   * a.download = 'report.pdf';
   * a.click();
   * ```
   */
  fetch(path: string, init?: FunctionsFetchInit): Promise<Response>;
}
