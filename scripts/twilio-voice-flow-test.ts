/**
 * End-to-end test: mock POST /connector/twilio/voice/incoming (Twilio webhook shape),
 * parse ConversationRelay url + welcomeGreeting from TwiML, then WebSocket to that URL with
 * console-driven { type: "prompt", voicePrompt } messages.
 *
 * Server requirements:
 *   - TWILIO_LOCAL_MEDIA_TEST=true (or 1)
 *   - TWILIO_MEDIA_WEBSOCKET_URL must point at this API (e.g. ws://localhost:3000/connector/twilio/media)
 *   - DB/workflow/team config must resolve for the `to` number like a real inbound call
 *   - If TWILIO_VALIDATE_SIGNATURE=true, set TWILIO_AUTH_TOKEN so the script can send X-Twilio-Signature
 *
 * You will be prompted on the CLI for username (email) and password for POST /auth/login.
 *
 * Usage:
 *   TWILIO_FLOW_TEST_HTTP_URL=http://localhost:3000 npx ts-node scripts/twilio-voice-flow-test.ts +15551234567
 *   npm run test:twilio-voice-flow -- +15551234567
 */

import { config as loadEnv } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as path from "node:path";
import twilio from "twilio";
import * as WebSocket from "ws";

const ENV_FILES = [".env.override", ".env.local", ".env", ".env.aws"];

for (const envFile of ENV_FILES) {
  loadEnv({ path: path.join(__dirname, "..", envFile), quiet: true });
}

function decodeXmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Reads ConversationRelay from inbound-call TwiML (same shape as TwilioVoiceService.buildIncomingTwiML).
 */
function parseConversationRelayFromTwiML(twiml: string): {
  streamUrl: string;
  welcomeGreeting: string;
  runId: string | null;
} {
  const relay = twiml.match(
    /<ConversationRelay\b[^>]*\/?>/i,
  )?.[0];
  if (!relay) {
    throw new Error(
      "TwiML has no <ConversationRelay> — check TWILIO_ENABLED and workflow config for this number.",
    );
  }
  const urlRaw = /\burl="([^"]*)"/.exec(relay)?.[1];
  if (!urlRaw?.trim()) {
    throw new Error("TwiML <ConversationRelay> missing url attribute.");
  }
  const greetingRaw = /\bwelcomeGreeting="([^"]*)"/.exec(relay)?.[1] ?? "";
  const streamUrl = decodeXmlAttr(urlRaw);
  const welcomeGreeting = decodeXmlAttr(greetingRaw);
  let runId: string | null = null;
  try {
    runId = new URL(streamUrl).searchParams.get("runId");
  } catch {
    // ignore
  }
  return { streamUrl, welcomeGreeting, runId };
}

function httpBase(): string {
  const u =
    process.env.TWILIO_FLOW_TEST_HTTP_URL?.trim() ||
    process.env.TWILIO_TEST_HTTP_URL?.trim() ||
    "http://localhost:4000";
  return u.replace(/\/$/, "");
}

const VOICE_INCOMING_PATH = "/connector/twilio/voice/incoming";

/**
 * Same shape Twilio POSTs as application/x-www-form-urlencoded to POST .../incoming
 * (see TwilioVoiceController.incoming + TwilioVoiceService.assertValidTwilioRequest).
 */
function mockTwilioVoiceIncomingForm(
  toE164: string,
  fromE164?: string,
): Record<string, string> {
  const from =
    fromE164?.trim() ||
    process.env.TWILIO_TEST_FROM_NUMBER?.trim() ||
    "+15550000001";
  const accountSid =
    process.env.TWILIO_ACCOUNT_SID?.trim() ||
    "AC00000000000000000000000000000000";
  return {
    To: toE164,
    From: from,
    CallSid: `CAflowtest${Date.now()}`,
    AccountSid: accountSid,
    ApiVersion: "2010-04-01",
    Direction: "inbound",
    CallStatus: "ringing",
  };
}

/**
 * POST the incoming voice webhook like Twilio: form body + optional X-Twilio-Signature.
 */
async function postVoiceIncomingWebhook(
  base: string,
  form: Record<string, string>,
): Promise<Response> {
  const root = base.replace(/\/$/, "");
  const url = `${root}${VOICE_INCOMING_PATH}`;
  const webhookUrlForSigning = url.split("?")[0];
  const body = new URLSearchParams(form).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "TwilioProxy/1.1",
  };
  const validate = process.env.TWILIO_VALIDATE_SIGNATURE;
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if ((validate === "true" || validate === "1") && token) {
    headers["X-Twilio-Signature"] = twilio.getExpectedTwilioSignature(
      token,
      webhookUrlForSigning,
      form,
    );
  }
  return fetch(url, { method: "POST", headers, body });
}

function bearerHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function login(username: string, password: string): Promise<string> {
  if (!username) {
    throw new Error("Username is required.");
  }
  const url = new URL("/auth/login", httpBase());
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("login response missing access_token");
  }
  return data.access_token;
}

function attachWsHandlers(ws: WebSocket): void {
  ws.on("message", (data: WebSocket.RawData) => {
    let msg: { type?: string; token?: string; last?: boolean };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === "text") {
      const piece = msg.token ?? "";
      process.stdout.write(piece);
      if (msg.last) {
        process.stdout.write("\n");
      }
    }
  });
  ws.on("close", (code, reason) => {
    console.error(`\n[ws closed] ${code} ${reason.toString()}`);
  });
  ws.on("error", (err) => {
    console.error("[ws error]", err);
  });
}

async function main(): Promise<void> {
  const calledTo =
    process.argv
      .slice(2)
      .find((a) => !a.startsWith("-"))
      ?.trim() || process.env.TWILIO_TEST_CALLED_NUMBER?.trim();
  if (!calledTo) {
    console.error(
      "Usage: ts-node scripts/twilio-voice-flow-test.ts <E.164 to-number>\n" +
        "Or set TWILIO_TEST_CALLED_NUMBER. Server needs TWILIO_LOCAL_MEDIA_TEST=true.",
    );
    process.exit(1);
  }

  const loginRl = createInterface({ input, output });
  const username = (await loginRl.question("Username (email): ")).trim();
  const password = await loginRl.question("Password: ");
  loginRl.close();

  const base = httpBase();

  console.log(`\nLogging in at ${base} ...`);
  const accessToken = await login(username, password);
  console.log("Login OK.\n");

  const incomingForm = mockTwilioVoiceIncomingForm(calledTo);
  console.log(
    `POST ${VOICE_INCOMING_PATH} (mock Twilio webhook, form fields: ${Object.keys(incomingForm).join(", ")}) ...`,
  );
  const incomingRes = await postVoiceIncomingWebhook(base, incomingForm);
  const incomingText = await incomingRes.text();
  if (!incomingRes.ok) {
    throw new Error(
      `incoming webhook failed ${incomingRes.status}: ${incomingText.slice(0, 500)}`,
    );
  }

  console.log(`incoming TwiML (${incomingText.length} chars):\n${incomingText}\n`);

  const relay = parseConversationRelayFromTwiML(incomingText);
  if (relay.runId) {
    console.log(`runId=${relay.runId}`);
  }
  console.log(`Greeting (ConversationRelay): ${relay.welcomeGreeting}`);
  console.log(`Connecting WebSocket (from TwiML url): ${relay.streamUrl}\n`);

  const ws = new WebSocket(relay.streamUrl, {
    headers: bearerHeaders(accessToken),
  });
  attachWsHandlers(ws);

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

  const rl = createInterface({ input, output });
  console.log(
    "Type user utterances (sent as Twilio-style prompts). Commands: /exit, /interrupt\n",
  );

  try {
    let done = false;
    while (!done) {
      const line = (await rl.question("You: ")).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") {
        done = true;
        break;
      }
      if (line === "/interrupt") {
        ws.send(JSON.stringify({ type: "interrupt" }));
        continue;
      }
      ws.send(JSON.stringify({ type: "prompt", voicePrompt: line }));
    }
  } finally {
    rl.close();
    ws.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
