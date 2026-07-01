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

          ws.addEventListener("message", (ev) => {
            try {
              callback(JSON.parse(ev.data));
            } catch {
              // ignore malformed
            }
          });

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
