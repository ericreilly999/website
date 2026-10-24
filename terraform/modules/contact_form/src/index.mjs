import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({});

const TO_EMAIL = process.env.TO_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
const MAX_FIELD = 5000;

function respond(statusCode, body, origin) {
  const headers = { "Content-Type": "application/json" };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return { statusCode, headers, body: JSON.stringify(body) };
}

const clean = (v) => (typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "");
const oneLine = (v) => clean(v).replace(/[\r\n]+/g, " ");

export const handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Invalid JSON body." }, origin);
  }

  // Two payload shapes are in use: the contact page sends
  // { name, email, company, project, need, term }; prompted.ericreilly.com
  // sends { message }.
  const message = clean(data.message);
  const name = oneLine(data.name);
  const email = oneLine(data.email);
  const company = oneLine(data.company);
  const project = clean(data.project);
  const term = oneLine(data.term);
  const need = oneLine(data.need);

  let subject;
  let text;
  if (message) {
    subject = "Prompted: Tech Talks submission";
    text = message;
  } else if (name && email && project) {
    subject = `Website contact from ${name}`;
    text = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company}`,
      `Need: ${need}`,
      `Term: ${term}`,
      "",
      project,
    ].join("\n");
  } else {
    return respond(400, { error: "Please complete name, email and project." }, origin);
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const replyTo = emailRe.test(email) ? [email] : undefined;

  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM_EMAIL,
        Destination: { ToAddresses: [TO_EMAIL] },
        ReplyToAddresses: replyTo,
        Content: {
          Simple: {
            Subject: { Data: subject.slice(0, 200), Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } },
          },
        },
      }),
    );
  } catch (err) {
    console.error("SES send failed", err.name);
    return respond(500, { error: "Failed to send message. Please try again later." }, origin);
  }

  return respond(200, { message: "Message sent. I will get back to you soon." }, origin);
};
