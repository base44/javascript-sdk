// A port of apper's `read_function_error(response, version=2)`
// (backend/app/cloudflare_functions/function_error.py), so the SDK's tests can check every header
// the helpers write against the backend's rules. tests/fixtures/function-error-header-v2.json pins
// the port to the real reader: check-function-error-contract.py runs the same cases through it.
// The backend also redacts the message and name; this port leaves them as they are.

const MAX_HEADER_BYTES = 3072;
const NAME_MAX_CHARS = 64;
const MAX_RAW_FRAMES = 30;
const MESSAGE_BYTES = 500;
const POSITION_MAX = 2 ** 31 - 1;
const FN_RE = /^[A-Za-z0-9_$.:/-]{1,200}$/;
const FILE_RE = /^[A-Za-z0-9_./@+$()[\]~-]{1,200}$/;

export interface ReadFrame {
  file: string;
  line: number;
  col: number;
}

export interface ReadFunctionError {
  kind: string;
  message: string;
  name: string | null;
  fn: string | null;
  frames: ReadFrame[];
}

function inStatusRange(kind: string, status: number): boolean {
  switch (kind) {
    case "uncaught":
    case "load":
      return status === 500;
    case "no_handler":
      return status === 503;
    case "response":
      return status >= 500 && status < 600;
    default:
      return false;
  }
}

const isInt = (value: unknown): value is number => Number.isInteger(value);

function text(value: unknown): string {
  return typeof value === "string" ? value.toWellFormed() : "";
}

function truncateBytes(value: string, limit: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= limit) return value;
  // Back off to the start of the character the cut splits, and drop it.
  let end = limit;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.slice(0, end));
}

function frame(raw: unknown): ReadFrame | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { file, line, col } = raw as Record<string, unknown>;
  if (
    typeof file !== "string" ||
    !FILE_RE.test(file) ||
    file.startsWith("/") ||
    file.split("/").includes("..")
  ) {
    return null;
  }
  if (![line, col].every((n) => isInt(n) && n >= 1 && n <= POSITION_MAX)) return null;
  return { file, line: line as number, col: col as number };
}

/** The report the backend would keep, or `null` when it would ignore the header. */
export function readFunctionError(
  header: string | null,
  status: number
): ReadFunctionError | null {
  if (!header || header.length > MAX_HEADER_BYTES) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(header);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  // Python's `isinstance(v, int)` excludes bools; JSON numbers like 2.0 parse to int 2 in JS but to a
  // float in Python, which the helpers never write.
  if (!isInt(p.v) || p.v !== 2) return null;
  const kind = p.kind;
  if (typeof kind !== "string" || !["uncaught", "load", "no_handler", "response"].includes(kind)) {
    return null;
  }
  const fn = typeof p.fn === "string" && FN_RE.test(p.fn) ? p.fn : null;
  if (!inStatusRange(kind, status) && !(kind === "uncaught" && fn)) return null;
  const name = text(p.name) || null;
  const frames = Array.isArray(p.frames) ? p.frames.slice(0, MAX_RAW_FRAMES) : [];
  return {
    kind,
    message: truncateBytes(text(p.message), MESSAGE_BYTES),
    name: name && Array.from(name).length <= NAME_MAX_CHARS ? name : null,
    fn,
    frames: frames.map(frame).filter((f): f is ReadFrame => f !== null),
  };
}
