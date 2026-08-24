import type {
  ActorConnectOptions,
  ActorConnectionError,
  ActorConnectionIdentity,
  ActorSubscription,
  Connection,
  Conn,
} from "../../src/index.js";

const authenticated: ActorConnectionIdentity = {
  type: "authenticated",
  userId: "user-1",
};

const anonymous: ActorConnectionIdentity = {
  type: "anonymous",
  anonymousId: "browser-1",
};

declare const connection: Conn;

if (connection.identity?.type === "authenticated") {
  connection.identity.userId satisfies string;
} else if (connection.identity?.type === "anonymous") {
  connection.identity.anonymousId satisfies string;
}

// @ts-expect-error Authenticated identities require a userId.
const missingUserId: ActorConnectionIdentity = { type: "authenticated" };

// @ts-expect-error Verified identity fields are readonly.
authenticated.userId = "user-2";

authenticated satisfies ActorConnectionIdentity;
anonymous satisfies ActorConnectionIdentity;
missingUserId satisfies ActorConnectionIdentity;

const connectOptions: ActorConnectOptions = {
  onError(error) {
    error satisfies ActorConnectionError;
    error.actorName satisfies string;
    error.instanceId satisfies string;
    error.connectionId satisfies string;
    error.closeCode satisfies number | undefined;
    error.closeReason satisfies string | undefined;
  },
};

declare const clientConnection: Connection;
clientConnection.closed satisfies boolean;
clientConnection.addErrorListener((error) => {
  error satisfies ActorConnectionError;
}) satisfies ActorSubscription;
connectOptions satisfies ActorConnectOptions;
