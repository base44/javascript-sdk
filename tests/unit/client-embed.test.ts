import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import nock from "nock";
import { io } from "socket.io-client";
import { createClient, getAccessToken } from "../../src/index.ts";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    id: "socket-id",
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
  })),
}));

const serverUrl = "https://api.base44.test";
const appId = "app-1";
const exchangePath = `/api/apps/${appId}/auth/embed/token`;

const fakeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
    removeItem: vi.fn((key: string) => void values.delete(key)),
  };
};

// A browser window as an embedded app sees it: inside a frame, with the
// platform's one-time token on the URL unless `url` says otherwise.
const stubBrowser = ({
  url = `https://app.base44.app/orders?ott=the-ott&tab=open`,
  framed = true,
  localStorage = fakeStorage(),
  sessionStorage = fakeStorage(),
} = {}) => {
  const windowRef: any = {
    location: { href: url, origin: "https://app.base44.app" },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, nextUrl: string) => {
        windowRef.location.href = nextUrl;
      },
    },
    localStorage,
    sessionStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  windowRef.self = windowRef;
  windowRef.top = framed ? {} : windowRef;
  windowRef.parent = windowRef.top;
  vi.stubGlobal("window", windowRef);
  return windowRef;
};

// The exchange goes through global fetch; `resolveWith` releases it so a test
// can issue requests while it is still in flight.
const stubExchange = (result: { access_token?: string } | { status: number }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    await gate;
    if ("status" in result) {
      return { ok: false, status: result.status, json: async () => ({ error: "invalid_grant" }) };
    }
    return { ok: true, status: 200, json: async () => result };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, release };
};

const newClient = () =>
  createClient({ serverUrl, appId, analytics: { enabled: false } });

// Enough of a document for the session-ended notice to render into.
const stubDocument = () => {
  const appended: unknown[] = [];
  vi.stubGlobal("document", {
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute: vi.fn(), append: vi.fn() }),
    body: { append: (...nodes: unknown[]) => appended.push(...nodes) },
  });
  return appended;
};

describe("embedded sessions", () => {
  beforeEach(() => {
    nock.cleanAll();
    vi.mocked(io).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    nock.cleanAll();
  });

  test("takes the one-time token off the URL as the client is created", () => {
    const windowRef = stubBrowser();
    stubExchange({ access_token: "session-token" });

    newClient();

    expect(windowRef.location.href).toBe("https://app.base44.app/orders?tab=open");
  });

  test("exchanges the token and authenticates a request issued while the exchange is in flight", async () => {
    stubBrowser();
    const { fetchMock, release } = stubExchange({ access_token: "session-token" });
    const me = nock(serverUrl, { reqheaders: { authorization: "Bearer session-token" } })
      .get(`/api/apps/${appId}/entities/User/me`)
      .reply(200, { id: "u1", email: "bob@platform.test" });

    const client = newClient();
    expect(client.auth.hasToken()).toBe(false);

    const pending = client.auth.me();
    release();
    const user = await pending;

    expect(user.email).toBe("bob@platform.test");
    expect(client.auth.hasToken()).toBe(true);
    expect(me.isDone()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${serverUrl}${exchangePath}`);
    expect(Object.fromEntries(init.body as URLSearchParams)).toMatchObject({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: "the-ott",
    });
  });

  test("keeps the session in memory only", async () => {
    const localStorage = fakeStorage();
    stubBrowser({ localStorage });
    const { release } = stubExchange({ access_token: "session-token" });
    nock(serverUrl).get(`/api/apps/${appId}/entities/User/me`).reply(200, { id: "u1" });

    const client = newClient();
    release();
    await client.auth.me();

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  // Apps read getAccessToken() as they load and hand the result to createClient
  // as `token` — in a frame that is the one-time token itself. It is proof of
  // an identity, not the identity: it is never sent as a bearer.
  test("a one-time token passed in as the token is exchanged, not sent", async () => {
    stubBrowser();
    const { release } = stubExchange({ access_token: "session-token" });
    const me = nock(serverUrl, { reqheaders: { authorization: "Bearer session-token" } })
      .get(`/api/apps/${appId}/entities/User/me`)
      .reply(200, { id: "u1" });

    const client = createClient({
      serverUrl,
      appId,
      token: "the-ott",
      analytics: { enabled: false },
    });
    expect(client.auth.hasToken()).toBe(false);
    expect(client.aiGateway.connection().token).toBe("");

    const pending = client.auth.me();
    release();
    await pending;

    expect(me.isDone()).toBe(true);
    expect(client.aiGateway.connection().token).toBe("session-token");
  });

  test("ignores a token an earlier visitor left in storage", async () => {
    const localStorage = fakeStorage();
    localStorage.setItem("base44_access_token", "alice-token");
    localStorage.setItem.mockClear();
    stubBrowser({ localStorage });
    const { release } = stubExchange({ status: 400 });
    // The request must go out anonymous — never as alice.
    const me = nock(serverUrl, { badheaders: ["authorization"] })
      .get(`/api/apps/${appId}/entities/User/me`)
      .reply(401, { detail: "unauthenticated" });

    const client = newClient();
    release();

    await expect(client.auth.me()).rejects.toBeTruthy();
    expect(me.isDone()).toBe(true);
    expect(client.auth.hasToken()).toBe(false);
    expect(client.auth.isEmbedded()).toBe(true);
    expect(client.aiGateway.connection().token).toBe("");
  });

  test("the realtime socket connects with the exchanged session", async () => {
    stubBrowser();
    const { release } = stubExchange({ access_token: "session-token" });
    nock(serverUrl).get(`/api/apps/${appId}/entities/User/me`).reply(200, { id: "u1" });

    const client = newClient();
    release();
    await client.auth.me();
    client.entities.Todo.subscribe(() => {});

    const [, options] = vi.mocked(io).mock.calls.at(-1)!;
    expect((options as { query: Record<string, unknown> }).query.token).toBe("session-token");
  });

  // functions.fetch builds its own headers instead of going through axios, so
  // it has to wait for the exchange on its own or it leaves unauthenticated.
  test("functions.fetch waits for the exchange and carries the session", async () => {
    stubBrowser();
    const { fetchMock, release } = stubExchange({ access_token: "session-token" });

    const client = newClient();
    const pending = client.functions.fetch("/report");
    release();
    await pending;

    // The first fetch was the exchange; the second is the function call.
    const [, init] = fetchMock.mock.calls.at(-1)!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer session-token");
  });

  // These build a URL instead of issuing a request, so they cannot wait for the
  // exchange: they read empty while it is in flight and correct once it lands.
  test("the value readers are empty until the session arrives", async () => {
    stubBrowser();
    const { release } = stubExchange({ access_token: "session-token" });
    nock(serverUrl).get(`/api/apps/${appId}/entities/User/me`).reply(200, { id: "u1" });

    const client = newClient();

    expect(client.aiGateway.connection().token).toBe("");
    expect(client.agents.getWhatsAppConnectURL("bot")).not.toContain("token=");

    release();
    await client.auth.me();

    expect(client.aiGateway.connection().token).toBe("session-token");
    expect(client.agents.getWhatsAppConnectURL("bot")).toContain("token=session-token");
  });

  test("redirectToLogin shows a session-ended notice instead of leaving the frame", () => {
    const windowRef = stubBrowser();
    stubExchange({ status: 400 });
    const appended = stubDocument();

    const client = newClient();
    client.auth.redirectToLogin(windowRef.location.href);

    expect(windowRef.location.href).toBe("https://app.base44.app/orders?tab=open");
    expect(appended).toHaveLength(1);
  });

  // Someone opens the iframe's own URL in a normal tab. There is no frame, so
  // the regular login works and must be what they get — but the one-time token
  // still comes off the URL rather than sitting in the address bar.
  test("a top-level tab carrying a token is not embedded, and signs in normally", async () => {
    const localStorage = fakeStorage();
    localStorage.setItem("base44_access_token", "stored-token");
    localStorage.setItem.mockClear();
    const windowRef = stubBrowser({ framed: false, localStorage });
    const { fetchMock } = stubExchange({ access_token: "never-used" });
    const me = nock(serverUrl, { reqheaders: { authorization: "Bearer stored-token" } })
      .get(`/api/apps/${appId}/entities/User/me`)
      .reply(200, { id: "u1" });

    const client = newClient();

    expect(client.auth.isEmbedded()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(windowRef.location.href).toBe("https://app.base44.app/orders?tab=open");

    await client.auth.me();
    expect(me.isDone()).toBe(true);
  });

  test("an app opened normally is untouched: stored token applied, nothing exchanged", () => {
    const localStorage = fakeStorage();
    localStorage.setItem("base44_access_token", "stored-token");
    stubBrowser({ url: "https://app.base44.app/orders", localStorage });
    const { fetchMock } = stubExchange({ access_token: "unused" });

    const client = newClient();

    expect(client.auth.isEmbedded()).toBe(false);
    expect(client.auth.hasToken()).toBe(true);
    expect(client.aiGateway.connection().token).toBe("stored-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The exchange applies its session with saveToStorage=false, but an app can
  // call setToken itself (loginViaEmailPassword does). In a frame that must
  // not persist either, or the session outlives the frame it was minted for.
  test("an embedded client never persists a token, even when asked to", async () => {
    const localStorage = fakeStorage();
    stubBrowser({ localStorage });
    const { release } = stubExchange({ access_token: "session-token" });

    const client = newClient();
    release();
    await Promise.resolve();

    client.setToken("app-set-token");

    expect(client.auth.hasToken()).toBe(true);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  test("a refused exchange is reported through onError instead of only 401s", async () => {
    stubBrowser();
    const { release } = stubExchange({ status: 400 });
    const onError = vi.fn();
    nock(serverUrl).get(`/api/apps/${appId}/entities/User/me`).reply(401, {});

    const client = createClient({
      serverUrl,
      appId,
      analytics: { enabled: false },
      options: { onError },
    });
    release();
    await expect(client.auth.me()).rejects.toBeTruthy();

    const reported = onError.mock.calls.map(([e]) => (e as Error).message);
    expect(reported.some((m) => m.includes("embed token was refused"))).toBe(true);
  });

  // The socket used to be handed a token at construction and had to be told
  // about every later one; now it asks, so a reconnect is all this needs.
  test("setToken reaches the socket", () => {
    const localStorage = fakeStorage();
    stubBrowser({ url: "https://app.base44.app/orders", localStorage });
    stubExchange({ access_token: "unused" });

    const client = newClient();
    client.entities.Todo.subscribe(() => {});
    client.setToken("fresh-token");

    const [, options] = vi.mocked(io).mock.calls.at(-1)!;
    expect((options as { query: Record<string, unknown> }).query.token).toBe("fresh-token");
    expect(localStorage.setItem).toHaveBeenCalledWith("base44_access_token", "fresh-token");
  });

  // Same for fetchWithAuth, which reads the Authorization off the axios
  // defaults rather than building it.
  test("fetchWithAuth waits for the exchange and carries the session", async () => {
    stubBrowser();
    const { fetchMock, release } = stubExchange({ access_token: "session-token" });

    const client = newClient();
    const pending = client.fetchWithAuth("/api/orders");
    release();
    await pending;

    const [, init] = fetchMock.mock.calls.at(-1)!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer session-token");
  });

  // The service-role module's channel URLs are handed to the user, so they
  // carry the user's token — the app's service credential must never be in one.
  test("a service-role channel URL carries the user's session, not the service token", async () => {
    stubBrowser();
    const { release } = stubExchange({ access_token: "session-token" });
    nock(serverUrl).get(`/api/apps/${appId}/entities/User/me`).reply(200, { id: "u1" });

    const client = createClient({
      serverUrl,
      appId,
      serviceToken: "service-token",
      analytics: { enabled: false },
    });
    release();
    await client.auth.me();

    const url = client.asServiceRole.agents.getWhatsAppConnectURL("support");
    expect(url).toContain("token=session-token");
  });

  test("logout inside the frame shows the notice instead of navigating", () => {
    const windowRef = stubBrowser();
    stubExchange({ access_token: "unused" });
    const appended = stubDocument();

    const client = newClient();
    client.auth.logout();

    expect(windowRef.location.href).toBe("https://app.base44.app/orders?tab=open");
    expect(appended).toHaveLength(1);
    expect(client.auth.hasToken()).toBe(false);
  });

  // The one-time token stays on the URL when the browser refuses the rewrite.
  // Outside a frame it is redeemed by nobody, so it must not be mistaken for a
  // session — least of all a saved one, which would outlast the visit.
  test("a top-level load whose URL cannot be rewritten never saves the one-time token", () => {
    const localStorage = fakeStorage();
    const windowRef = stubBrowser({ framed: false, localStorage });
    windowRef.history.replaceState = () => {
      throw new Error("history blocked");
    };
    windowRef.location.search = "?ott=the-ott&tab=open";
    windowRef.location.pathname = "/orders";
    windowRef.location.hash = "";
    const { fetchMock } = stubExchange({ access_token: "never-used" });

    const client = newClient();

    expect(client.auth.hasToken()).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The exchange is what every request waits for, so it has to end.
  test("the exchange cannot hang forever", async () => {
    stubBrowser();
    const { fetchMock, release } = stubExchange({ access_token: "session-token" });
    nock(serverUrl).get(`/api/apps/${appId}/entities/User/me`).reply(200, { id: "u1" });

    const client = newClient();
    release();
    await client.auth.me();

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  // An embedded logout returns instead of navigating, so the page — and
  // everything still holding the session — outlives it.
  test("an embedded logout leaves nothing holding the session", async () => {
    stubBrowser();
    stubDocument();
    const { release } = stubExchange({ access_token: "session-token" });
    nock(serverUrl).get(`/api/apps/${appId}/entities/User/me`).reply(200, { id: "u1" });

    const client = newClient();
    release();
    await client.auth.me();
    client.entities.Todo.subscribe(() => {});
    const socket = vi.mocked(io).mock.results.at(-1)!.value;

    client.auth.logout();

    expect(socket.disconnect).toHaveBeenCalled();
    const call = nock(serverUrl, { badheaders: ["authorization"] })
      .post(`/api/apps/${appId}/functions/report`)
      .reply(200, {});
    await client.functions.invoke("report", {});
    expect(call.isDone()).toBe(true);
  });

  // Every module asks getToken() per use; the socket cannot — it carries the
  // token on the handshake — so it has to be told, whichever setToken is used.
  test("auth.setToken reaches the socket too", () => {
    const localStorage = fakeStorage();
    localStorage.setItem("base44_access_token", "stored-token");
    stubBrowser({ url: "https://app.base44.app/orders", localStorage });
    stubExchange({ access_token: "unused" });

    const client = newClient();
    client.entities.Todo.subscribe(() => {});
    client.auth.setToken("fresh-token", false);

    const [, options] = vi.mocked(io).mock.calls.at(-1)!;
    expect((options as { query: Record<string, unknown> }).query.token).toBe("fresh-token");
    expect(localStorage.setItem).not.toHaveBeenCalledWith("base44_access_token", "fresh-token");
  });

});

// The template's app-params reads getAccessToken() once as the page loads,
// before createClient runs, and the app gates its auth check on that snapshot.
describe("getAccessToken on an embedded load", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns the one-time token, without storing it or taking it off the URL", () => {
    const localStorage = fakeStorage();
    const windowRef = stubBrowser({ localStorage });
    windowRef.location.search = "?ott=the-ott&tab=open";
    windowRef.location.pathname = "/orders";
    windowRef.location.hash = "";

    expect(getAccessToken()).toBe("the-ott");
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(windowRef.location.href).toBe("https://app.base44.app/orders?ott=the-ott&tab=open");
  });

  test("reports nothing in a top-level tab, where no one redeems it", () => {
    const localStorage = fakeStorage();
    localStorage.setItem("base44_access_token", "stored-token");
    const windowRef = stubBrowser({ framed: false, localStorage });
    windowRef.location.search = "?ott=the-ott&tab=open";
    windowRef.location.pathname = "/orders";
    windowRef.location.hash = "";

    expect(getAccessToken()).toBe("stored-token");
  });

  test("an explicit access token on the URL still wins", () => {
    const windowRef = stubBrowser();
    windowRef.location.search = "?access_token=real-token&ott=the-ott";
    windowRef.location.pathname = "/orders";
    windowRef.location.hash = "";
    vi.stubGlobal("document", { title: "" });

    expect(getAccessToken()).toBe("real-token");
  });
});
