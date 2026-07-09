import PartySocket from "partysocket";

// Module-level map: "ActorName:instanceId" → active socket
const activeSockets = new Map<string, PartySocket>();

function socketKey(actorName: string, instanceId: string) {
  return `${actorName}:${instanceId}`;
}

export function createActorsModule(config: {
  appId: string;
  getToken(actorName: string, instanceId: string, connId: string): Promise<string>;
  dispatcherWsUrl: string;
  /** WebSocket implementation for runtimes without a global one (Node < 22). */
  webSocketImpl?: unknown;
}) {
  return new Proxy({} as Record<string, ActorClient>, {
    get(_, actorName: string) {
      return {
        subscribe(
          instanceId: string,
          callback: (data: unknown) => void,
          options?: { id?: string },
        ): ActorSubscription {
          const key = socketKey(actorName, instanceId);
          // close existing if any
          activeSockets.get(key)?.close();

          // Connection id: caller-supplied (stable — reuse across reconnects/tabs as
          // you see fit) or auto-generated per subscription. It travels INSIDE the
          // signed actor token (never as a WS query param, which proxies strip);
          // the dispatcher forwards the verified claim as partyserver's _pk, so the
          // actor sees this exact value as conn.id. Reconnects re-mint the token
          // with the same id, so conn.id is stable across reconnects.
          const connId = options?.id ?? crypto.randomUUID();

          // query as async fn: called on every (re)connect, fetches a fresh token each time
          const ws = new PartySocket({
            host: config.dispatcherWsUrl,
            party: actorName,
            room: instanceId,
            ...(config.webSocketImpl ? { WebSocket: config.webSocketImpl as any } : {}),
            query: () =>
              config.getToken(actorName, instanceId, connId).then((token) => ({ token })),
          });

          activeSockets.set(key, ws);

          // Heartbeat / half-open detection. PartySocket only reconnects on a
          // browser close/error event, so a silently-dead connection (TCP alive,
          // no data — common behind proxies/LBs) hangs until the OS idle timeout
          // (~60s). We ping periodically and force a reconnect if nothing comes
          // back within DEAD_MS, cutting detection from ~60s to a few seconds.
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
            // Swallow platform messages — never surface them to the app.
            const msgType = data && typeof data === "object" ? (data as { type?: unknown }).type : undefined;
            if (msgType === "__pong") return;
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

          return {
            id: connId,  // the connection id (same value the actor sees as conn.id)
            unsubscribe() {
              clearInterval(heartbeat);
              activeSockets.delete(key);
              ws.close();
            },
          };
        },
        send(instanceId: string, data: unknown) {
          const key = socketKey(actorName, instanceId);
          const ws = activeSockets.get(key);
          if (!ws) throw new Error(`No active subscription for ${actorName}:${instanceId}`);
          ws.send(JSON.stringify(data));
        },
      };
    },
  });
}

/** Handle for an active actor subscription. */
interface ActorSubscription {
  /** This connection's id — the same value the actor receives as `conn.id`. */
  id: string;
  /** Close the subscription and its underlying socket. */
  unsubscribe(): void;
}

interface ActorClient {
  subscribe(
    instanceId: string,
    callback: (data: unknown) => void,
    options?: { id?: string },
  ): ActorSubscription;
  send(instanceId: string, data: unknown): void;
}
