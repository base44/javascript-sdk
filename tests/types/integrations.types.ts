import type { SendEmailParams } from "../../src/index.js";

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

void bodyOnly;
void htmlOnly;
void textOnly;
void htmlAndText;
void bodyAndText;
void withFromName;
