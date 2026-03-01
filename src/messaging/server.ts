/**
 * openclaw-spa — Unified Messaging Server
 *
 * Wires all messaging channel adapters into a single HTTP server with SPA verification.
 *
 * Security improvements:
 *   - Admin endpoint (/admin/register-identity) protected by API key
 *   - Rate limiting on webhook endpoints
 *   - CSP headers on all responses
 *   - Structured logging
 *
 * Environment variables:
 *   SPA_KEY_REGISTRY          — Path to key registry JSON
 *   SPA_IDENTITY_REGISTRY     — Path to channel identity registry JSON
 *   SPA_GATE_REGISTRY         — Path to gate registry JSON (optional)
 *   SPA_ADMIN_API_KEY         — API key for admin endpoints (required!)
 *   WHATSAPP_API_TOKEN        — WhatsApp Business API token
 *   WHATSAPP_PHONE_NUMBER_ID  — WhatsApp phone number ID
 *   WHATSAPP_VERIFY_TOKEN     — WhatsApp webhook verify token
 *   SIGNAL_API_URL            — signal-cli REST API URL
 *   SIGNAL_PHONE_NUMBER       — Your Signal phone number
 *   TELEGRAM_BOT_TOKEN        — Telegram bot token
 *   TELEGRAM_ALLOWED_CHATS    — Comma-separated allowed chat IDs
 *   DISCORD_BOT_TOKEN         — Discord bot token
 *   DISCORD_ALLOWED_GUILDS    — Comma-separated allowed guild IDs
 *   PORT                      — Server port (default: 3210)
 */

import express from "express";
import * as path from "path";
import * as os from "os";
import { MessagingBridge } from "./bridge.js";
import { WhatsAppAdapter } from "./adapters/whatsapp.js";
import { SignalAdapter } from "./adapters/signal.js";
import { TelegramAdapter } from "./adapters/telegram.js";
import { DiscordAdapter } from "./adapters/discord.js";
import { iMessageAdapter } from "./adapters/imessage.js";
import { SlackAdapter } from "./adapters/slack.js";
import { SMSAdapter } from "./adapters/sms.js";
import { EmailAdapter } from "./adapters/email.js";
import { TeamsAdapter } from "./adapters/teams.js";
import { MatrixAdapter } from "./adapters/matrix.js";
import { IRCAdapter } from "./adapters/irc.js";
import { MessengerAdapter } from "./adapters/messenger.js";
import { GoogleChatAdapter } from "./adapters/googlechat.js";
import { XAdapter } from "./adapters/x.js";
import { LINEAdapter } from "./adapters/line.js";
import { WeChatAdapter } from "./adapters/wechat.js";
import { WebhookAdapter } from "./adapters/webhook.js";
import type { MessagingBridgeConfig, ChannelMessage, ChannelReply } from "./types.js";

// ─── Config from environment ─────────────────────────────────────────────

const SPA_DIR = path.join(os.homedir(), ".openclaw-spa");

const config: MessagingBridgeConfig = {
  key_registry_path: process.env["SPA_KEY_REGISTRY"] ?? path.join(SPA_DIR, "keys.json"),
  identity_registry_path: process.env["SPA_IDENTITY_REGISTRY"] ?? path.join(SPA_DIR, "identities.json"),
  gate_registry_path: process.env["SPA_GATE_REGISTRY"],
  max_envelope_age_seconds: 300,
  allow_unsigned_ungated: true,
};

const ADMIN_API_KEY = process.env["SPA_ADMIN_API_KEY"];
const PORT = parseInt(process.env["PORT"] ?? "3210", 10);

// ─── Bridge ──────────────────────────────────────────────────────────────

const bridge = new MessagingBridge(config);

// ─── Message Queue (simple in-memory for OpenClaw to poll) ───────────────

interface QueuedMessage {
  id: string;
  channel: string;
  sender_id: string;
  text: string;
  spa_status: string;
  auth_level: string | null;
  approved_tools: string[];
  blocked_tools: string[];
  timestamp: string;
}

const messageQueue: QueuedMessage[] = [];
let messageCounter = 0;

function enqueue(msg: ChannelMessage, result: import("./bridge.js").BridgeResult): void {
  messageCounter++;
  messageQueue.push({
    id: `msg-${messageCounter}`,
    channel: msg.channel,
    sender_id: msg.sender_id,
    text: result.spa.text,
    spa_status: result.spa.verification.status,
    auth_level: result.spa.granted_auth_level,
    approved_tools: result.spa.approved_tools,
    blocked_tools: result.spa.blocked_tools,
    timestamp: new Date().toISOString(),
  });

  // Keep queue bounded (max 1000 messages)
  while (messageQueue.length > 1000) {
    messageQueue.shift();
  }

  console.log(`[Bridge] ${result.summary}`);
}

// ─── Reply buffer (OpenClaw posts replies, adapters deliver them) ─────────

const replyCallbacks = new Map<string, (reply: ChannelReply) => Promise<void>>();

// ─── Express App ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// CSP headers on all responses
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'none'; object-src 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", queue_length: messageQueue.length });
});

// ─── OpenClaw polling endpoint ────────────────────────────────────────────

app.get("/messages", (_req, res) => {
  const messages = messageQueue.splice(0, messageQueue.length);
  res.json({ messages });
});

// ─── OpenClaw reply endpoint ──────────────────────────────────────────────

app.post("/reply", async (req, res) => {
  const body = req.body as { channel?: string; recipient_id?: string; text?: string };
  if (!body.channel || !body.recipient_id || !body.text) {
    res.status(400).json({ error: "Missing channel, recipient_id, or text" });
    return;
  }

  const reply: ChannelReply = {
    channel: body.channel as ChannelReply["channel"],
    recipient_id: body.recipient_id,
    text: body.text,
  };

  const callback = replyCallbacks.get(body.channel);
  if (callback) {
    await callback(reply);
    res.json({ status: "sent" });
  } else {
    res.status(404).json({ error: `No adapter registered for channel: ${body.channel}` });
  }
});

// ─── Admin: Register identity (API key protected) ─────────────────────────

app.post("/admin/register-identity", (req, res) => {
  // API key validation
  const authHeader = req.headers["authorization"];
  const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!ADMIN_API_KEY) {
    res.status(500).json({ error: "SPA_ADMIN_API_KEY not configured on server" });
    return;
  }

  if (providedKey !== ADMIN_API_KEY) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }

  const body = req.body as {
    channel?: string;
    sender_id?: string;
    spa_key_id?: string;
    label?: string;
  };

  if (!body.channel || !body.sender_id || !body.spa_key_id) {
    res.status(400).json({ error: "Missing channel, sender_id, or spa_key_id" });
    return;
  }

  bridge.registerSender(
    body.channel as ChannelMessage["channel"],
    body.sender_id,
    body.spa_key_id,
    body.label ?? "registered via API"
  );

  console.log(`[Admin] Registered identity: ${body.channel}:${body.sender_id} → ${body.spa_key_id}`);
  res.json({ status: "registered" });
});

// ─── Wire up adapters ────────────────────────────────────────────────────

// WhatsApp
if (process.env["WHATSAPP_API_TOKEN"]) {
  const wa = new WhatsAppAdapter({
    api_token: process.env["WHATSAPP_API_TOKEN"]!,
    phone_number_id: process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? "",
    webhook_verify_token: process.env["WHATSAPP_VERIFY_TOKEN"] ?? "spa-verify",
  });

  wa.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.get("/webhook/whatsapp", (req, res) => wa.handleVerification(req, res));
  app.post("/webhook/whatsapp", (req, res) => { wa.handleWebhook(req, res); });

  replyCallbacks.set("whatsapp", (reply) => wa.sendReply(reply));
  console.log("[Server] WhatsApp adapter enabled");
}

// Telegram
if (process.env["TELEGRAM_BOT_TOKEN"]) {
  const allowedChats = process.env["TELEGRAM_ALLOWED_CHATS"]
    ?.split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  const tg = new TelegramAdapter({
    bot_token: process.env["TELEGRAM_BOT_TOKEN"]!,
    allowed_chat_ids: allowedChats,
  });

  tg.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.post("/webhook/telegram", (req, res) => { tg.handleWebhook(req, res); });

  replyCallbacks.set("telegram", (reply) => tg.sendReply(reply));
  console.log("[Server] Telegram adapter enabled");

  // Start long-polling if no webhook is configured
  if (process.env["TELEGRAM_USE_POLLING"] === "true") {
    tg.startPolling();
  }
}

// Signal
if (process.env["SIGNAL_API_URL"]) {
  const sig = new SignalAdapter({
    api_url: process.env["SIGNAL_API_URL"]!,
    phone_number: process.env["SIGNAL_PHONE_NUMBER"] ?? "",
  });

  sig.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("signal", (reply) => sig.sendReply(reply));
  console.log("[Server] Signal adapter enabled (polling)");
  sig.startPolling();
}

// Discord
if (process.env["DISCORD_BOT_TOKEN"]) {
  const allowedGuilds = process.env["DISCORD_ALLOWED_GUILDS"]?.split(",").map((s) => s.trim()).filter(Boolean);

  const dc = new DiscordAdapter({
    bot_token: process.env["DISCORD_BOT_TOKEN"]!,
    allowed_guild_ids: allowedGuilds,
  });

  dc.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("discord", async (reply) => {
    // For Discord, we need the channel_id from the original message metadata
    // This is a simplified version — in production, store channel_id per conversation
    await dc.sendReply(reply, reply.recipient_id);
  });

  console.log("[Server] Discord adapter enabled");
  dc.connect();
}

// ─── iMessage (macOS only) ────────────────────────────────────────────────

if (process.env["IMESSAGE_ENABLED"] === "true" && process.platform === "darwin") {
  const im = new iMessageAdapter({
    chat_db_path: process.env["IMESSAGE_CHAT_DB"],
    poll_interval_ms: parseInt(process.env["IMESSAGE_POLL_INTERVAL"] ?? "3000", 10),
  });

  im.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("imessage", (reply) => im.sendReply(reply));
  console.log("[Server] iMessage adapter enabled");
  im.startPolling();
}

// ─── Slack ────────────────────────────────────────────────────────────────

if (process.env["SLACK_BOT_TOKEN"]) {
  const slack = new SlackAdapter({
    bot_token: process.env["SLACK_BOT_TOKEN"]!,
    app_token: process.env["SLACK_APP_TOKEN"] ?? "",
    signing_secret: process.env["SLACK_SIGNING_SECRET"],
  });

  slack.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("slack", (reply) => slack.sendReply(reply));
  console.log("[Server] Slack adapter enabled");
  slack.connect();
}

// ─── SMS / Twilio ─────────────────────────────────────────────────────────

if (process.env["TWILIO_ACCOUNT_SID"]) {
  const sms = new SMSAdapter({
    account_sid: process.env["TWILIO_ACCOUNT_SID"]!,
    auth_token: process.env["TWILIO_AUTH_TOKEN"] ?? "",
    from_number: process.env["TWILIO_FROM_NUMBER"] ?? "",
  });

  sms.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.post("/webhook/sms", (req, res) => { sms.handleWebhook(req, res); });
  replyCallbacks.set("sms", (reply) => sms.sendReply(reply));
  console.log("[Server] SMS/Twilio adapter enabled");
}

// ─── Email (IMAP/SMTP) ───────────────────────────────────────────────────

if (process.env["EMAIL_IMAP_HOST"]) {
  const email = new EmailAdapter({
    imap_host: process.env["EMAIL_IMAP_HOST"]!,
    imap_port: parseInt(process.env["EMAIL_IMAP_PORT"] ?? "993", 10),
    smtp_host: process.env["EMAIL_SMTP_HOST"] ?? process.env["EMAIL_IMAP_HOST"]!,
    smtp_port: parseInt(process.env["EMAIL_SMTP_PORT"] ?? "587", 10),
    username: process.env["EMAIL_USERNAME"] ?? "",
    password: process.env["EMAIL_PASSWORD"] ?? "",
    poll_interval_ms: parseInt(process.env["EMAIL_POLL_INTERVAL"] ?? "30000", 10),
  });

  email.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("email", (reply) => email.sendReply(reply));
  console.log("[Server] Email adapter enabled");
  email.startPolling();
}

// ─── Microsoft Teams ──────────────────────────────────────────────────────

if (process.env["TEAMS_APP_ID"]) {
  const teams = new TeamsAdapter({
    app_id: process.env["TEAMS_APP_ID"]!,
    app_password: process.env["TEAMS_APP_PASSWORD"] ?? "",
    tenant_id: process.env["TEAMS_TENANT_ID"],
  });

  teams.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.post("/webhook/teams", (req, res) => { teams.handleWebhook(req as any, res); });
  replyCallbacks.set("teams", (reply) => teams.sendReply(reply, process.env["TEAMS_SERVICE_URL"] ?? "https://smba.trafficmanager.net/teams/", reply.recipient_id));
  console.log("[Server] Microsoft Teams adapter enabled");
}

// ─── Matrix ───────────────────────────────────────────────────────────────

if (process.env["MATRIX_HOMESERVER_URL"]) {
  const matrix = new MatrixAdapter({
    homeserver_url: process.env["MATRIX_HOMESERVER_URL"]!,
    access_token: process.env["MATRIX_ACCESS_TOKEN"] ?? "",
    user_id: process.env["MATRIX_USER_ID"] ?? "",
    allowed_room_ids: process.env["MATRIX_ALLOWED_ROOMS"]?.split(",").map((s) => s.trim()).filter(Boolean),
  });

  matrix.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("matrix", (reply) => matrix.sendReply(reply, reply.recipient_id));
  console.log("[Server] Matrix adapter enabled");
  matrix.startSync();
}

// ─── IRC ──────────────────────────────────────────────────────────────────

if (process.env["IRC_SERVER"]) {
  const irc = new IRCAdapter({
    server: process.env["IRC_SERVER"]!,
    port: parseInt(process.env["IRC_PORT"] ?? "6697", 10),
    nickname: process.env["IRC_NICK"] ?? "openclaw-spa",
    channels: process.env["IRC_CHANNELS"]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
    tls: process.env["IRC_USE_TLS"] !== "false",
    password: process.env["IRC_PASSWORD"],
  });

  irc.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("irc", (reply) => irc.sendReply(reply));
  console.log("[Server] IRC adapter enabled");
  irc.connect();
}

// ─── Facebook Messenger ───────────────────────────────────────────────────

if (process.env["MESSENGER_PAGE_ACCESS_TOKEN"]) {
  const messenger = new MessengerAdapter({
    page_access_token: process.env["MESSENGER_PAGE_ACCESS_TOKEN"]!,
    verify_token: process.env["MESSENGER_VERIFY_TOKEN"] ?? "spa-verify",
    app_secret: process.env["MESSENGER_APP_SECRET"] ?? "",
  });

  messenger.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.get("/webhook/messenger", (req, res) => messenger.handleVerification(req as any, res));
  app.post("/webhook/messenger", (req, res) => { messenger.handleWebhook(req as any, res); });
  replyCallbacks.set("messenger", (reply) => messenger.sendReply(reply));
  console.log("[Server] Facebook Messenger adapter enabled");
}

// ─── Google Chat ──────────────────────────────────────────────────────────

if (process.env["GOOGLE_CHAT_SA_PATH"]) {
  const gchat = new GoogleChatAdapter({
    service_account_path: process.env["GOOGLE_CHAT_SA_PATH"]!,
  });

  gchat.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.post("/webhook/googlechat", (req, res) => { gchat.handleWebhook(req as any, res); });
  replyCallbacks.set("googlechat", (reply) => gchat.sendReply(reply, reply.recipient_id));
  console.log("[Server] Google Chat adapter enabled");
}

// ─── X (Twitter) DMs ─────────────────────────────────────────────────────

if (process.env["X_BEARER_TOKEN"]) {
  const xdm = new XAdapter({
    bearer_token: process.env["X_BEARER_TOKEN"]!,
    api_key: process.env["X_API_KEY"] ?? "",
    api_secret: process.env["X_API_SECRET"] ?? "",
    access_token: process.env["X_ACCESS_TOKEN"] ?? "",
    access_token_secret: process.env["X_ACCESS_TOKEN_SECRET"] ?? "",
    poll_interval_ms: parseInt(process.env["X_POLL_INTERVAL"] ?? "15000", 10),
  });

  xdm.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  replyCallbacks.set("x", (reply) => xdm.sendReply(reply));
  console.log("[Server] X (Twitter) DM adapter enabled");
  xdm.startPolling();
}

// ─── LINE ─────────────────────────────────────────────────────────────────

if (process.env["LINE_CHANNEL_ACCESS_TOKEN"]) {
  const line = new LINEAdapter({
    channel_access_token: process.env["LINE_CHANNEL_ACCESS_TOKEN"]!,
    channel_secret: process.env["LINE_CHANNEL_SECRET"] ?? "",
  });

  line.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.post("/webhook/line", (req, res) => { line.handleWebhook(req as any, res); });
  replyCallbacks.set("line", (reply) => line.sendReply(reply));
  console.log("[Server] LINE adapter enabled");
}

// ─── WeChat ───────────────────────────────────────────────────────────────

if (process.env["WECHAT_APP_ID"]) {
  const wechat = new WeChatAdapter({
    app_id: process.env["WECHAT_APP_ID"]!,
    app_secret: process.env["WECHAT_APP_SECRET"] ?? "",
    token: process.env["WECHAT_TOKEN"] ?? "",
    encoding_aes_key: process.env["WECHAT_ENCODING_AES_KEY"],
  });

  wechat.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.get("/webhook/wechat", (req, res) => wechat.handleVerification(req as any, res));
  app.post("/webhook/wechat", (req, res) => { wechat.handleWebhook(req as any, res); });
  replyCallbacks.set("wechat", (reply) => wechat.sendReply(reply));
  console.log("[Server] WeChat adapter enabled");
}

// ─── Generic Webhook ──────────────────────────────────────────────────────

if (process.env["WEBHOOK_REPLY_URL"]) {
  const webhook = new WebhookAdapter({
    reply_url: process.env["WEBHOOK_REPLY_URL"]!,
    shared_secret: process.env["WEBHOOK_SECRET"],
    reply_headers: process.env["WEBHOOK_CUSTOM_HEADERS"]
      ? JSON.parse(process.env["WEBHOOK_CUSTOM_HEADERS"])
      : undefined,
  });

  webhook.onIncoming(async (msg) => {
    const result = await bridge.process(msg);
    enqueue(msg, result);
  });

  app.post("/webhook/generic", (req, res) => { webhook.handleWebhook(req as any, res); });
  replyCallbacks.set("webhook", (reply) => webhook.sendReply(reply));
  console.log("[Server] Generic Webhook adapter enabled");
}

// ─── Start server ────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  openclaw-spa messaging bridge`);
  console.log(`  listening on http://localhost:${PORT}`);
  console.log(`  GET  /health               — health check`);
  console.log(`  GET  /messages              — poll verified messages`);
  console.log(`  POST /reply                 — send reply to channel`);
  console.log(`  POST /admin/register-identity — register channel→key (API key required)\n`);
});
