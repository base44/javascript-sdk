import { createServerFn } from "@tanstack/react-start";

function loadInvoice(invoice) {
  return invoice.amount.toFixed(2);
}

export const sendInvoice = createServerFn({ method: "POST" }).handler(async () => {
  return loadInvoice(undefined);
});

export const ok = createServerFn({ method: "POST" }).handler(async () => "fine");
