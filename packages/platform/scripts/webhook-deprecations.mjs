// Reads which event types the outbound webhooks OpenAPI marks deprecated, for generate-webhook-types.mjs.
// Base44 marks a deprecated event's webhook operation `deprecated: true` and describes it in
// `x-deprecation`: `{ replaced_by, effective, sunset? }`, dates as YYYY-MM-DD.

// The `@deprecated` text for each deprecated event type in `openapi`, by type.
export function deprecations(openapi) {
  const notes = {};
  for (const [type, item] of Object.entries(openapi.webhooks ?? {})) {
    const operation = item.post;
    if (!operation?.deprecated) continue;
    const { replaced_by: replacedBy, effective, sunset } = operation["x-deprecation"] ?? {};
    let note = "@deprecated";
    if (effective) note += ` Since ${effective}`;
    if (replacedBy) note += `${effective ? ";" : ""} use \`${replacedBy}\``;
    note += ".";
    if (sunset) note += ` Base44 stops sending it on ${sunset}.`;
    notes[type] = note.replace(/\*\//g, "* /");
  }
  return notes;
}
