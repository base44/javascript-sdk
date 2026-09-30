import type { ExperimentAssignment } from "./experiments-runtime.types.js";
import type { ExperimentsConfig, ExperimentsIdentity } from "./experiments-config.types.js";

function bucket(parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(parts.join(":"))) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash % 100;
}

/**
 * Evaluates flags locally without storage, network, clock, or browser globals.
 * The same config and identity always produce the same assignments.
 * This controls presentation, never authorization or access to data.
 */
export function evaluateExperiments(
  config: ExperimentsConfig,
  identity: ExperimentsIdentity,
  preview: Readonly<Record<string, boolean>> = {},
): { flags: Record<string, boolean>; assignments: ExperimentAssignment[] } {
  const flags: Record<string, boolean> = Object.fromEntries(
    config.flags.map((flag) => [
      flag.key,
      bucket(["rollout", config.app_id, flag.key, identity.visitorId]) < flag.rollout_percentage,
    ]),
  );
  const assignments: ExperimentAssignment[] = [];
  for (const experiment of config.experiments) {
    if (Object.prototype.hasOwnProperty.call(preview, experiment.flag_key)) continue;
    const key = experiment.assign_by === "user" ? identity.userId : identity.visitorId;
    if (!key || bucket(["enroll", config.app_id, experiment.id, experiment.run_version, key]) >= experiment.traffic_allocation) continue;
    const value = bucket(["variant", config.app_id, experiment.id, experiment.run_version, key]);
    let total = 0;
    let variant = experiment.variants[experiment.variants.length - 1];
    for (const candidate of experiment.variants) {
      total += candidate.weight;
      if (value < total) {
        variant = candidate;
        break;
      }
    }
    flags[experiment.flag_key] = variant.value;
    assignments.push({
      experiment_id: experiment.id,
      flag_key: experiment.flag_key,
      run_version: experiment.run_version,
      variant_key: variant.key,
      preview: false,
    });
  }
  return { flags: { ...flags, ...preview }, assignments };
}
