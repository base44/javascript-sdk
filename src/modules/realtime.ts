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

          // startClosed: don't connect until we have a token
          const ws = new PartySocket({
            host: config.dispatcherWsUrl,
            party: handlerName,
            room: instanceId,
            startClosed: true,
          });

          activeSockets.set(key, ws);

          ws.addEventListener("message", (ev) => {
            try {
              callback(JSON.parse(ev.data));
            } catch {
              // ignore malformed
            }
          });

          // Fetch token then open; re-fetch on every close (token expires in 30s)
          const connect = async () => {
            if (activeSockets.get(key) !== ws) return;
            try {
              const token = await config.getToken(handlerName, instanceId);
              ws.updateProperties({ party: handlerName, room: instanceId, query: { token } });
              ws.reconnect();
            } catch {
              // retry on next close
            }
          };

          ws.addEventListener("close", () => connect());
          connect();

          return () => {
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
