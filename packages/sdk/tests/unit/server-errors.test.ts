import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  annotateServerResponse,
  getAnonymousVisitorId,
  recordServerError,
  serverErrorResponse,
} from "../../src/index.ts";
import { getAnalyticsSessionId } from "../../src/modules/analytics.ts";
import { readFunctionError } from "../utils/function-error-reader.ts";

const REPORT = "X-B44-Function-Error";

function request(capture = true, headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/x", {
    headers: capture ? { "X-B44-Capture-Errors": "1", ...headers } : headers,
  });
}

function json(body: unknown, status = 500, init: ResponseInit = {}) {
  return Response.json(body, { status, ...init });
}

function errorWithStack(message: string, stack: string, name = "Error") {
  const error = new Error(message);
  error.name = name;
  error.stack = stack;
  return error;
}

// The header as the backend reads it, at the response's status. Fails the test when the backend
// would reject a header the helpers wrote.
function readReport(response: Response) {
  const header = response.headers.get(REPORT);
  if (header === null) return null;
  expect(header).toMatch(/^[\x20-\x7e]+$/);
  expect(header.length).toBeLessThanOrEqual(3072);
  const read = readFunctionError(header, response.status);
  expect(read, `the backend accepts ${header}`).not.toBeNull();
  return { raw: JSON.parse(header), read: read! };
}

const STACK = [
  "TypeError: Cannot read properties of undefined (reading 'amount')",
  "    at loadInvoice (assets/server-fns-CfWtdkur.js:14:17)",
  "    at assets/server-fns-CfWtdkur.js:22:9",
  "    at async Object.handler (assets/createServerFn-BhXNZl1x.js:320:44)",
  "    at async index.js:14242:14",
].join("\n");

const FRAMES = [
  { file: "assets/server-fns-CfWtdkur.js", line: 14, col: 17 },
  { file: "assets/server-fns-CfWtdkur.js", line: 22, col: 9 },
  { file: "assets/createServerFn-BhXNZl1x.js", line: 320, col: 44 },
  { file: "index.js", line: 14242, col: 14 },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("activation", () => {
  test("with X-B44-Capture-Errors: 1, a recorded error is reported", async () => {
    const req = request();
    recordServerError(req, errorWithStack("boom", STACK, "TypeError"), { fn: "sendInvoice" });
    const response = await annotateServerResponse(req, new Response("ok"));
    expect(readReport(response)?.raw).toEqual({
      v: 2,
      kind: "uncaught",
      name: "TypeError",
      message: "boom",
      fn: "sendInvoice",
      frames: FRAMES,
    });
  });

  test.each([
    ["no header", {}],
    ["0", { "X-B44-Capture-Errors": "0" }],
    ["true", { "X-B44-Capture-Errors": "true" }],
    ["01", { "X-B44-Capture-Errors": "01" }],
  ])("without it (%s), nothing is recorded or reported", async (_, headers) => {
    const req = new Request("https://app.test/", { headers });
    recordServerError(req, new Error("boom"), { fn: "f" });
    const response = new Response("ok");
    expect(await annotateServerResponse(req, response)).toBe(response);
    expect(response.headers.get(REPORT)).toBeNull();

    const failed = json({ error: "boom" });
    expect(await annotateServerResponse(req, failed)).toBe(failed);
    expect(failed.headers.get(REPORT)).toBeNull();
    expect(failed.bodyUsed).toBe(false);

    expect(serverErrorResponse(req, new Error("boom")).headers.get(REPORT)).toBeNull();
  });

  test("an error recorded while capture was off isn't reported once it's on", async () => {
    const headers = new Headers();
    const req = new Request("https://app.test/", { headers });
    recordServerError(req, new Error("boom"), { fn: "f" });
    // Request headers are copied at construction, so a later request can't see this one's record.
    const response = await annotateServerResponse(request(), new Response("ok"));
    expect(response.headers.get(REPORT)).toBeNull();
  });

  test("leaves the response alone when nothing applies", async () => {
    const req = request();
    for (const response of [
      new Response("ok"),
      json({ error: "not found" }, 404),
      json({ error: "bad" }, 499),
      new Response(null, { status: 204 }),
    ]) {
      expect(await annotateServerResponse(req, response)).toBe(response);
      expect(response.headers.get(REPORT)).toBeNull();
    }
  });
});

describe("records are per request", () => {
  test("one request's error isn't reported on another", async () => {
    const a = request();
    const b = request();
    recordServerError(a, new Error("from a"), { fn: "a" });
    expect((await annotateServerResponse(b, new Response("ok"))).headers.get(REPORT)).toBeNull();
    expect(readReport(await annotateServerResponse(a, new Response("ok")))?.raw.message).toBe(
      "from a"
    );
  });

  test("two requests keep their own records", async () => {
    const a = request();
    const b = request();
    recordServerError(a, new Error("from a"), { fn: "a" });
    recordServerError(b, new Error("from b"), { fn: "b" });
    expect(readReport(await annotateServerResponse(b, new Response("ok")))?.raw).toMatchObject({
      message: "from b",
      fn: "b",
    });
    expect(readReport(await annotateServerResponse(a, new Response("ok")))?.raw).toMatchObject({
      message: "from a",
      fn: "a",
    });
  });

  test("the last error recorded for a request wins", async () => {
    const req = request();
    recordServerError(req, new Error("first"), { fn: "f" });
    recordServerError(req, new Error("second"), { fn: "g" });
    expect(readReport(await annotateServerResponse(req, new Response("ok")))?.raw).toMatchObject({
      message: "second",
      fn: "g",
    });
  });
});

describe("a recorded error", () => {
  test("is reported as thrown at any status when it names its function", async () => {
    for (const status of [200, 302, 404, 500, 503]) {
      const req = request();
      recordServerError(req, new Error("boom"), { fn: "f" });
      const response = await annotateServerResponse(req, new Response(null, { status }));
      expect(readReport(response)?.read).toMatchObject({ kind: "uncaught", fn: "f" });
    }
  });

  test("without a function is reported as thrown at a 500", async () => {
    const req = request();
    recordServerError(req, new Error("boom"));
    const response = await annotateServerResponse(req, new Response(null, { status: 500 }));
    expect(readReport(response)?.raw).toMatchObject({ kind: "uncaught", message: "boom" });
    expect(readReport(response)?.raw.fn).toBeUndefined();
  });

  test("without a function, at a 200, isn't reported (the backend would drop it)", async () => {
    const req = request();
    recordServerError(req, new Error("boom"));
    const response = await annotateServerResponse(req, new Response("ok"));
    expect(response.headers.get(REPORT)).toBeNull();
  });

  test("without a function, at another 5xx, is reported as returned", async () => {
    const req = request();
    recordServerError(req, errorWithStack("boom", STACK, "TypeError"));
    const response = await annotateServerResponse(req, new Response("down", { status: 503 }));
    expect(readReport(response)?.raw).toEqual({
      v: 2,
      kind: "response",
      name: "TypeError",
      message: "boom",
      frames: FRAMES,
    });
  });

  test("of a thrown non-Error value keeps what it can", async () => {
    for (const [value, message] of [
      ["just a string", "just a string"],
      [42, "42"],
      [null, "null"],
      [undefined, ""],
      [{ message: "an object" }, "an object"],
      [{ nothing: true }, ""],
    ] as const) {
      const req = request();
      recordServerError(req, value, { fn: "f" });
      const report = readReport(await annotateServerResponse(req, new Response("ok")));
      expect(report?.raw).toEqual({ v: 2, kind: "uncaught", message, fn: "f" });
    }
  });

  test("keeps the stack as it was when recorded", async () => {
    const req = request();
    const error = errorWithStack("boom", STACK);
    recordServerError(req, error, { fn: "f" });
    error.message = "changed";
    error.stack = "changed";
    const report = readReport(await annotateServerResponse(req, new Response("ok")));
    expect(report?.raw).toMatchObject({ message: "boom", frames: FRAMES });
  });
});

describe("body rules", () => {
  async function messageOf(body: unknown, status = 500, init: ResponseInit = {}) {
    const response = await annotateServerResponse(request(), json(body, status, init));
    const report = readReport(response);
    if (report) expect(report.raw.kind).toBe("response");
    return report?.raw.message;
  }

  test.each([
    ["error", { error: "e" }, "e"],
    ["message", { message: "m" }, "m"],
    ["detail", { detail: "d" }, "d"],
    ["details", { details: "ds" }, "ds"],
    ["error.message", { error: { message: "em" } }, "em"],
    ["error before message", { message: "m", error: "e" }, "e"],
    ["message before detail", { detail: "d", message: "m" }, "m"],
    ["detail before details", { details: "ds", detail: "d" }, "d"],
    ["details before error.message", { error: { message: "em" }, details: "ds" }, "ds"],
    ["skips an empty string", { error: "", message: "m" }, "m"],
    ["skips a blank string", { error: "  ", message: "m" }, "m"],
    ["skips a non-string", { error: 1, message: ["x"], detail: null, details: "ds" }, "ds"],
    ["keeps a generic error without details", { error: "Internal server error" }, "Internal server error"],
    ["generic error is skipped only when exactly it", { error: "Internal Server Error", details: "ds" }, "Internal Server Error"],
    ["error.message when error is an object, with details absent", { error: { message: "em", code: 1 } }, "em"],
  ])("%s", async (_, body, expected) => {
    expect(await messageOf(body)).toBe(expected);
  });

  test("the SSO examples' shape: the generic error gives way to details", async () => {
    expect(await messageOf({ error: "Internal server error", details: "Calendar token expired" })).toBe(
      "Calendar token expired"
    );
  });

  test("the SSO examples' shape, details first", async () => {
    expect(await messageOf({ details: "Calendar token expired", error: "Internal server error" })).toBe(
      "Calendar token expired"
    );
  });

  test("the SSO shape with empty details falls through to nothing", async () => {
    expect(await messageOf({ error: "Internal server error", details: "" })).toBeUndefined();
  });

  test.each([500, 502, 503, 599])("any status from 500 to 599 (%i)", async (status) => {
    expect(await messageOf({ error: "e" }, status)).toBe("e");
  });

  test("a JSON media type with parameters or a +json suffix", async () => {
    for (const type of ["application/json; charset=utf-8", "application/problem+json", "APPLICATION/JSON"]) {
      const response = new Response(JSON.stringify({ detail: "d" }), {
        status: 500,
        headers: { "Content-Type": type },
      });
      expect(readReport(await annotateServerResponse(request(), response))?.raw.message).toBe("d");
    }
  });

  test.each([
    ["a text body", new Response("boom", { status: 500 })],
    ["an HTML body", new Response("<h1>boom</h1>", { status: 500, headers: { "Content-Type": "text/html" } })],
    ["JSON-looking text", new Response('{"error":"boom"}', { status: 500, headers: { "Content-Type": "text/plain" } })],
    ["application/jsonl", new Response('{"error":"boom"}', { status: 500, headers: { "Content-Type": "application/jsonl" } })],
    ["no body", new Response(null, { status: 500 })],
    ["invalid JSON", new Response("{", { status: 500, headers: { "Content-Type": "application/json" } })],
    ["a JSON array", json(["boom"])],
    ["a JSON string", json("boom")],
    ["no message field", json({ ok: false })],
  ])("%s gets no header", async (_, response) => {
    expect(await annotateServerResponse(request(), response)).toBe(response);
    expect(response.headers.get(REPORT)).toBeNull();
  });

  test("the body is still the app's after it was read", async () => {
    const response = await annotateServerResponse(request(), json({ error: "boom", extra: 1 }));
    expect(await response.json()).toEqual({ error: "boom", extra: 1 });
  });

  test("a body over 2 KB isn't parsed", async () => {
    const small = await annotateServerResponse(request(), json({ error: "e", pad: "x".repeat(2000) }));
    expect(readReport(small)?.raw.message).toBe("e");
    const big = await annotateServerResponse(request(), json({ error: "e", pad: "x".repeat(2100) }));
    expect(big.headers.get(REPORT)).toBeNull();
    expect((await big.json()).pad).toHaveLength(2100);
  });

  test("a streamed body that misses the deadline gets no header, and keeps streaming", async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(encoder.encode('{"error":'));
      },
    });
    const response = new Response(body, {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    const started = Date.now();
    const annotated = await annotateServerResponse(request(), response);
    const elapsed = Date.now() - started;
    expect(annotated).toBe(response);
    expect(response.headers.get(REPORT)).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(1000);

    controller.enqueue(encoder.encode('"late"}'));
    controller.close();
    expect(await annotated.json()).toEqual({ error: "late" });
  });

  test("a streamed body that arrives in chunks before the deadline is read", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(encoder.encode('{"err'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        c.enqueue(encoder.encode('or":"chunked"}'));
        c.close();
      },
    });
    const response = new Response(body, { status: 500, headers: { "Content-Type": "application/json" } });
    expect(readReport(await annotateServerResponse(request(), response))?.raw.message).toBe("chunked");
  });

  test("a body already read is left alone", async () => {
    const response = json({ error: "boom" });
    await response.text();
    expect(await annotateServerResponse(request(), response)).toBe(response);
    expect(response.headers.get(REPORT)).toBeNull();
  });

  test("with no message in the body, the last recorded error is used", async () => {
    const req = request();
    recordServerError(req, errorWithStack("logged", STACK, "RangeError"));
    const response = await annotateServerResponse(req, new Response("boom", { status: 502 }));
    expect(readReport(response)?.raw).toEqual({
      v: 2,
      kind: "response",
      name: "RangeError",
      message: "logged",
      frames: FRAMES,
    });
  });

  test("frames come only from a recorded error whose message is the body's", async () => {
    const matching = request();
    recordServerError(matching, errorWithStack("db down", STACK, "DbError"));
    const withFrames = await annotateServerResponse(matching, json({ error: "db down" }, 503));
    expect(readReport(withFrames)?.raw).toEqual({
      v: 2,
      kind: "response",
      name: "DbError",
      message: "db down",
      frames: FRAMES,
    });

    const other = request();
    recordServerError(other, errorWithStack("something else", STACK, "DbError"));
    const without = await annotateServerResponse(other, json({ error: "db down" }, 503));
    expect(readReport(without)?.raw).toEqual({ v: 2, kind: "response", message: "db down" });
  });
});

describe("responses left untouched", () => {
  function withStatus(status: number, extra: Record<string, unknown> = {}) {
    const response = new Response(null, { status: 500 });
    Object.defineProperty(response, "status", { value: status });
    Object.assign(response, extra);
    return response;
  }

  test("a 101", async () => {
    const req = request();
    recordServerError(req, new Error("boom"), { fn: "f" });
    const response = withStatus(101);
    expect(await annotateServerResponse(req, response)).toBe(response);
    expect(response.headers.get(REPORT)).toBeNull();
  });

  test("a WebSocket response", async () => {
    const req = request();
    recordServerError(req, new Error("boom"), { fn: "f" });
    const response = withStatus(200, { webSocket: {} });
    expect(await annotateServerResponse(req, response)).toBe(response);
    expect(response.headers.get(REPORT)).toBeNull();
  });

  test("a page route's 500 to a request that doesn't accept HTML", async () => {
    // What TanStack Start answers a page route asked for JSON.
    const refusal = () => json({ error: "Only HTML requests are supported here" });
    for (const accept of ["application/json", "application/json, text/plain"]) {
      const response = refusal();
      expect(await annotateServerResponse(request(true, { Accept: accept }), response)).toBe(response);
      expect(response.headers.get(REPORT)).toBeNull();
    }
  });

  test("but not a server route's own 500 to a JSON request", async () => {
    const response = await annotateServerResponse(
      request(true, { Accept: "application/json" }),
      json({ error: "db down" })
    );
    expect(readReport(response)?.raw.message).toBe("db down");
  });

  test("but not that message when the request accepts HTML", async () => {
    for (const accept of ["text/html", "*/*", undefined]) {
      const response = await annotateServerResponse(
        request(true, accept ? { Accept: accept } : {}),
        json({ error: "Only HTML requests are supported here" })
      );
      expect(readReport(response)?.raw.message).toBe("Only HTML requests are supported here");
    }
  });
});

describe("setting the header", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/slow") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.write('{"error":');
        setTimeout(() => res.end('"slow"}'), 200);
        return;
      }
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error", details: "upstream failed" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("on mutable headers, in place", async () => {
    const response = json({ error: "boom" });
    const annotated = await annotateServerResponse(request(), response);
    expect(annotated).toBe(response);
    expect(readReport(annotated)?.raw.message).toBe("boom");
  });

  test("on a fetch() response, a copy with the same status, headers and body", async () => {
    const response = await fetch(`${origin}/`);
    expect(() => response.headers.set("x", "y")).toThrow();
    const annotated = await annotateServerResponse(request(), response);
    expect(annotated).not.toBe(response);
    expect(annotated.status).toBe(502);
    expect(annotated.headers.get("Content-Type")).toBe("application/json");
    expect(readReport(annotated)?.raw).toEqual({ v: 2, kind: "response", message: "upstream failed" });
    expect(await annotated.json()).toEqual({ error: "Internal server error", details: "upstream failed" });
  });

  test("on a fetch() response whose body misses the deadline, the body still streams", async () => {
    const req = request();
    recordServerError(req, new Error("logged"));
    const response = await fetch(`${origin}/slow`);
    const annotated = await annotateServerResponse(req, response);
    expect(annotated).not.toBe(response);
    expect(readReport(annotated)?.raw).toMatchObject({ kind: "uncaught", message: "logged" });
    expect(await annotated.json()).toEqual({ error: "slow" });
  });

  test("on a Response.redirect(), a copy", async () => {
    const req = request();
    recordServerError(req, new Error("boom"), { fn: "f" });
    const response = Response.redirect("https://app.test/login", 302);
    const annotated = await annotateServerResponse(req, response);
    expect(annotated).not.toBe(response);
    expect(annotated.status).toBe(302);
    expect(annotated.headers.get("Location")).toBe("https://app.test/login");
    expect(readReport(annotated)?.raw).toMatchObject({ kind: "uncaught", fn: "f" });
  });
});

describe("the message", () => {
  async function reportOf(error: unknown) {
    const req = request();
    recordServerError(req, error, { fn: "f" });
    return readReport(await annotateServerResponse(req, new Response("ok")))!;
  }

  test("non-ASCII is escaped, and reads back the same", async () => {
    const message = "Ünïcödé — 日本語 😀 \u007f";
    const report = await reportOf(new Error(message));
    expect(report.raw.message).toBe(message);
    expect(report.read.message).toBe(message);
  });

  test("a lone surrogate becomes U+FFFD", async () => {
    for (const [message, expected] of [
      ["a\uD800b", "a�b"],
      ["a\uDC00b", "a�b"],
      ["end\uD83D", "end�"],
      ["ok 😀", "ok 😀"],
    ]) {
      expect((await reportOf(new Error(message))).raw.message).toBe(expected);
    }
  });

  test("the U+FFFD fallback works without String.prototype.toWellFormed", async () => {
    const req = request();
    const ok = new Response("ok");
    const native = String.prototype.toWellFormed;
    let annotated: Response;
    // @ts-expect-error removing it to exercise the fallback
    delete String.prototype.toWellFormed;
    try {
      recordServerError(req, new Error("a\uD800b\uDC00c\uD83D\uDE00"), { fn: "f" });
      annotated = await annotateServerResponse(req, ok);
    } finally {
      String.prototype.toWellFormed = native;
    }
    expect(readReport(annotated)?.raw.message).toBe("a\uFFFDb\uFFFDc\uD83D\uDE00");
  });

  test("is cut to 500 UTF-8 bytes on a code point", async () => {
    const bytes = (text: string) => new TextEncoder().encode(text).length;
    for (const [unit, count, kept] of [
      ["a", 600, 500],
      ["é", 300, 250],
      ["日", 200, 166],
      ["😀", 200, 125],
    ] as const) {
      const message = (await reportOf(new Error(unit.repeat(count)))).raw.message as string;
      expect(message).toBe(unit.repeat(kept));
      expect(bytes(message)).toBeLessThanOrEqual(500);
    }
    const mixed = (await reportOf(new Error("a".repeat(498) + "😀"))).raw.message;
    expect(mixed).toBe("a".repeat(498));
  });

  test("a message of exactly 500 bytes is kept whole", async () => {
    expect((await reportOf(new Error("a".repeat(500)))).raw.message).toBe("a".repeat(500));
  });

  test("a name of up to 64 characters is kept, a longer one dropped", async () => {
    const error = new Error("boom");
    error.name = "N".repeat(64);
    expect((await reportOf(error)).raw.name).toBe("N".repeat(64));
    error.name = "N".repeat(65);
    expect((await reportOf(error)).raw.name).toBeUndefined();
    error.name = "😀".repeat(64);
    expect((await reportOf(error)).raw.name).toBe("😀".repeat(64));
  });
});

describe("frames", () => {
  async function framesOf(stack: string) {
    const req = request();
    recordServerError(req, errorWithStack("boom", stack), { fn: "f" });
    const report = readReport(await annotateServerResponse(req, new Response("ok")))!;
    // The backend keeps every frame the helpers write.
    expect(report.read.frames).toEqual(report.raw.frames ?? []);
    return report.raw.frames ?? [];
  }

  test("named, anonymous and async frames, in stack order", async () => {
    expect(await framesOf(STACK)).toEqual(FRAMES);
  });

  test.each([
    ["a method", "    at Object.fetch (index.js:1:2)", { file: "index.js", line: 1, col: 2 }],
    ["a constructor", "    at new Invoice (assets/a.js:3:4)", { file: "assets/a.js", line: 3, col: 4 }],
    ["an alias", "    at Foo.bar [as baz] (assets/a.js:5:6)", { file: "assets/a.js", line: 5, col: 6 }],
    ["<anonymous> name", "    at Object.<anonymous> (assets/a.js:7:8)", { file: "assets/a.js", line: 7, col: 8 }],
    ["async anonymous", "    at async assets/a.js:9:10", { file: "assets/a.js", line: 9, col: 10 }],
    ["Promise.all index", "    at async Promise.all (index 0)", null],
    ["a file:// URL", "    at f (file:///assets/worker-entry-BX3a.js:12:5)", { file: "assets/worker-entry-BX3a.js", line: 12, col: 5 }],
    ["a leading slash", "    at f (/index.js:1:1)", { file: "index.js", line: 1, col: 1 }],
    ["a name with parentheses", "    at f (inner) (index.js:1:1)", { file: "index.js", line: 1, col: 1 }],
    ["route-group characters", "    at f (assets/(group)/[id]-a~b@c+d$e.js:1:1)", { file: "assets/(group)/[id]-a~b@c+d$e.js", line: 1, col: 1 }],
    ["an eval frame", "    at eval (eval at run (index.js:1:2), <anonymous>:3:4)", null],
    ["an eval'd function", "    at f (eval at run (index.js:1:2), <anonymous>:3:4)", null],
    ["native", "    at Array.map (native)", null],
    ["<anonymous> location", "    at f (<anonymous>)", null],
    ["node: internals", "    at f (node:internal/process:1:2)", null],
    ["an http URL", "    at f (https://app.test/a.js:1:2)", null],
    ["a .. segment", "    at f (assets/../secrets.js:1:2)", null],
    ["a space in the path", "    at f (my file.js:1:2)", null],
    ["line 0", "    at f (index.js:0:2)", null],
    ["column 0", "    at f (index.js:1:0)", null],
    ["a position past 2^31-1", "    at f (index.js:2147483648:1)", null],
    ["no column", "    at f (index.js:1)", null],
    ["not a frame", "TypeError: at index.js:1:2", null],
  ])("%s", async (_, line, expected) => {
    expect(await framesOf(`Error: boom\n${line}`)).toEqual(expected ? [expected] : []);
  });

  test("a file of 200 characters is kept, 201 dropped", async () => {
    const file200 = "a".repeat(197) + ".js";
    const file201 = "a".repeat(198) + ".js";
    expect(await framesOf(`Error\n    at f (${file200}:1:1)\n    at g (${file201}:1:1)`)).toEqual([
      { file: file200, line: 1, col: 1 },
    ]);
  });

  test("at most 30", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `    at f${i} (index.js:${i + 1}:1)`);
    const frames = await framesOf(`Error: boom\n${lines.join("\n")}`);
    expect(frames).toHaveLength(30);
    expect(frames[29]).toEqual({ file: "index.js", line: 30, col: 1 });
  });

  test("an error without a stack has no frames", async () => {
    expect(await framesOf(undefined as unknown as string)).toEqual([]);
  });
});

describe("size", () => {
  test("frames are dropped from the end until the header fits in 3072 bytes", async () => {
    const file = "assets/" + "f".repeat(180) + ".js";
    const lines = Array.from({ length: 30 }, (_, i) => `    at f (${file}:${i + 1}:1)`);
    const req = request();
    recordServerError(req, errorWithStack("x".repeat(500), `Error\n${lines.join("\n")}`), { fn: "f".repeat(200) });
    const response = await annotateServerResponse(req, new Response("ok"));
    const header = response.headers.get(REPORT)!;
    expect(header.length).toBeLessThanOrEqual(3072);
    const report = readReport(response)!;
    expect(report.raw.message).toBe("x".repeat(500));
    expect(report.raw.fn).toBe("f".repeat(200));
    expect(report.raw.frames.length).toBeGreaterThan(0);
    expect(report.raw.frames.length).toBeLessThan(30);
    expect(report.raw.frames.map((f: { line: number }) => f.line)).toEqual(
      Array.from({ length: report.raw.frames.length }, (_, i) => i + 1)
    );
    // One more frame would not have fitted.
    const withOneMore = JSON.stringify({
      ...report.raw,
      frames: [...report.raw.frames, { file, line: 99, col: 1 }],
    });
    expect(withOneMore.length).toBeGreaterThan(3072);
  });

  test("the longest message, name and fn, without control characters, fit whole", async () => {
    const file = "a".repeat(196) + ".js";
    const lines = Array.from({ length: 30 }, (_, i) => `    at f (${file}:${i + 1}:1)`);
    const req = request();
    // 500 bytes of 4-byte characters escape to 1500 bytes, and a 64-character name to 768.
    const error = errorWithStack("😀".repeat(200), `Error\n${lines.join("\n")}`);
    error.name = "😀".repeat(64);
    recordServerError(req, error, { fn: "f".repeat(200) });
    const report = readReport(await annotateServerResponse(req, new Response("ok")))!;
    expect(report.raw.message).toBe("😀".repeat(125));
    expect(report.raw.name).toBe("😀".repeat(64));
    expect(report.raw.fn).toBe("f".repeat(200));
    expect(report.raw.frames.length).toBeLessThan(30);
  });
  test("a message that escapes past the budget is cut further, not dropped", async () => {
    // 500 control characters are 500 bytes, but escape to 3000.
    const req = request();
    recordServerError(req, new TypeError("\u0001".repeat(500)), { fn: "sendInvoice" });
    const report = readReport(await annotateServerResponse(req, new Response("ok")))!;
    expect(report.raw).toMatchObject({ kind: "uncaught", name: "TypeError", fn: "sendInvoice" });
    const kept = (report.raw.message as string).length;
    expect(report.raw.message).toBe("\u0001".repeat(kept));
    expect(kept).toBeGreaterThan(400);
    expect(kept).toBeLessThan(500);
    // As many as fit: one more would not.
    const withOneMore = JSON.stringify({ ...report.raw, message: "\u0001".repeat(kept + 1) });
    expect(withOneMore.replace(/[\u007f-\uffff]/g, "\\uffff").length).toBeGreaterThan(3072);
  });

  test("the worst case still writes a header, on a code point", async () => {
    const req = request();
    const error = errorWithStack("\u0001😀".repeat(100) + "\u0001".repeat(100), "");
    error.name = "\u0001".repeat(64);
    recordServerError(req, error, { fn: "f".repeat(200) });
    const response = await annotateServerResponse(req, new Response("ok"));
    const report = readReport(response)!;
    expect(response.headers.get(REPORT)!.length).toBeLessThanOrEqual(3072);
    expect(report.raw.name).toBe("\u0001".repeat(64));
    expect(report.raw.message.length).toBeGreaterThan(0);
    expect(report.raw.message.toWellFormed()).toBe(report.raw.message);
  });

});

describe("fn", () => {
  async function fnOf(fn: unknown, status = 500) {
    const req = request();
    recordServerError(req, new Error("boom"), { fn } as { fn?: string });
    const response = await annotateServerResponse(req, new Response(null, { status }));
    return readReport(response)?.raw.fn;
  }

  test.each([
    "sendInvoice",
    "src/server-fns.js:sendInvoice",
    "54d9545e36624cc33c769ba67e70576fb5f8eb6ff5395d9ee82b7a3a6073103d",
    "a_b$c.d:e/f-g",
    "f".repeat(200),
  ])("keeps %s", async (fn) => {
    expect(await fnOf(fn, 200)).toBe(fn);
  });

  test.each([
    ["empty", ""],
    ["a space", "send invoice"],
    ["parentheses", "src/(group)/fn"],
    ["non-ASCII", "fünction"],
    ["a newline", "f\n"],
    ["201 characters", "f".repeat(201)],
    ["a number", 42],
    ["an object", { toString: () => "f" }],
  ])("omits one with %s", async (_, fn) => {
    expect(await fnOf(fn)).toBeUndefined();
  });
});

describe("serverErrorResponse", () => {
  test("is a plain 500 with the header when capture is on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = errorWithStack("db down", STACK, "DbError");
    const response = serverErrorResponse(request(), error);
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe("text/plain;charset=UTF-8");
    expect(await response.text()).toBe("Internal Server Error");
    expect(readReport(response)?.raw).toEqual({
      v: 2,
      kind: "uncaught",
      name: "DbError",
      message: "db down",
      frames: FRAMES,
    });
    expect(console.error).toHaveBeenCalledWith(error);
  });

  test("is the same 500 without the header when capture is off", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = serverErrorResponse(request(false), new Error("db down"));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Internal Server Error");
    expect(response.headers.get(REPORT)).toBeNull();
  });

  test("never reveals the error in the body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = serverErrorResponse(request(), new Error("password=hunter2"));
    expect(await response.text()).not.toContain("hunter2");
  });
});

describe("never throws", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("trap");
      },
      getPrototypeOf() {
        throw new Error("trap");
      },
    }
  );
  const badRequests: unknown[] = [
    undefined,
    null,
    42,
    "https://app.test/",
    {},
    { headers: null },
    { headers: { get: () => { throw new Error("trap"); } } },
    hostile,
  ];
  const badErrors: unknown[] = [
    hostile,
    Symbol("s"),
    { get message() { throw new Error("trap"); } },
    { get stack() { throw new Error("trap"); } },
    Object.create(null),
    { message: "m", name: 1, stack: 2 },
    { toString() { throw new Error("trap"); } },
  ];

  test("recordServerError", () => {
    for (const req of [...badRequests, request()]) {
      for (const error of badErrors) {
        expect(() => recordServerError(req as Request, error)).not.toThrow();
        expect(() => recordServerError(req as Request, error, hostile as { fn?: string })).not.toThrow();
        expect(() => recordServerError(req as Request, error, null as unknown as { fn?: string })).not.toThrow();
      }
    }
  });

  test("annotateServerResponse returns the response", async () => {
    // (A Proxy that traps `then` can't be returned from any async function, so it isn't one of them.)
    const badResponses: unknown[] = [undefined, null, {}, { status: 500, headers: hostile }, { status: hostile }];
    for (const req of [...badRequests, request()]) {
      for (const response of [...badResponses, json({ error: "e" })]) {
        await expect(annotateServerResponse(req as Request, response as Response)).resolves.toBe(response);
      }
    }
  });

  test("annotateServerResponse survives a body that errors", async () => {
    const body = new ReadableStream({
      pull() {
        throw new Error("stream broke");
      },
    });
    const response = new Response(body, { status: 500, headers: { "Content-Type": "application/json" } });
    await expect(annotateServerResponse(request(), response)).resolves.toBe(response);
  });

  test("annotateServerResponse survives clone() throwing", async () => {
    const response = json({ error: "e" });
    response.clone = () => {
      throw new Error("trap");
    };
    await expect(annotateServerResponse(request(), response)).resolves.toBe(response);
  });

  test("annotateServerResponse survives headers that can be neither set nor copied", async () => {
    const req = request();
    recordServerError(req, new Error("boom"), { fn: "f" });
    const response = new Response("ok");
    Object.defineProperty(response, "headers", {
      value: { get: () => null, set: () => { throw new TypeError("immutable"); } },
    });
    await expect(annotateServerResponse(req, response)).resolves.toBe(response);
  });

  test("annotateServerResponse survives an error with hostile fields", async () => {
    for (const error of badErrors) {
      const req = request();
      recordServerError(req, error, { fn: "f" });
      const response = await annotateServerResponse(req, new Response("ok"));
      expect(response.status).toBe(200);
    }
  });

  test("serverErrorResponse returns a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("console broke");
    });
    for (const req of [...badRequests, request()]) {
      for (const error of badErrors) {
        const response = serverErrorResponse(req as Request, error);
        expect(response.status).toBe(500);
        expect(await response.text()).toBe("Internal Server Error");
      }
    }
  });

  test("getAnonymousVisitorId", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
    });
    expect(() => getAnonymousVisitorId()).not.toThrow();
  });
});

describe("getAnonymousVisitorId", () => {
  test("is null outside a browser", () => {
    expect(typeof window).toBe("undefined");
    expect(getAnonymousVisitorId()).toBeNull();
  });

  test("in a browser, is the id the SDK already sends as X-Base44-Anonymous-Id", () => {
    const store = new Map<string, string>();
    const localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);

    const id = getAnonymousVisitorId();
    expect(id).toBeTruthy();
    expect(id).toBe(getAnalyticsSessionId());
    expect(store.get("base44_analytics_session_id")).toBe(id);
    expect(getAnonymousVisitorId()).toBe(id);
  });

  test("in a browser, reuses an id already stored", () => {
    const localStorage = {
      getItem: (k: string) => (k === "base44_analytics_session_id" ? "existing-id" : null),
      setItem: () => {},
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);
    expect(getAnonymousVisitorId()).toBe("existing-id");
  });
});
