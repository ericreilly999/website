// Unit tests for the contact_form Lambda handler honeypot (backlog B-Q43-04).
//
// Spec (dispatch for B-Q43-04, backlog acceptance bullet 2):
//   - A non-empty string in the `website` field marks the submit as a bot.
//     The handler returns the SAME success response a real submit gets and
//     sends no email.
//   - When `website` is absent or empty, the submit sends normally.
//   - The response shape (statusCode, headers, body) is unchanged.
//
// RULE-7, mock layer: `@aws-sdk/client-sesv2` is replaced with an in-memory
// fake through a Node module resolve hook, so no AWS call and no credentials
// are needed. Blind spots this layer cannot catch: SES IAM permissions, the
// verified FROM identity, SES sandbox recipient limits, API Gateway
// throttling and CORS preflight, and whether the deployed Lambda actually runs
// this source. The live Playwright case in e2e/contact-honeypot.spec.js
// covers the real API boundary for the bot path.
//
// Run: npm run test:unit (node --test test/unit/contact-form-handler.test.mjs)
// CONTACT_HANDLER may point at another copy of the handler (used to prove these
// tests fail against a handler without the honeypot).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const handlerPath =
  process.env.CONTACT_HANDLER ||
  path.resolve(here, "../../terraform/modules/contact_form/src/index.mjs");

// --- SES fake ---------------------------------------------------------------
const fake = { sends: [], failWith: null };
globalThis.__sesFake = fake;

const FAKE_SES_SOURCE = `
export class SendEmailCommand { constructor(input) { this.input = input; } }
export class SESv2Client {
  constructor(config) { this.config = config; }
  async send(command) {
    const f = globalThis.__sesFake;
    f.sends.push(command);
    if (f.failWith) { const e = new Error(f.failWith); e.name = f.failWith; throw e; }
    return { MessageId: "fake-message-id" };
  }
}
`;
const FAKE_SES_URL = "data:text/javascript," + encodeURIComponent(FAKE_SES_SOURCE);

// module.register (Node >= 20.6, the CI version) rather than registerHooks
// (Node >= 22.15) so the same file runs in PR Checks and locally.
const HOOKS_SOURCE = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@aws-sdk/client-sesv2") {
    return { url: ${JSON.stringify(FAKE_SES_URL)}, format: "module", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS_SOURCE));

// The handler reads these at module load, so set them before importing it.
const ALLOWED = "https://ericreilly.com";
process.env.TO_EMAIL = "inbox@example.test";
process.env.FROM_EMAIL = "noreply@example.test";
process.env.ALLOWED_ORIGINS = `${ALLOWED},https://prompted.ericreilly.com`;

const { handler } = await import(pathToFileURL(handlerPath).href);

// --- fixtures (oracle values come from the spec and the page payloads) -------
const SUCCESS_BODY = { message: "Message sent. I will get back to you soon." };

const contactPayload = (extra = {}) => ({
  name: "Test User",
  email: "test@example.com",
  company: "Acme",
  project: "Cut our cloud bill",
  need: "Cloud & reliability",
  term: "1 month",
  ...extra,
});

const promptedPayload = (extra = {}) => ({
  message: "New Prompt Submission from Prompted: Tech Talks\n\nPrompt Topic: test topic",
  ...extra,
});

const event = (payload, origin = ALLOWED) => ({
  headers: origin ? { origin } : {},
  body: JSON.stringify(payload),
});

beforeEach(() => {
  fake.sends.length = 0;
  fake.failWith = null;
});

// --- honeypot filled: silent success, no email --------------------------------

test("honeypot_filled_contact_payload_returns_200_success_message_and_sends_no_email", async () => {
  const res = await handler(event(contactPayload({ website: "http://spam.example" })));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), SUCCESS_BODY);
  assert.equal(fake.sends.length, 0, "a filled honeypot must not reach SES");
});

test("honeypot_filled_prompted_payload_returns_200_success_message_and_sends_no_email", async () => {
  const res = await handler(event(promptedPayload({ website: "buy-now" })));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), SUCCESS_BODY);
  assert.equal(fake.sends.length, 0, "a filled honeypot must not reach SES");
});

test("honeypot_filled_single_character_is_treated_as_bot_and_sends_no_email", async () => {
  // Boundary: the shortest non-empty string.
  const res = await handler(event(contactPayload({ website: "x" })));
  assert.equal(res.statusCode, 200);
  assert.equal(fake.sends.length, 0);
});

test("honeypot_filled_response_is_byte_identical_to_a_real_submit_response_for_allowed_origin", async () => {
  const real = await handler(event(contactPayload({ website: "" })));
  assert.equal(fake.sends.length, 1, "control: the real submit must send");
  const bot = await handler(event(contactPayload({ website: "http://spam.example" })));
  assert.equal(fake.sends.length, 1, "the bot submit must not add a send");
  // Same status, same headers (Content-Type, CORS, Vary), same body string,
  // and no extra keys on the result object, so a bot cannot tell them apart.
  assert.deepEqual(bot, real);
  assert.deepEqual(Object.keys(bot).sort(), ["body", "headers", "statusCode"]);
  assert.equal(bot.headers["Access-Control-Allow-Origin"], ALLOWED);
  assert.equal(bot.headers["Content-Type"], "application/json");
});

test("honeypot_filled_response_is_identical_to_a_real_submit_response_without_origin", async () => {
  const real = await handler(event(promptedPayload(), null));
  const bot = await handler(event(promptedPayload({ website: "spam" }), null));
  assert.deepEqual(bot, real);
  assert.equal(bot.headers["Access-Control-Allow-Origin"], undefined);
  assert.equal(fake.sends.length, 1, "only the real submit sends");
});

test("honeypot_filled_sends_no_email_even_when_ses_would_fail", async () => {
  // If the handler called SES for a bot, this would surface as a 500.
  fake.failWith = "MessageRejected";
  const res = await handler(event(contactPayload({ website: "http://spam.example" })));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), SUCCESS_BODY);
  assert.equal(fake.sends.length, 0);
});

// --- honeypot empty or absent: normal send -----------------------------------

test("honeypot_empty_string_contact_payload_sends_one_email_and_returns_200", async () => {
  const res = await handler(event(contactPayload({ website: "" })));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), SUCCESS_BODY);
  assert.equal(fake.sends.length, 1);
  const input = fake.sends[0].input;
  assert.deepEqual(input.Destination.ToAddresses, ["inbox@example.test"]);
  assert.equal(input.Content.Simple.Subject.Data, "Website contact from Test User");
  assert.match(input.Content.Simple.Body.Text.Data, /Cut our cloud bill/);
});

test("honeypot_absent_contact_payload_sends_one_email_and_returns_200", async () => {
  const res = await handler(event(contactPayload()));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), SUCCESS_BODY);
  assert.equal(fake.sends.length, 1);
});

test("honeypot_empty_string_prompted_payload_sends_one_email_and_returns_200", async () => {
  const res = await handler(event(promptedPayload({ website: "" })));
  assert.equal(res.statusCode, 200);
  assert.equal(fake.sends.length, 1);
  assert.equal(fake.sends[0].input.Content.Simple.Subject.Data, "Prompted: Tech Talks submission");
});

test("honeypot_absent_prompted_payload_sends_one_email_and_returns_200", async () => {
  const res = await handler(event(promptedPayload()));
  assert.equal(res.statusCode, 200);
  assert.equal(fake.sends.length, 1);
});

test("honeypot_empty_with_ses_failure_still_returns_500_error_message", async () => {
  // The honeypot must not mask real send failures for real users.
  fake.failWith = "MessageRejected";
  const res = await handler(event(contactPayload({ website: "" })));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(res.body), { error: "Failed to send message. Please try again later." });
  assert.equal(fake.sends.length, 1);
});

test("honeypot_empty_with_missing_required_fields_still_returns_400_validation_error", async () => {
  const res = await handler(event({ name: "Only Name", website: "" }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(res.body), { error: "Please complete name, email and project." });
  assert.equal(fake.sends.length, 0);
});
