/**
 * A Server-Sent Events reader over `fetch`.
 *
 * The SDK's first streaming transport, and deliberately not `EventSource`.
 * `EventSource` cannot set request headers, which is why the build API also
 * accepts a single-use ticket in the query string — a workaround for a browser
 * limitation, not a shape to build on. Reading the stream with `fetch` lets the
 * credential stay in an `Authorization` header, where it does not land in
 * referrers, proxy logs or browser history, and the ticket exchange never has to
 * happen. `fetch` with a streaming body works in browsers, Node 18+, Deno and
 * Bun; `EventSource` is browser-only.
 *
 * @internal
 */

/** One dispatched SSE event. */
export interface SseFrame {
  /** The `id:` field — the resume cursor a client echoes back as `Last-Event-ID`. */
  id?: string;
  /** The `event:` field, naming the event type. */
  event?: string;
  /** The `data:` field. Multiple `data:` lines are joined with newlines, per spec. */
  data: string;
}

// A blank line ends an event. Any of the three terminators the spec allows may
// arrive, and a CRLF can be split across two network chunks — matching on the
// accumulated buffer rather than per chunk is what makes that harmless.
const FRAME_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;
const LINE_BREAK = /\r\n|\n|\r/;

function parseFrame(block: string): SseFrame | null {
  const data: string[] = [];
  let id: string | undefined;
  let event: string | undefined;

  for (const line of block.split(LINE_BREAK)) {
    // A line starting with a colon is a comment. That is what a keepalive is,
    // so this is the branch that keeps an idle build from looking like an event.
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    else if (field === "id") id = value;
  }

  // No payload, nothing to dispatch. The build stream always sends `data:`, so
  // this only drops frames that carry a bare `id:` or an unknown field.
  return data.length ? { id, event, data: data.join("\n") } : null;
}

/**
 * Yields SSE frames from a fetch response body until the stream ends.
 *
 * @param stream - The response body.
 * @returns Each dispatched event, in order.
 * @internal
 */
export async function* readSseFrames(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SseFrame, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const match = FRAME_BOUNDARY.exec(buffer);
        if (!match) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const frame = parseFrame(block);
        if (frame) yield frame;
      }
    }
  } finally {
    // Abandoning the iterator mid-stream (a `break` in the consumer, or an
    // unsubscribe) has to release the underlying connection, or a long-lived
    // process leaks one socket per build it stopped watching.
    await reader.cancel().catch(() => {});
  }
}
