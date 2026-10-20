/**
 * JSON representation of a Base44Error.
 *
 * This is the structure returned by {@linkcode Base44Error.toJSON | Base44Error.toJSON()}.
 * Useful for logging or sending error information to external services.
 */
export interface Base44ErrorJSON {
  /**
   * The error name, always "Base44Error".
   */
  name: string;

  /**
   * Human-readable error message.
   */
  message: string;

  /**
   * HTTP status code of the error.
   */
  status: number;

  /**
   * Error code from the API.
   */
  code: string;

  /**
   * Full response data from the server containing error details.
   */
  data: any;
}
