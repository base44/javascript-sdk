import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import nock from "nock";

// What the bundler would have baked in for VITE_BASE44_BUILD_COMMIT. The real
// source is swapped in by the package's `browser` field, which these tests
// can't exercise, so it is replaced here and tested on its own below.
const source = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("../../src/utils/build-commit-source.ts", () => ({
  readBuildCommitSource: () => source.value,
}));

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const serverUrl = "https://api.base44.com";
const appId = "test-app-id";

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

function stubBrowserGlobals() {
  const localStorage = makeLocalStorage();
  vi.stubGlobal("window", {
    location: { href: "https://my-app.base44.app/", origin: "https://my-app.base44.app" },
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("document", {});
  vi.stubGlobal("localStorage", localStorage);
}

function stubReactNativeGlobals() {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", undefined);
  vi.stubGlobal("localStorage", undefined);
}

// Environment flags are read once at module load, so each test re-imports the
// SDK after stubbing the globals it runs under.
async function loadSdk() {
  vi.resetModules();
  return await import("../../src/index.ts");
}

// The X-Base44-Build value the next entity call sends, or undefined.
async function entityCallBuildHeader(client: {
  entities: Record<string, any>;
}): Promise<string | undefined> {
  let sent: string | undefined;
  nock(serverUrl)
    .get(`/api/apps/${appId}/entities/Todo`)
    .query(true)
    .reply(function () {
      const value = this.req.headers["x-base44-build"];
      sent = Array.isArray(value) ? value[0] : value;
      return [200, []];
    });
  await client.entities.Todo.list();
  return sent;
}

beforeEach(() => {
  nock.disableNetConnect();
  source.value = undefined;
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("X-Base44-Build header", () => {
  test("a browser client sends the build commit on entity calls", async () => {
    stubBrowserGlobals();
    source.value = COMMIT;
    const { createClient } = await loadSdk();
    const client = createClient({ serverUrl, appId, analytics: { enabled: false } });

    expect(await entityCallBuildHeader(client)).toBe(COMMIT);
  });

  test("a browser client sends it on function invocations and functions.fetch", async () => {
    stubBrowserGlobals();
    source.value = COMMIT;
    const { createClient } = await loadSdk();
    const client = createClient({ serverUrl, appId, analytics: { enabled: false } });

    let invoked: string | undefined;
    nock(serverUrl)
      .post(`/api/apps/${appId}/functions/hello`)
      .reply(function () {
        invoked = this.req.headers["x-base44-build"] as string;
        return [200, {}];
      });
    await client.functions.invoke("hello", {});
    expect(invoked).toBe(COMMIT);

    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await client.functions.fetch("/hello");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("X-Base44-Build")).toBe(COMMIT);
  });

  test("omits the header when no build commit was baked in", async () => {
    stubBrowserGlobals();
    const { createClient } = await loadSdk();
    const client = createClient({ serverUrl, appId, analytics: { enabled: false } });

    expect(await entityCallBuildHeader(client)).toBeUndefined();
  });

  test.each([
    ["empty", ""],
    ["uppercase", COMMIT.toUpperCase()],
    ["short", COMMIT.slice(0, 39)],
    ["long", COMMIT + "0"],
    ["padded", ` ${COMMIT}`],
    ["trailing newline", `${COMMIT}\n`],
    ["not hex", "g".repeat(40)],
    ["not a string", 123],
  ])("omits the header for a malformed value (%s)", async (_label, value) => {
    stubBrowserGlobals();
    source.value = value;
    const { createClient } = await loadSdk();
    const client = createClient({ serverUrl, appId, analytics: { enabled: false } });

    expect(await entityCallBuildHeader(client)).toBeUndefined();
  });

  test("createClientFromRequest never sends it, even where a browser bundle would", async () => {
    stubBrowserGlobals();
    source.value = COMMIT;
    const { createClientFromRequest } = await loadSdk();
    const client = createClientFromRequest(
      new Request("https://fn.example/", {
        headers: { "Base44-App-Id": appId, "Base44-Api-Url": serverUrl },
      })
    );

    expect(await entityCallBuildHeader(client)).toBeUndefined();
  });

  test("a server-side client (no window) never sends it", async () => {
    source.value = COMMIT;
    const { createClient } = await loadSdk();
    const client = createClient({ serverUrl, appId });

    expect(await entityCallBuildHeader(client)).toBeUndefined();
  });

  test("a React Native client never sends it", async () => {
    stubReactNativeGlobals();
    source.value = COMMIT;
    const { createClient } = await loadSdk();
    const client = createClient({ serverUrl, appId });

    expect(await entityCallBuildHeader(client)).toBeUndefined();
  });

  test("a caller-supplied header still wins", async () => {
    stubBrowserGlobals();
    source.value = COMMIT;
    const other = "f".repeat(40);
    const { createClient } = await loadSdk();
    const client = createClient({
      serverUrl,
      appId,
      analytics: { enabled: false },
      headers: { "X-Base44-Build": other },
    });

    expect(await entityCallBuildHeader(client)).toBe(other);
  });
});

describe("build commit source", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("the browser source reads VITE_BASE44_BUILD_COMMIT from import.meta.env", async () => {
    const { readBuildCommitSource } = await vi.importActual<
      typeof import("../../src/utils/build-commit-source.browser.ts")
    >("../../src/utils/build-commit-source.browser.ts");

    vi.stubEnv("VITE_BASE44_BUILD_COMMIT", COMMIT);
    expect(readBuildCommitSource()).toBe(COMMIT);
  });

  test("the browser source keeps the exact expression Vite replaces", () => {
    // Vite substitutes the value by matching this expression statically; a
    // refactor that reaches it any other way silently stops the header.
    const file = fileURLToPath(
      new URL("../../src/utils/build-commit-source.browser.ts", import.meta.url)
    );
    expect(readFileSync(file, "utf8")).toContain(
      "import.meta.env.VITE_BASE44_BUILD_COMMIT"
    );
  });

  test("the default source never touches import.meta", async () => {
    const file = fileURLToPath(
      new URL("../../src/utils/build-commit-source.ts", import.meta.url)
    );
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain("import.meta");

    const { readBuildCommitSource } = await vi.importActual<
      typeof import("../../src/utils/build-commit-source.ts")
    >("../../src/utils/build-commit-source.ts");
    expect(readBuildCommitSource()).toBeUndefined();
  });

  test("package.json routes browsers to the reader and React Native back to the stub", () => {
    const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const stub = "./dist/utils/build-commit-source.js";

    expect(pkg.browser).toEqual({
      [stub]: "./dist/utils/build-commit-source.browser.js",
    });
    // Metro reads `react-native` before `browser`; without this it would pick
    // the reader, and Hermes can't parse `import.meta`.
    expect(pkg["react-native"]).toEqual({ [stub]: stub });

    // Each mapped dist file comes from a src file of the same name.
    for (const target of [stub, pkg.browser[stub]]) {
      const src = target.replace("./dist/", "../../src/").replace(/\.js$/, ".ts");
      expect(existsSync(fileURLToPath(new URL(src, import.meta.url)))).toBe(true);
    }
  });
});
