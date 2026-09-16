import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { expect, test, vi } from "vitest";
import { Base44PlatformClient } from "../../../platform-src/client/index.js";

// Minimal Engine.IO/Socket.IO peer exercises the real client without a new server dependency.
test("real Socket.IO handshake, app join, reconnect and replay", async () => {
  const http = createServer();
  const server = new WebSocketServer({ server: http });
  const appId = "a".repeat(24), room = `/apps/${appId}`;
  const handshakes = [], joins = [], peers = [], applied = [], errors = [];
  let tokenCalls = 0;
  const send = (peer, event, data) => peer.send(`42/partner,${JSON.stringify([event, data])}`);
  const boundary = (peer, seq) => send(peer, "joined", { room, seq, max_entries: 2000, inactivity_expiry_seconds: 3600 });
  const update = (peer, seq) => send(peer, "update_model", { room, seq, data: '{"status":{"state":"ready"}}' });
  server.on("connection", (peer, request) => {
    peers.push(peer);
    const url = new URL(request.url, "http://localhost");
    handshakes.push({ url, token: undefined });
    const handshake = handshakes.at(-1);
    peer.send(`0${JSON.stringify({ sid: String(peers.length), upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`);
    peer.on("message", bytes => {
      const packet = bytes.toString();
      if (packet.startsWith("40/partner,")) {
        handshake.token = JSON.parse(packet.slice("40/partner,".length)).token;
        peer.send(`40/partner,${JSON.stringify({ sid: `namespace-${peers.length}` })}`);
      } else if (packet.startsWith("42/partner,")) {
        const [event, ...args] = JSON.parse(packet.slice("42/partner,".length));
        if (event !== "join") return;
        joins.push(args);
        if (joins.length === 1) { boundary(peer, "start"); update(peer, "one"); }
        else { update(peer, "two"); boundary(peer, "two"); }
      }
    });
  });
  await new Promise(resolve => http.listen(0, "127.0.0.1", resolve));
  const client = new Base44PlatformClient({
    serverUrl: `http://127.0.0.1:${http.address().port}`,
    getToken: async () => `browser-${++tokenCalls}`,
    onError: error => errors.push(error),
  });
  try {
    const sub = client.subscribe(appId, { onEvent: event => { applied.push(event); }, onError: error => errors.push(error) });
    await client.connect();
    await vi.waitFor(() => expect(sub.cursor).toBe("one"));
    peers[0].terminate();
    await vi.waitFor(() => expect(sub.cursor).toBe("two"), { timeout: 6000 });
    expect(joins).toEqual([[room, {}], [room, { after_seq: "one" }]]);
    expect(applied.map(event => event.seq)).toEqual(["one", "two"]);
    expect(handshakes.map(item => item.token)).toEqual(["browser-1", "browser-2"]);
    for (const { url } of handshakes) {
      expect(url.pathname).toBe("/ws-whitelabel/socket.io/");
      expect(url.searchParams.get("transport")).toBe("websocket");
      expect(url.searchParams.has("token")).toBe(false);
    }
    expect(errors).toEqual([]);
  } finally {
    client.close();
    for (const peer of peers) peer.terminate();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => http.close(resolve));
  }
});
