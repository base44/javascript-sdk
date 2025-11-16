/**
 * Functions module for invoking custom backend functions.
 *
 * This module allows you to invoke custom backend functions that you've
 * deployed to your Base44 app. Functions can accept parameters and return
 * results, and support file uploads.
 *
 * Functions can be invoked with either user authentication or service role
 * authentication depending on your use case.
 *
 * @example
 * ```typescript
 * // Invoke a function with parameters
 * const result = await client.functions.invoke('calculateTotal', {
 *   items: ['item1', 'item2'],
 *   discount: 0.1
 * });
 * console.log(result.data);
 *
 * // Invoke a function with file upload
 * const fileResult = await client.functions.invoke('processImage', {
 *   image: fileInput.files[0],
 *   filter: 'grayscale'
 * });
 *
 * // Invoke with service role
 * const adminResult = await client.asServiceRole.functions.invoke('adminTask', {
 *   action: 'cleanup'
 * });
 * ```
 */
export interface FunctionsModule {
  /**
   * Invoke a custom backend function by name.
   *
   * Calls a custom backend function that you've deployed to your Base44 app.
   * The function receives the provided data as named parameters and returns
   * the result.
   *
   * **File Upload Support:**
   * If any parameter is a `File` object, the request will automatically be
   * sent as `multipart/form-data`. Otherwise, it will be sent as JSON.
   *
   * @param functionName - The name of the function to invoke
   * @param data - An object containing named parameters for the function
   * @returns Promise resolving to the function's response
   *
   * @throws {Error} When data is a string instead of an object
   *
   * @example
   * ```typescript
   * // Basic function call
   * const result = await client.functions.invoke('calculateTotal', {
   *   items: ['item1', 'item2'],
   *   discount: 0.1
   * });
   * console.log(result.data.total);
   *
   * // Function with file upload
   * const imageFile = document.querySelector('input[type="file"]').files[0];
   * const processedImage = await client.functions.invoke('processImage', {
   *   image: imageFile,
   *   filter: 'grayscale',
   *   quality: 80
   * });
   *
   * // Health check function
   * const health = await client.functions.invoke('healthCheck', {});
   * console.log(health.data.status);
   * ```
   */
  invoke(functionName: string, data: Record<string, any>): Promise<any>;
}
