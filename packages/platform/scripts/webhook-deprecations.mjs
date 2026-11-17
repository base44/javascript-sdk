// Reads which event types the outbound webhooks OpenAPI marks deprecated, for generate-webhook-types.mjs.
// Base44 marks a deprecated event's webhook operation `deprecated: true` and describes it in
// `x-deprecation`: `{ replaced_by, effective, sunset? }`, dates as YYYY-MM-DD.

// The deprecation notice for each event type, by type. `previous` is the committed
// scripts/webhook-deprecations.json: a type that has left the spec keeps its last notice, since the
// SDK keeps its type (see sync-webhook-event-types.mjs).
export function deprecations(openapi, previous = {}) {
  const webhooks = openapi.webhooks ?? {};
  const notes = Object.fromEntries(Object.entries(previous).filter(([type]) => !(type in webhooks)));
  for (const [type, item] of Object.entries(webhooks)) {
    const operation = item.post;
    if (!operation?.deprecated) continue;
    const { replaced_by: replacedBy, effective, sunset } = operation["x-deprecation"] ?? {};
    let note = "Deprecated";
    if (effective) note += ` from ${effective}`;
    if (replacedBy) note += `${effective ? ";" : ""} use \`${replacedBy}\``;
    note += ".";
    if (sunset) note += ` Base44 stops sending it on ${sunset}.`;
    notes[type] = note.replace(/\*\//g, "* /");
  }
  return notes;
}
