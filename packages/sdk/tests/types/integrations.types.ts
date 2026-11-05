import type { Base44Client } from "../../src/index.js";

declare const base44: Base44Client;

// Existing body-only callers keep compiling.
base44.integrations.Core.SendEmail({
  to: "user@example.com",
  subject: "Hello",
  body: "<p>Hello</p>",
  from_name: "My App",
});

// html and text each work alone, and together they send both versions.
base44.integrations.Core.SendEmail({ to: "user@example.com", subject: "Hello", text: "Hello" });
base44.integrations.Core.SendEmail({
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
});

// An attachment is either an uploaded file or inline base64 content.
base44.integrations.Core.SendEmail({
  to: "user@example.com",
  subject: "Invoice",
  html: "<p>See attached.</p>",
  attachments: [
    { filename: "logo.png", file_url: "https://example.com/logo.png" },
    { filename: "invoice.pdf", content: "JVBERi0x" },
  ],
});
