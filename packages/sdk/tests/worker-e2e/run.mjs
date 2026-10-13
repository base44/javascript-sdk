// Runs the built app (`vite build` first) and checks what the error-capture middleware reports.
//
// - In Miniflare, as the Cloudflare plugin runs it: statuses, bodies and headers.
// - In plain workerd, with the modules named as `base44 site deploy` uploads them (their paths under
//   dist/server): the frames' files. Miniflare appends `//# sourceURL=file:///<absolute path>` to each
//   module, so under it workerd prints absolute local paths; a deployed Worker prints the module names.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const SERVER_DIR = fileURLToPath(new URL("./dist/server/", import.meta.url));
const WORKERD = fileURLToPath(new URL("./node_modules/.bin/workerd", import.meta.url));
const COMPATIBILITY_DATE = "2026-09-01";
const CAPTURE = { "X-B44-Capture-Errors": "1" };
const REPORT = "X-B44-Function-Error";

// Every module of the Worker, by the name it is uploaded under.
const MODULE_NAMES = [
  "index.js",
  ...readdirSync(SERVER_DIR, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".js") && name !== "index.js")
    .sort(),
];

// A server function's URL and the request the TanStack client sends to it.
function serverFnRequest(url, headers = {}) {
  return [
    url,
    {
      method: "POST",
      headers: {
        "x-tsr-serverFn": "true",
        accept: "application/x-tss-framed, application/x-ndjson, application/json",
        ...headers,
      },
    },
  ];
}

function report(response) {
  const value = response.headers.get(REPORT);
  return value === null ? null : JSON.parse(value);
}

async function serverFnUrls(fetch) {
  const html = await (await fetch("http://app.test/")).text();
  const url = (id) => html.match(new RegExp(`<pre id="${id}">([^<]+)</pre>`))[1];
  return { sendInvoice: `http://app.test${url("send-invoice")}`, ok: `http://app.test${url("ok")}` };
}

describe("in Miniflare", () => {
  let mf;
  let fetch;
  let fns;

  before(async () => {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: MODULE_NAMES.map((name) => ({ type: "ESModule", path: join(SERVER_DIR, name) })),
        modulesRoot: SERVER_DIR,
        compatibilityDate: COMPATIBILITY_DATE,
        compatibilityFlags: ["nodejs_compat"],
      })
    );
    fetch = (url, init) => mf.dispatchFetch(url, init);
    fns = await serverFnUrls(fetch);
  });

  after(() => mf?.dispose());

  test("a throwing server function keeps its 200 body, and the header names it", async () => {
    const off = await fetch(...serverFnRequest(fns.sendInvoice));
    const on = await fetch(...serverFnRequest(fns.sendInvoice, CAPTURE));

    assert.equal(on.status, 200);
    assert.equal(off.status, 200);
    assert.equal(await on.text(), await off.text());
    assert.equal(off.headers.get(REPORT), null);

    const header = report(on);
    assert.equal(header.v, 2);
    assert.equal(header.kind, "uncaught");
    assert.equal(header.fn, "sendInvoice");
    assert.equal(header.name, "TypeError");
    assert.equal(header.message, "Cannot read properties of undefined (reading 'amount')");
    assert.ok(header.frames.length > 0);
    assert.match(header.frames[0].file, /\/dist\/server\/assets\/server-fns-[\w-]+\.js$/);
  });

  test("a server function that succeeds gets no header", async () => {
    const response = await fetch(...serverFnRequest(fns.ok, CAPTURE));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get(REPORT), null);
  });

  test("a throwing server.handlers route answers a 500 with the header", async () => {
    const on = await fetch("http://app.test/api/boom", { headers: CAPTURE });
    assert.equal(on.status, 500);
    assert.equal(await on.text(), "Internal Server Error");
    const header = report(on);
    assert.equal(header.kind, "uncaught");
    assert.equal(header.name, "TypeError");
    assert.equal(header.message, "Cannot read properties of null (reading 'number')");
    assert.equal(header.fn, undefined);

    const off = await fetch("http://app.test/api/boom");
    assert.equal(off.status, 500);
    assert.equal(await off.text(), "Internal Server Error");
    assert.equal(off.headers.get(REPORT), null);
  });

  test("a route's own 5xx is reported with its body's message", async () => {
    const response = await fetch("http://app.test/api/fails", { headers: CAPTURE });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "Internal server error",
      details: "Calendar token expired",
    });
    assert.deepEqual(report(response), { v: 2, kind: "response", message: "Calendar token expired" });
  });

  test("a page route's 500 to a non-HTML Accept is left untouched", async () => {
    const response = await fetch("http://app.test/", {
      headers: { ...CAPTURE, accept: "application/json" },
    });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get(REPORT), null);
  });

  test("a page renders as before", async () => {
    const response = await fetch("http://app.test/", { headers: CAPTURE });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get(REPORT), null);
  });
});

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

describe("in workerd, with the modules named as uploaded", () => {
  const configPath = join(SERVER_DIR, "e2e.capnp");
  let child;
  let origin;

  before(async () => {
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    writeFileSync(
      configPath,
      [
        'using Workerd = import "/workerd/workerd.capnp";',
        "const config :Workerd.Config = (",
        '  services = [(name = "main", worker = .app)],',
        `  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")]`,
        ");",
        "const app :Workerd.Worker = (",
        `  compatibilityDate = "${COMPATIBILITY_DATE}",`,
        '  compatibilityFlags = ["nodejs_compat"],',
        "  modules = [",
        ...MODULE_NAMES.map((name) => `    (name = "${name}", esModule = embed "${name}"),`),
        "  ]",
        ");",
      ].join("\n")
    );
    child = spawn(WORKERD, ["serve", configPath], { stdio: "ignore" });
    for (let attempt = 0; ; attempt++) {
      try {
        await globalThis.fetch(origin);
        break;
      } catch (error) {
        if (attempt > 100) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });

  after(() => {
    child?.kill();
    rmSync(configPath, { force: true });
  });

  async function framesOf(response) {
    const header = report(response);
    assert.ok(header?.frames?.length, "the header has frames");
    for (const { file, line, col } of header.frames) {
      assert.ok(MODULE_NAMES.includes(file), `${file} is an uploaded module`);
      assert.ok(existsSync(join(SERVER_DIR, `${file}.map`)), `${file}.map was built`);
      assert.ok(Number.isInteger(line) && line >= 1);
      assert.ok(Number.isInteger(col) && col >= 1);
    }
    return header.frames;
  }

  test("a server route's frames name the uploaded modules", async () => {
    const response = await globalThis.fetch(`${origin}/api/boom`, { headers: CAPTURE });
    assert.equal(response.status, 500);
    const frames = await framesOf(response);
    assert.match(frames[0].file, /^assets\/router-[\w-]+\.js$/);
  });

  test("a server function's frames name the uploaded modules", async () => {
    const fns = await serverFnUrls((url, init) => globalThis.fetch(url.replace("http://app.test", origin), init));
    const [url, init] = serverFnRequest(fns.sendInvoice.replace("http://app.test", origin), CAPTURE);
    const response = await globalThis.fetch(url, init);
    assert.equal(response.status, 200);
    assert.equal(report(response).fn, "sendInvoice");
    const frames = await framesOf(response);
    assert.match(frames[0].file, /^assets\/server-fns-[\w-]+\.js$/);
  });
});
