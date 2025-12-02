/**
 * Function signature for calling an integration endpoint.
 *
 * If any parameter is a `File` object, the request will automatically be
 * sent as `multipart/form-data`. Otherwise, it will be sent as JSON.
 *
 * @param data - An object containing named parameters for the integration endpoint.
 * @returns Promise resolving to the integration endpoint's response.
 */
export type IntegrationEndpointFunction = (
  data: Record<string, any>
) => Promise<any>;

/**
 * A package containing integration endpoints.
 *
 * Provides dynamic access to integration endpoints within a package.
 * Each endpoint is accessed as a property that returns a function to invoke it.
 *
 * @example
 * ```typescript
 * // Access endpoints dynamically
 * const result = await integrations.Core.SendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'Message'
 * });
 * ```
 */
export type IntegrationPackage = {
  [endpointName: string]: IntegrationEndpointFunction;
};

/**
 * Parameters for the InvokeLLM function.
 */
export interface InvokeLLMParams {
  /** The prompt text to send to the model */
  prompt: string;
  /** If set to `true`, the LLM will use Google Search, Maps, and News to gather real-time context before answering.
   * @default false
   */
  add_context_from_internet?: boolean;
  /** If you want structured data back, provide a [JSON schema object](https://json-schema.org/understanding-json-schema/reference/object) here. If provided, the function returns a JSON object; otherwise, it returns a string. */
  response_json_schema?: object;
  /** A list of file URLs (uploaded via UploadFile) to provide as context/attachments to the LLM. Do not use this together with `add_context_from_internet`. */
  file_urls?: string[];
}

/**
 * Parameters for the GenerateImage function.
 */
export interface GenerateImageParams {
  /** Description of the image to generate. */
  prompt: string;
}

/**
 * Return type for the GenerateImage function.
 */
export interface GenerateImageResult {
  /** URL of the generated image. */
  url: string;
}

/**
 * Parameters for the UploadFile function.
 */
export interface UploadFileParams {
  /** The file object to upload. */
  file: File;
}

/**
 * Return type for the UploadFile function.
 */
export interface UploadFileResult {
  /** URL of the uploaded file. */
  file_url: string;
}

/**
 * Parameters for the SendEmail function.
 */
export interface SendEmailParams {
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Plain text email body content. */
  body: string;
  /** The name of the sender. If omitted, the app's name will be used. */
  from_name?: string;
}

/**
 * Return type for the SendEmail function.
 */
export type SendEmailResult = any;

/**
 * Parameters for the ExtractDataFromUploadedFile function.
 */
export interface ExtractDataFromUploadedFileParams {
  /** The URL of the uploaded file to extract data from. */
  file_url: string;
  /** A [JSON schema object](https://json-schema.org/understanding-json-schema/reference/object) defining what data fields you want to extract. */
  json_schema: object;
}

/**
 * Return type for the ExtractDataFromUploadedFile function.
 */
export type ExtractDataFromUploadedFileResult = object;

/**
 * Parameters for the UploadPrivateFile function.
 */
export interface UploadPrivateFileParams {
  /** The file object to upload. */
  file: File;
}

/**
 * Return type for the UploadPrivateFile function.
 */
export interface UploadPrivateFileResult {
  /** URI of the uploaded private file, used to create a signed URL. */
  file_uri: string;
}

/**
 * Parameters for the CreateFileSignedUrl function.
 */
export interface CreateFileSignedUrlParams {
  /** URI of the uploaded private file. */
  file_uri: string;
  /** How long the signed URL should be valid for, in seconds.
   * @default 300 (5 minutes)
   */
  expires_in?: number;
}

/**
 * Return type for the CreateFileSignedUrl function.
 */
export interface CreateFileSignedUrlResult {
  /** Temporary signed URL to access the private file. */
  signed_url: string;
}

/**
 * Core package containing built-in Base44 integration functions.
 */
export interface CoreIntegrations {
  /**
   * Generate text or structured JSON data using AI models.
   *
   * @param params - Parameters for the LLM invocation
   * @returns Promise resolving to a string (when no schema provided) or an object (when schema provided).
   *
   * @example
   * ```typescript
   * // Basic prompt
   * const response = await base44.integrations.Core.InvokeLLM({
   *   prompt: "Write a haiku about coding."
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Prompt with internet context
   * const response = await base44.integrations.Core.InvokeLLM({
   *   prompt: "What is the current stock price of Wix and what was the latest major news about it?",
   *   add_context_from_internet: true
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Structured JSON response
   * const response = await base44.integrations.Core.InvokeLLM({
   *   prompt: "Analyze the sentiment of this review: 'The service was slow but the food was amazing.'",
   *   response_json_schema: {
   *     type: "object",
   *     properties: {
   *       sentiment: { type: "string", enum: ["positive", "negative", "mixed"] },
   *       score: { type: "number", description: "Score from 1-10" },
   *       key_points: { type: "array", items: { type: "string" } }
   *     }
   *   }
   * });
   * // Returns object: { sentiment: "mixed", score: 7, key_points: ["slow service", "amazing food"] }
   * ```
   */
  InvokeLLM(params: InvokeLLMParams): Promise<string | object>;

  /**
   * Create AI-generated images from text prompts.
   *
   * @param params - Parameters for image generation
   * @returns Promise resolving to the generated image URL.
   *
   * @example
   * ```typescript
   * // Generate an image from a text prompt
   * const {url} = await base44.integrations.Core.GenerateImage({
   *   prompt: "A serene mountain landscape with a lake in the foreground"
   * });
   * console.log(url); // https://...generated_image.png
   * ```
   */
  GenerateImage(params: GenerateImageParams): Promise<GenerateImageResult>;

  /**
   * Upload files to public storage and get a URL.
   *
   * @param params - Parameters for file upload
   * @returns Promise resolving to an object containing the uploaded file URL.
   *
   * @example
   * ```typescript
   * // Upload a file in React
   * const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
   *   const file = event.target.files?.[0];
   *   if (!file) return;
   *
   *   const { file_url } = await base44.integrations.Core.UploadFile({ file });
   *   console.log(file_url); // https://...uploaded_file.pdf
   * };
   * ```
   */
  UploadFile(params: UploadFileParams): Promise<UploadFileResult>;

  /**
   * Send emails to registered users of your app.
   *
   * @param params - Parameters for sending email
   * @returns Promise resolving when the email is sent.
   */
  SendEmail(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Extract structured data from uploaded files based on the specified schema.
   *
   * Start by uploading the file to public storage using the {@linkcode UploadFile | UploadFile()} function. Then, use the `file_url` parameter to extract structured data from the uploaded file.
   *
   * @param params - Parameters for data extraction
   * @returns Promise resolving to the extracted data.
   *
   * @example
   * ```typescript
   * // Extract data from an already uploaded file
   * const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
   *   file_url: "https://example.com/files/invoice.pdf",
   *   json_schema: {
   *     type: "object",
   *     properties: {
   *       invoice_number: { type: "string" },
   *       total_amount: { type: "number" },
   *       date: { type: "string" },
   *       vendor_name: { type: "string" }
   *     }
   *   }
   * });
   * console.log(result); // { invoice_number: "INV-12345", total_amount: 1250.00, ... }
   * ```
   *
   * @example
   * ```typescript
   * // Upload a file and extract data in React
   * const handleFileExtraction = async (event: React.ChangeEvent<HTMLInputElement>) => {
   *   const file = event.target.files?.[0];
   *   if (!file) return;
   *
   *   // First, upload the file
   *   const { file_url } = await base44.integrations.Core.UploadFile({ file });
   *
   *   // Then extract structured data from it
   *   const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
   *     file_url,
   *     json_schema: {
   *       type: "object",
   *       properties: {
   *         summary: {
   *           type: "string",
   *           description: "A brief summary of the file content"
   *         },
   *         keywords: {
   *           type: "array",
   *           items: { type: "string" }
   *         },
   *         document_type: {
   *           type: "string"
   *         }
   *       }
   *     }
   *   });
   *   console.log(result); // { summary: "...", keywords: [...], document_type: "..." }
   * };
   * ```
   */
  ExtractDataFromUploadedFile(
    params: ExtractDataFromUploadedFileParams
  ): Promise<ExtractDataFromUploadedFileResult>;

  /**
   * Upload files to private storage that requires a signed URL to access.
   *
   * Create a signed URL to access uploaded files using the {@linkcode CreateFileSignedUrl | CreateFileSignedUrl()} function.
   *
   * @param params - Parameters for private file upload
   * @returns Promise resolving to an object with a `file_uri` used to create a signed URL to access the uploaded file.
   *
   * @example
   * ```typescript
   * // Upload a private file
   * const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
   * console.log(file_uri); // "private/user123/document.pdf"
   * ```
   *
   * @example
   * ```typescript
   * // Upload a private file and create a signed URL
   * const handlePrivateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
   *   const file = event.target.files?.[0];
   *   if (!file) return;
   *
   *   // Upload to private storage
   *   const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
   *
   *   // Create a signed URL that expires in 1 hour (3600 seconds)
   *   const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
   *     file_uri,
   *     expires_in: 3600
   *   });
   *
   *   console.log(signed_url); // Temporary URL to access the private file
   * };
   * ```
   */
  UploadPrivateFile(
    params: UploadPrivateFileParams
  ): Promise<UploadPrivateFileResult>;

  /**
   * Generate temporary access links for private files.
   *
   * Start by uploading the file to private storage using the {@linkcode UploadPrivateFile | UploadPrivateFile()} function. Then, use the `file_uri` parameter to create a signed URL to access the uploaded file.
   *
   * @param params - Parameters for creating signed URL
   * @returns Promise resolving to an object with a temporary `signed_url`.
   *
   * @example
   * ```typescript
   * // Create a signed URL for a private file
   * const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
   *   file_uri: "private/user123/document.pdf",
   *   expires_in: 7200 // URL expires in 2 hours
   * });
   * console.log(signed_url); // https://...?signature=...
   * ```
   */
  CreateFileSignedUrl(
    params: CreateFileSignedUrlParams
  ): Promise<CreateFileSignedUrlResult>;
}

/**
 * Integrations module for calling integration endpoints.
 *
 * This module provides access to integration endpoints for interacting with external
 * services. Integrations are organized into packages. Base44 provides built-in integrations
 * in the "Core" package, and you can install additional integration packages for other services.
 *
 * Unlike the connectors module that gives you raw OAuth tokens, integrations provide
 * pre-built functions that Base44 executes on your behalf.
 *
 * Integration endpoints are accessed dynamically using the pattern:
 * `base44.integrations.PackageName.EndpointName(params)`
 *
 * This module is available to use with a client in all authentication modes:
 *
 * - **Anonymous or User authentication** (`base44.integrations`): Integration endpoints are invoked with the current user's permissions. Anonymous users invoke endpoints without authentication, while authenticated users invoke endpoints with their authentication context.
 * - **Service role authentication** (`base44.asServiceRole.integrations`): Integration endpoints are invoked with elevated admin-level permissions. The endpoints execute with admin authentication context.
 */
export type IntegrationsModule = {
  /**
   * Core package containing built-in Base44 integration functions.
   */
  Core: CoreIntegrations;
} & {
  /**
   * Access to additional integration packages.
   *
   * Additional integration packages may be added in the future and will be
   * accessible using the same pattern as Core.
   */
  [packageName: string]: IntegrationPackage;
};
