/**
 * Functions module for invoking custom backend functions.
 *
 * This module allows you to invoke the custom backend functions defined in the app.
 *
 * This module is available to use with a client in all authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.functions`): Functions are invoked with the current user's permissions. Anonymous users invoke functions without authentication, while authenticated users invoke functions with their authentication context.
 * - **Service role authentication** (`base44.asServiceRole.functions`): Functions are invoked with elevated admin-level permissions. The function code receives a request with admin authentication context.
 *
 * @example
 * ```typescript
 * // Invoke a function with parameters
 * const result = await base44.functions.invoke('calculateTotal', {
 *   items: ['item1', 'item2'],
 *   discount: 0.1
 * });
 * console.log(result.data);
 * ```
 *
 * @example
 * ```typescript
 * // Invoke with service role
 * const adminResult = await base44.asServiceRole.functions.invoke('adminTask', {
 *   action: 'cleanup'
 * });
 * ```
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
   * @returns Promise resolving to the function's response, with the `data` property containing the data returned by the function, if there is any.
   *
   * @example
   * ```typescript
   * // Basic function call
   * const result = await base44.functions.invoke('calculateTotal', {
   *   items: ['item1', 'item2'],
   *   discount: 0.1
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
  invoke(functionName: string, data: Record<string, any>): Promise<any>;
}
