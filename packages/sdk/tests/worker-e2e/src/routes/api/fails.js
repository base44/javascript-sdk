import { createFileRoute } from "@tanstack/react-router";

// A route that answers its own 5xx, in the SSO examples' shape.
export const Route = createFileRoute("/api/fails")({
  server: {
    handlers: {
      GET: async () => Response.json({ error: "Internal server error", details: "Calendar token expired" }, { status: 502 }),
    },
  },
});
