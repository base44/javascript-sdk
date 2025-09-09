/**
 * Extracts the snapshot ID or environment type from the current hostname
 * Used to determine which backend function deployment to call
 *
 * @returns {string} The snapshot ID for checkpoints, 'preview' for preview URLs, or 'prod' for production
 */
export function extractSnapshotIdFromHost(): string {
  if (typeof window === "undefined") {
    return "prod";
  }

  const hostname = window.location.hostname;

  // Check if it's a checkpoint URL
  if (hostname.startsWith("checkpoint--")) {
    // Format: checkpoint--{app_id}--{snapshot_id}.domain
    const parts = hostname.split("--");
    if (parts.length >= 3) {
      // Extract snapshot_id (last part before the domain)
      const snapshotPart = parts[2];
      // Remove domain extension if present
      const snapshotId = snapshotPart.split(".")[0];
      return snapshotId;
    }
  }

  // Check if it's a preview URL
  if (hostname.startsWith("preview--")) {
    return "preview";
  }

  // Production URLs - return "prod"
  return "prod";
}