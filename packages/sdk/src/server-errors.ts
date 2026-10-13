import { getAnalyticsSessionId } from "./modules/analytics.js";

// Server error capture for full-stack Base44 apps (the TanStack Start template's middleware).
//
// The app's server code runs in its own Cloudflare Worker, where a failure barely reaches Base44:
// TanStack answers a throwing server function with a 200 and its message only, and a server route's
// error becomes a generic crash. So the Worker reports the error itself, in a response header that
// Base44's serving layer reads and strips before the visitor gets the response. Serving asks for the
// report with a request header; without it these helpers do nothing.
//
// The header must match the backend's reader (apper `read_function_error(..., version=2)`):
//   {"v":2,"kind":"uncaught","name":"TypeError","message":"…","fn":"…","frames":[{"file":"…","line":12,"col":5}]}
//
// None of this throws into the request: on any internal failure the helpers behave as if capture
// were off. They never touch `window`, and depend on nothing framework-specific.

const CAPTURE_HEADER = "X-B44-Capture-Errors";
const REPORT_HEADER = "X-B44-Function-Error";

const HEADER_MAX_BYTES = 3072;
const MESSAGE_MAX_BYTES = 500;
const NAME_MAX_CHARS = 64;
const MAX_FRAMES = 30;
const POSITION_MAX = 2 ** 31 - 1;
const FN_RE = /^[A-Za-z0-9_$.:/-]{1,200}$/;
const FILE_RE = /^[A-Za-z0-9_./@+$()[\]~-]{1,200}$/;

const BODY_MAX_BYTES = 2048;
const BODY_DEADLINE_MS = 50;
// The SSO examples answer `{ error: "Internal server error", details: error.message }`.
const GENERIC_ERROR = "Internal server error";
// What TanStack Start answers a page route asked for something other than HTML: no error behind it.
const NOT_HTML_REFUSAL = "Only HTML requests are supported here";

const ERROR_RESPONSE_BODY = "Internal Server Error";

type ReportKind = "uncaught" | "response";

interface CapturedError {
  name?: string;
  message: string;
  stack?: string;
}

interface RecordedError extends CapturedError {
  fn?: string;
}

interface Frame {
  file: string;
  line: number;
  col: number;
}

/**
 * Options for {@linkcode recordServerError | recordServerError()}.
 */
export interface RecordServerErrorOptions {
  /**
   * The server function that threw, such as TanStack's `functionId`. Omitted from the report unless
   * it matches `^[A-Za-z0-9_$.:/-]{1,200}$`.
   */
  fn?: string;
}

// The last error recorded for each request. TanStack's request middleware and `getRequest()` hand
// out the same `Request` object within one request.
const recordedErrors = new WeakMap<Request, RecordedError>();

/**
 * Records a server error for the request, for {@linkcode annotateServerResponse | annotateServerResponse()}
 * to report on the response.
 *
 * Keeps the error's name, message and raw stack. Does nothing unless the request carries
 * `X-B44-Capture-Errors: 1`, which only Base44's serving layer sends. A later call for the same
 * request replaces the earlier record. Never throws.
 *
 * @param request - The incoming request.
 * @param error - What the server code threw.
 * @param options - The server function's name.
 *
 * @example
 * ```typescript
 * // A TanStack Start function middleware
 * try {
 *   return await next();
 * } catch (error) {
 *   recordServerError(getRequest(), error, { fn: functionId });
 *   throw error;
 * }
 * ```
 */
export function recordServerError(
  request: Request,
  error: unknown,
  options?: RecordServerErrorOptions
): void {
  try {
    if (!isCaptureOn(request)) return;
    const fn = options?.fn;
    recordedErrors.set(request, {
      ...captureError(error),
      fn: typeof fn === "string" && FN_RE.test(fn) ? fn : undefined,
    });
  } catch {
    // Capture off.
  }
}

/**
 * Returns the response with Base44's server error report header set, when there is something to
 * report.
 *
 * - An error recorded for the request is reported as thrown, at any status when it names its server
 *   function (TanStack answers those with a 200), or else at a 500.
 * - Otherwise a status of 500 to 599 is reported as returned, with the message from the response's
 *   JSON body (the first non-empty string among `error`, `message`, `detail`, `details` and
 *   `error.message`), or else the last error recorded for the request. At most 2 KB of a clone of
 *   the body is read, within about 50 ms.
 *
 * The response is returned untouched when capture is off, when there is nothing to report, for a 101
 * or WebSocket response, and for a page route's 500 to a request that doesn't accept HTML. The header
 * is set on the response itself; when its headers are immutable, as on a `fetch()` response, the
 * response is re-created around the same body, which still streams. Never throws.
 *
 * @param request - The incoming request.
 * @param response - The response the app is about to send.
 * @returns The same response, or a copy of it with the header.
 */
export async function annotateServerResponse(
  request: Request,
  response: Response
): Promise<Response> {
  try {
    if (!isCaptureOn(request) || !isResponse(response)) return response;
    const status = response.status;
    if (status === 101 || (response as { webSocket?: unknown }).webSocket) {
      return response;
    }

    const recorded = recordedErrors.get(request);
    let report: string | undefined;
    if (recorded && (recorded.fn || status === 500)) {
      report = buildReport("uncaught", recorded, recorded.fn);
    } else if (status >= 500 && status <= 599) {
      const message = await readBodyMessage(response);
      if (message === undefined) {
        if (recorded) report = buildReport("response", recorded);
      } else if (
        !recorded &&
        status === 500 &&
        message === NOT_HTML_REFUSAL &&
        !acceptsHtml(request)
      ) {
        return response;
      } else {
        // Name and frames only come from an error whose message is the one reported.
        const source = recorded?.message === message ? recorded : undefined;
        report = buildReport("response", { ...source, message });
      }
    }
    return report ? withReportHeader(response, report) : response;
  } catch {
    return response;
  }
}

/**
 * Returns the 500 response for an error that escaped the framework, such as a TanStack Start server
 * route's, with Base44's server error report header when the request carries
 * `X-B44-Capture-Errors: 1`.
 *
 * The body is a plain-text `Internal Server Error` either way, so a visitor learns nothing about the
 * error. The error is also logged with `console.error()`, as it would have been had it escaped the
 * Worker. Never throws.
 *
 * @param request - The incoming request.
 * @param error - What escaped.
 * @returns A 500 response.
 */
export function serverErrorResponse(
  request: Request,
  error: unknown
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/plain;charset=UTF-8",
  };
  try {
    console.error(error);
  } catch {
    // Nothing to do.
  }
  try {
    if (isCaptureOn(request)) {
      const report = buildReport("uncaught", captureError(error));
      if (report) headers[REPORT_HEADER] = report;
    }
  } catch {
    // Capture off.
  }
  return new Response(ERROR_RESPONSE_BODY, { status: 500, headers });
}

/**
 * Returns the SDK's anonymous visitor id in a browser, or `null` elsewhere.
 *
 * It is the id the SDK already sends as `X-Base44-Anonymous-Id` on requests made without a
 * signed-in user, so a full-stack app's own server calls can carry it too.
 *
 * @returns The visitor id, or `null` outside a browser.
 */
export function getAnonymousVisitorId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return getAnalyticsSessionId();
  } catch {
    return null;
  }
}

function isCaptureOn(request: Request): boolean {
  try {
    return request.headers.get(CAPTURE_HEADER) === "1";
  } catch {
    return false;
  }
}

function isResponse(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Response).status === "number" &&
    typeof (value as Response).headers?.get === "function"
  );
}

function acceptsHtml(request: Request): boolean {
  const accept = request.headers.get("Accept") || "*/*";
  return accept
    .split(",")
    .some((part) => /^\s*(\*\/\*|text\/html)/i.test(part));
}

function captureError(error: unknown): CapturedError {
  if (typeof error !== "object" || error === null) {
    return { message: typeof error === "string" ? error : safeString(error) };
  }
  const { name, message, stack } = error as Partial<Error>;
  return {
    name: typeof name === "string" ? name : undefined,
    message: typeof message === "string" ? message : "",
    stack: typeof stack === "string" ? stack : undefined,
  };
}

function safeString(value: unknown): string {
  try {
    return value === undefined ? "" : String(value);
  } catch {
    return "";
  }
}

// --- The response body -------------------------------------------------------------------------

async function readBodyMessage(response: Response): Promise<string | undefined> {
  const type = response.headers.get("Content-Type") || "";
  if (!/^[^;]*[/+]json\s*(;|$)/i.test(type)) return undefined;
  if (!response.body || response.bodyUsed) return undefined;
  const text = await readPrefix(response.clone().body);
  if (text === undefined) return undefined;
  try {
    return pickMessage(JSON.parse(text));
  } catch {
    return undefined;
  }
}

// The whole body as text when it is at most BODY_MAX_BYTES and arrives before the deadline.
async function readPrefix(
  body: ReadableStream<Uint8Array> | null
): Promise<string | undefined> {
  if (!body) return undefined;
  const reader = body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), BODY_DEADLINE_MS);
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  try {
    while (size <= BODY_MAX_BYTES) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next === "timeout") break;
      if (next.done) {
        complete = true;
        break;
      }
      if (!(next.value instanceof Uint8Array)) break;
      chunks.push(next.value);
      size += next.value.byteLength;
    }
  } finally {
    clearTimeout(timer);
    if (!complete) reader.cancel().catch(() => {});
  }
  if (!complete || size > BODY_MAX_BYTES) return undefined;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function pickMessage(data: unknown): string | undefined {
  if (!isPlainObject(data)) return undefined;
  const skipError = data.details !== undefined && data.error === GENERIC_ERROR;
  const candidates = [
    skipError ? undefined : data.error,
    data.message,
    data.detail,
    data.details,
    isPlainObject(data.error) ? data.error.message : undefined,
  ];
  return candidates.find(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- The header --------------------------------------------------------------------------------

function buildReport(
  kind: ReportKind,
  error: CapturedError,
  fn?: string
): string | undefined {
  const name = error.name ? toWellFormed(error.name) : "";
  const frames = error.stack ? parseStack(error.stack) : [];
  // `undefined` fields are left out of the JSON.
  const payload = {
    v: 2,
    kind,
    name: name && Array.from(name).length <= NAME_MAX_CHARS ? name : undefined,
    message: truncateUtf8(toWellFormed(error.message), MESSAGE_MAX_BYTES),
    fn: fn && FN_RE.test(fn) ? fn : undefined,
    frames: frames.length ? frames : undefined,
  };
  // Frames go from the end until it fits.
  let value = toAsciiJson(payload);
  while (value.length > HEADER_MAX_BYTES && frames.length) {
    frames.pop();
    if (!frames.length) payload.frames = undefined;
    value = toAsciiJson(payload);
  }
  if (value.length <= HEADER_MAX_BYTES) return value;
  // Still too long: escaping can grow a 500-byte message sixfold (`\u0001` per control character),
  // so cut it further, to the most code points that fit.
  const chars = Array.from(payload.message);
  let fits = 0;
  let tooMany = chars.length;
  while (tooMany - fits > 1) {
    const mid = (fits + tooMany) >> 1;
    payload.message = chars.slice(0, mid).join("");
    if (toAsciiJson(payload).length <= HEADER_MAX_BYTES) fits = mid;
    else tooMany = mid;
  }
  payload.message = chars.slice(0, fits).join("");
  value = toAsciiJson(payload);
  return value.length <= HEADER_MAX_BYTES ? value : undefined;
}

// In place when the headers can change; `fetch()` and `Response.redirect()` responses' can't, so
// those are re-created around the same body, which keeps streaming.
function withReportHeader(response: Response, report: string): Response {
  try {
    response.headers.set(REPORT_HEADER, report);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(REPORT_HEADER, report);
    return copy;
  }
}

// workerd rejects header bytes above 0xff, so everything past ASCII is escaped as `\uXXXX`.
function toAsciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

function toWellFormed(text: string): string {
  const native = (text as { toWellFormed?: () => string }).toWellFormed;
  if (typeof native === "function") return native.call(text);
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�"
  );
}

// Cuts well-formed text to at most `maxBytes` of UTF-8, on a code point boundary.
function truncateUtf8(text: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (bytes + size > maxBytes) return text.slice(0, end);
    bytes += size;
    end += char.length;
  }
  return text;
}

// --- Stack frames ------------------------------------------------------------------------------

// Raw V8 frames, in stack order: `at fn (file:L:C)`, `at file:L:C` and `at async fn (file:L:C)`.
// Eval frames, and frames without a position or with a file Base44 can't look a map up for, are
// dropped.
function parseStack(stack: string): Frame[] {
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    if (frames.length >= MAX_FRAMES) break;
    const frame = parseFrame(line);
    if (frame) frames.push(frame);
  }
  return frames;
}

function parseFrame(line: string): Frame | undefined {
  const match = /^\s*at\s+(?:async\s+)?(.+?)\s*$/.exec(line);
  if (!match) return undefined;
  const body = match[1];
  if (/^eval\b|\beval at\b/.test(body)) return undefined;
  const location =
    body.endsWith(")") && body.includes(" (")
      ? body.slice(body.lastIndexOf(" (") + 2, -1)
      : body;
  const position = /^(.+):(\d+):(\d+)$/.exec(location);
  if (!position) return undefined;
  const file = normalizeFile(position[1]);
  const lineNumber = Number(position[2]);
  const col = Number(position[3]);
  if (
    !file ||
    !isPosition(lineNumber) ||
    !isPosition(col)
  ) {
    return undefined;
  }
  return { file, line: lineNumber, col };
}

// The Worker module's path as uploaded, such as `assets/worker-entry-BX3a.js`.
function normalizeFile(raw: string): string | undefined {
  const file = raw.replace(/^file:\/\//i, "").replace(/^\/+/, "");
  if (!FILE_RE.test(file) || file.split("/").includes("..")) return undefined;
  return file;
}

function isPosition(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= POSITION_MAX;
}
