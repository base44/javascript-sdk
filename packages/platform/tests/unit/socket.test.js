import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { expect, test, vi } from "vitest";
import { createPlatformClient } from "../../src/index.js";

// Minimal Engine.IO/Socket.IO peer exercises the real client without a new server dependency.
test("real Socket.IO handshake, join, snapshot, reconnect and session renewal", async () => {
  const http = createServer();
  const server = new WebSocketServer({ server: http });
  const appId = "a".repeat(24), room = `/apps/${appId}`;
  const handshakes = [], joins = [], peers = [], snapshots = [], errors = [];
  let tokenCalls = 0;
  const send = (peer, event, data) => peer.send(`42${JSON.stringify([event, data])}`);
  server.on("connection", (peer, request) => {
    peers.push(peer);
    const handshake = { url: new URL(request.url, "http://localhost"), token: undefined };
    handshakes.push(handshake);
    peer.send(`0${JSON.stringify({ sid: String(peers.length), upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`);
    peer.on("message", bytes => {
      const packet = bytes.toString();
      if (packet.startsWith("40")) {
        handshake.token = JSON.parse(packet.slice(2)).session_token;
        peer.send(`40${JSON.stringify({ sid: `socket-${peers.length}` })}`);
      } else if (packet.startsWith("42")) {
        const [event, ...args] = JSON.parse(packet.slice(2));
        if (event !== "join") return;
        joins.push(args);
        send(peer, "app.snapshot", { room, data: { status: { state: "ready" }, messages: [{ id: `m${joins.length}` }] } });
      }
    });
  });
  await new Promise(resolve => http.listen(0, "127.0.0.1", resolve));
  const client = createPlatformClient({
    serverUrl: `http://127.0.0.1:${http.address().port}`,
    getSessionToken: async () => `session-${++tokenCalls}`,
  });
  const builder = client.builder.init({ onError: error => errors.push(error) });
  try {
    builder.subscribe(appId, { onSnapshot: s => { snapshots.push(s.messages[0].id); }, onEvent: vi.fn(), onError: error => errors.push(error) });
    await builder.connect();
    await vi.waitFor(() => expect(snapshots).toEqual(["m1"]));
    peers[0].terminate();
    await vi.waitFor(() => expect(snapshots).toEqual(["m1", "m2"]), { timeout: 6000 });
    // The server expires the session: a session notice, then a server-side disconnect.
    send(peers[1], "session.ended", { room: null, data: { reason: "expired" } });
    peers[1].send("41");
    await vi.waitFor(() => expect(snapshots).toEqual(["m1", "m2", "m3"]), { timeout: 6000 });
    expect(joins).toEqual([[room], [room], [room]]);
    expect(handshakes.map(item => item.token)).toEqual(["session-1", "session-1", "session-2"]);
    for (const { url } of handshakes) {
      expect(url.pathname).toBe("/ws/socket.io/");
      expect(url.searchParams.get("transport")).toBe("websocket");
      expect([...url.searchParams.keys()].some(key => /token/i.test(key))).toBe(false);
    }
    expect(errors).toEqual([]);
  } finally {
    builder.close();
    for (const peer of peers) peer.terminate();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => http.close(resolve));
  }
});
