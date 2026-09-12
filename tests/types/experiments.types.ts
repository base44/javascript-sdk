import type { Base44Client, ExperimentsModule, ExperimentsSnapshot } from "../../src/index.js";

declare const client: Base44Client;
const experiments: ExperimentsModule = client.experiments;
const enabled: boolean = experiments.isEnabled("checkout", false);
const snapshot: ExperimentsSnapshot = experiments.getSnapshot();
const ready: Promise<ExperimentsSnapshot> = experiments.ready();
const unsubscribe: () => void = experiments.subscribe(() => {});
const serverSnapshot: ExperimentsSnapshot = experiments.getServerSnapshot();
const delivered: Promise<void> = experiments.flush();
// @ts-expect-error Fallbacks are boolean, not variant names.
experiments.isEnabled("checkout", "control");
// @ts-expect-error Snapshots cannot override platform evaluations.
snapshot.flags.checkout = true;
// @ts-expect-error Identity is managed by auth, not a public caller-supplied user ID.
experiments.setUser("user-1");
// @ts-expect-error Browser experiments are unavailable to service-role clients.
client.asServiceRole.experiments;
void [enabled, snapshot, ready, unsubscribe, serverSnapshot, delivered];
