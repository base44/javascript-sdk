import PartySocket from "partysocket";

// Module-level map: "HandlerName:instanceId" → active socket
const activeSockets = new Map<string, PartySocket>();

function socketKey(handlerName: string, instanceId: string) {
  return `${handlerName}:${instanceId}`;
}

export function createRealtimeModule(config: {
  appId: string;
  getToken(handlerName: string, instanceId: string): Promise<string>;
  dispatcherWsUrl: string;
}) {
  return new Proxy({} as Record<string, RealtimeHandler>, {
    get(_, handlerName: string) {
      return {
        subscribe(instanceId: string, callback: (data: unknown) => void): () => void {
          const key = socketKey(handlerName, instanceId);
          // close existing if any
          activeSockets.get(key)?.close();

          // query as async fn: called on every (re)connect, fetches a fresh token each time
          const ws = new PartySocket({
            host: config.dispatcherWsUrl,
            party: handlerName,
            room: instanceId,
            query: () => config.getToken(handlerName, instanceId).then((token) => ({ token })),
          });

          activeSockets.set(key, ws);

          // Heartbeat / half-open detection. PartySocket only reconnects on a
          // browser close/error event, so a silently-dead connection (TCP alive,
          // no data — common behind proxies/LBs) hangs until the OS idle timeout
          // (~60s). We ping periodically and force a reconnect if nothing comes
          // back within DEAD_MS, cutting detection from ~60s to a few seconds.
          // Pairs with the handler's setWebSocketAutoResponse("__ping"→"__pong"),
          // so idle handlers (no app broadcasts) still keep the connection proven.
          const PING_MS = 1_000;
          const DEAD_MS = 3_000;
          let lastMsg = Date.now();
          const bumpAlive = () => { lastMsg = Date.now(); };

          ws.addEventListener("open", bumpAlive);
          ws.addEventListener("message", (ev) => {
            bumpAlive();
            let data: unknown;
            try {
              data = JSON.parse(ev.data);
            } catch {
              return; // ignore malformed
            }
            // Swallow heartbeat acks — never surface them to the app.
            if (data && typeof data === "object" && (data as { type?: unknown }).type === "__pong") return;
            callback(data);
          });

          const heartbeat = setInterval(() => {
            if (Date.now() - lastMsg > DEAD_MS) {
              bumpAlive(); // avoid a reconnect storm while the new socket comes up
              ws.reconnect();
              return;
            }
            try {
              ws.send(JSON.stringify({ type: "__ping" }));
            } catch {
              // socket not open; the watchdog above will force a reconnect
            }
          }, PING_MS);

          return () => {
            clearInterval(heartbeat);
            activeSockets.delete(key);
            ws.close();
          };
        },
        send(instanceId: string, data: unknown) {
          const key = socketKey(handlerName, instanceId);
          const ws = activeSockets.get(key);
          if (!ws) throw new Error(`No active subscription for ${handlerName}:${instanceId}`);
          ws.send(JSON.stringify(data));
        },
      };
    },
  });
}

interface RealtimeHandler {
  subscribe(instanceId: string, callback: (data: unknown) => void): () => void;
  send(instanceId: string, data: unknown): void;
}
