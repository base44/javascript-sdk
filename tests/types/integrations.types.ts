import type { SendEmailParams, EmailAttachment } from "../../src/index.js";

// body-only (existing callers must still compile — backward compat)
const bodyOnly = {
  to: "user@example.com",
  subject: "Hello",
  body: "<p>Hello</p>",
} satisfies SendEmailParams;

// html-only
const htmlOnly = {
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
} satisfies SendEmailParams;

// text-only
const textOnly = {
  to: "user@example.com",
  subject: "Hello",
  text: "Hello",
} satisfies SendEmailParams;

// html + text → multipart/alternative
const htmlAndText = {
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
} satisfies SendEmailParams;

// body + text → multipart/alternative
const bodyAndText = {
  to: "user@example.com",
  subject: "Hello",
  body: "<p>Hello</p>",
  text: "Hello",
} satisfies SendEmailParams;

// optional from_name
const withFromName = {
  to: "user@example.com",
  subject: "Hello",
  body: "<p>Hello</p>",
  from_name: "My App",
} satisfies SendEmailParams;

// attachments: inline base64
const inlineAttachment = {
  filename: "receipt.pdf",
  content: "JVBERi0x",
} satisfies EmailAttachment;

// attachments: storage reference
const storedAttachment = {
  filename: "logo.png",
  file_url: "https://storage.example.com/logo.png",
} satisfies EmailAttachment;

// with attachments on a full params object
const withAttachments = {
  to: "user@example.com",
  subject: "Invoice",
  body: "<p>See attached.</p>",
  attachments: [inlineAttachment, storedAttachment],
} satisfies SendEmailParams;

// omitting all three content fields must be a compile error
// @ts-expect-error At least one of body/html/text is required.
const missingContent: SendEmailParams = { to: "user@example.com", subject: "Hello" };

void bodyOnly;
void htmlOnly;
void textOnly;
void htmlAndText;
void bodyAndText;
void withFromName;
void inlineAttachment;
void storedAttachment;
void withAttachments;
void missingContent;
