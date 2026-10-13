import { createFileRoute } from "@tanstack/react-router";

function chargeCard(card) {
  return card.number.slice(-4);
}

export const Route = createFileRoute("/api/boom")({
  server: {
    handlers: {
      GET: async () => Response.json({ last4: chargeCard(null) }),
    },
  },
});
