import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import nock from "nock";

// What the bundler would have baked in for VITE_BASE44_BUILD_COMMIT. The
// reader is replaced here so each test picks its value; it is tested on its
// own below.
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

  // Every call path must report the same build, or one client's requests get
  // attributed to two different bundles.
  test.each([
    ["exact casing, over a baked-in commit", "X-Base44-Build", COMMIT],
    ["lowercase, over a baked-in commit", "x-base44-build", COMMIT],
    ["uppercase, over a baked-in commit", "X-BASE44-BUILD", COMMIT],
    ["exact casing, with no baked-in commit", "X-Base44-Build", undefined],
  ])("a caller-supplied header wins on every call path (%s)", async (_label, name, baked) => {
    stubBrowserGlobals();
    source.value = baked;
    const override = "f".repeat(40);
    const { createClient } = await loadSdk();
    const client = createClient({
      serverUrl,
      appId,
      analytics: { enabled: false },
      headers: { [name]: override },
    });

    expect(await entityCallBuildHeader(client)).toBe(override);

    let invoked: string | string[] | undefined;
    nock(serverUrl)
      .post(`/api/apps/${appId}/functions/hello`)
      .reply(function () {
        invoked = this.req.headers["x-base44-build"];
        return [200, {}];
      });
    await client.functions.invoke("hello", {});
    expect(invoked).toBe(override);

    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await client.functions.fetch("/hello");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("X-Base44-Build")).toBe(override);
  });
});

describe("build commit source", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("the reader returns VITE_BASE44_BUILD_COMMIT from import.meta.env", async () => {
    const { readBuildCommitSource } = await vi.importActual<
      typeof import("../../src/utils/build-commit-source.ts")
    >("../../src/utils/build-commit-source.ts");

    vi.stubEnv("VITE_BASE44_BUILD_COMMIT", COMMIT);
    expect(readBuildCommitSource()).toBe(COMMIT);
  });

  test("the reader keeps the exact expression Vite replaces", () => {
    // Vite substitutes the value by matching this expression statically; a
    // refactor that reaches it any other way silently stops the header.
    const file = fileURLToPath(
      new URL("../../src/utils/build-commit-source.ts", import.meta.url)
    );
    expect(readFileSync(file, "utf8")).toContain(
      "import.meta.env.VITE_BASE44_BUILD_COMMIT"
    );
  });

  test("only the reader uses import.meta, and the fallback returns nothing", async () => {
    // Anything else with `import.meta` would reach Metro, which can't take it.
    const sources = import.meta.glob("../../src/**/*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const usesImportMeta = Object.entries(sources)
      .filter(([, code]) =>
        (code as string).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").includes("import.meta")
      )
      .map(([file]) => file);
    expect(usesImportMeta).toEqual(["../../src/utils/build-commit-source.ts"]);

    const { readBuildCommitSource } = await vi.importActual<
      typeof import("../../src/utils/build-commit-source.fallback.ts")
    >("../../src/utils/build-commit-source.fallback.ts");
    vi.stubEnv("VITE_BASE44_BUILD_COMMIT", COMMIT);
    expect(readBuildCommitSource()).toBeUndefined();
  });

  test("package.json gives the reader only to the module condition", () => {
    const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const map = pkg.imports["#build-commit-source"];

    // Metro matches neither `module` nor `browser` here, so it takes the
    // fallback on native and web alike. Order matters: the first match wins.
    expect(map).toEqual({
      module: "./dist/utils/build-commit-source.js",
      default: "./dist/utils/build-commit-source.fallback.js",
    });
    expect(Object.keys(map)).toEqual(["module", "default"]);

    // Each mapped dist file comes from a src file of the same name.
    for (const target of Object.values(map) as string[]) {
      const src = target.replace("./dist/", "../../src/").replace(/\.js$/, ".ts");
      expect(existsSync(fileURLToPath(new URL(src, import.meta.url)))).toBe(true);
    }
  });
});
