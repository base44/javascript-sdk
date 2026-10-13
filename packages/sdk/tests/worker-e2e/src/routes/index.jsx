import { createFileRoute } from "@tanstack/react-router";
import { ok, sendInvoice } from "@/server-fns";

// Prints the server functions' URLs, so the test can call them the way the client does.
export const Route = createFileRoute("/")({
  component: () => (
    <main>
      <pre id="send-invoice">{sendInvoice.url}</pre>
      <pre id="ok">{ok.url}</pre>
    </main>
  ),
});
