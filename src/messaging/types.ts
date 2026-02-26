/**
 * openclaw-spa — Messaging Bridge Types
 *
 * Defines the contract between messaging channels (WhatsApp, Signal, Telegram, Discord, SMS)
 * and the SPA gateway. Each channel adapter translates platform-specific messages
 * into a normalized ChannelMessage, then SPA verifies and gates as normal.
 */

export type ChannelType =
  | "whatsapp"
  | "signal"
  | "telegram"
  | "discord"
  | "imessage"
  | "slack"
  | "sms"
  | "email"
  | "teams"
  | "matrix"
  | "irc"
  | "messenger"
  | "googlechat"
  | "x"
  | "line"
  | "wechat"
  | "webhook";

// ─── Inbound (channel → SPA) ──────────────────────────────────────────────

export interface ChannelMessage {
  /** Which channel this came from */
  channel: ChannelType;
  /** Platform-specific sender identifier (phone number, user ID, etc.) */
  sender_id: string;
  /** Display name if available */
  sender_name?: string;
  /** Raw message text as received */
  raw_text: string;
  /** Any attached media (for future: voice → text transcription) */
  attachments?: ChannelAttachment[];
  /** Platform message ID (for deduplication) */
  platform_message_id: string;
  /** When the message was sent (platform timestamp) */
  sent_at: string;
  /** Platform-specific metadata (e.g. Discord channel_id, guild_id) */
  metadata?: Record<string, unknown>;
}

export interface ChannelAttachment {
  type: "image" | "audio" | "document" | "location";
  mime_type?: string;
  url?: string;
  data?: Buffer;
}

// ─── Outbound (SPA → channel) ─────────────────────────────────────────────

export interface ChannelReply {
  channel: ChannelType;
  recipient_id: string;
  text: string;
  /** Optional: attach the signed token users can reuse/save */
  attach_envelope_token?: string;
}

// ─── Channel Identity Registry ────────────────────────────────────────────

/**
 * Maps a channel sender (phone number / user ID) to an SPA key.
 * Allows WhatsApp/Signal users to pre-register their key so messages
 * from their number are auto-verified.
 */
export interface ChannelIdentity {
  /** Channel type */
  channel: ChannelType;
  /** Platform sender ID (e.g. "+14155551234", "@alice.01") */
  sender_id: string;
  /** SPA key_id associated with this sender */
  spa_key_id: string;
  /** Human label */
  label: string;
  /** When this binding was registered */
  registered_at: string;
  /** Whether this identity binding is active */
  active: boolean;
}

export interface ChannelIdentityRegistry {
  version: "1.0";
  identities: ChannelIdentity[];
}

// ─── Bridge Config ────────────────────────────────────────────────────────

export interface MessagingBridgeConfig {
  /** Path to the SPA key registry */
  key_registry_path: string;
  /** Path to the channel identity registry */
  identity_registry_path: string;
  /** Path to the gate registry */
  gate_registry_path?: string;
  /** Max envelope age (seconds) */
  max_envelope_age_seconds?: number;
  /** If true, unsigned messages from unregistered senders are allowed for ungated actions only */
  allow_unsigned_ungated?: boolean;
  /** WhatsApp config (optional) */
  whatsapp?: WhatsAppConfig;
  /** Signal config (optional) */
  signal?: SignalConfig;
  /** Telegram config (optional) */
  telegram?: TelegramConfig;
  /** Discord config (optional) */
  discord?: DiscordConfig;
  /** iMessage config (optional — macOS only) */
  imessage?: iMessageConfig;
  /** Slack config (optional) */
  slack?: SlackConfig;
  /** SMS/Twilio config (optional) */
  sms?: SMSConfig;
  /** Email IMAP/SMTP config (optional) */
  email?: EmailConfig;
  /** Microsoft Teams config (optional) */
  teams?: TeamsConfig;
  /** Matrix config (optional) */
  matrix?: MatrixConfig;
  /** IRC config (optional) */
  irc?: IRCConfig;
  /** Facebook Messenger config (optional) */
  messenger?: MessengerConfig;
  /** Google Chat config (optional) */
  googlechat?: GoogleChatConfig;
  /** X (Twitter) DM config (optional) */
  x?: XConfig;
  /** LINE config (optional) */
  line?: LINEConfig;
  /** WeChat config (optional) */
  wechat?: WeChatConfig;
  /** Generic webhook config (optional) */
  webhook?: WebhookConfig;
}

export interface WhatsAppConfig {
  /** WhatsApp Business API token */
  api_token: string;
  /** Phone number ID from Meta dashboard */
  phone_number_id: string;
  /** Webhook verify token */
  webhook_verify_token: string;
}

export interface SignalConfig {
  /** signal-cli REST API base URL (self-hosted) */
  api_url: string;
  /** Your Signal phone number */
  phone_number: string;
}

export interface TelegramConfig {
  /** Bot token from @BotFather */
  bot_token: string;
  /** Allowed chat IDs (whitelist) */
  allowed_chat_ids?: number[];
}

export interface DiscordConfig {
  /** Bot token from Discord Developer Portal */
  bot_token: string;
  /** Allowed guild (server) IDs — if set, messages from other guilds are ignored */
  allowed_guild_ids?: string[];
  /** Allowed channel IDs — if set, only these channels are monitored */
  allowed_channel_ids?: string[];
}

export interface iMessageConfig {
  /** macOS only — uses AppleScript to read/send via Messages.app */
  /** AppleScript polling interval in milliseconds (default: 3000) */
  poll_interval_ms?: number;
  /** Only process messages from these sender IDs (phone/email) */
  allowed_senders?: string[];
  /** Path to a chat.db override (default: ~/Library/Messages/chat.db) */
  chat_db_path?: string;
}

export interface SlackConfig {
  /** Slack Bot OAuth token (xoxb-...) */
  bot_token: string;
  /** Slack App-level token for Socket Mode (xapp-...) */
  app_token: string;
  /** Slack signing secret for webhook verification */
  signing_secret?: string;
  /** Allowed channel IDs */
  allowed_channel_ids?: string[];
}

export interface SMSConfig {
  /** Twilio Account SID */
  account_sid: string;
  /** Twilio Auth Token */
  auth_token: string;
  /** Your Twilio phone number (E.164 format: +1...) */
  from_number: string;
  /** Webhook path for incoming messages (default: /webhook/sms) */
  webhook_path?: string;
}

export interface EmailConfig {
  /** IMAP server for receiving */
  imap_host: string;
  imap_port?: number;
  imap_tls?: boolean;
  /** SMTP server for sending */
  smtp_host: string;
  smtp_port?: number;
  smtp_tls?: boolean;
  /** Email account credentials */
  username: string;
  password: string;
  /** Only process emails from these addresses */
  allowed_senders?: string[];
  /** Polling interval in milliseconds (default: 10000) */
  poll_interval_ms?: number;
  /** Mailbox to monitor (default: INBOX) */
  mailbox?: string;
}

export interface TeamsConfig {
  /** Microsoft App ID (from Azure Bot registration) */
  app_id: string;
  /** Microsoft App Password / Client Secret */
  app_password: string;
  /** Tenant ID (for single-tenant bots) */
  tenant_id?: string;
}

export interface MatrixConfig {
  /** Matrix homeserver URL (e.g. https://matrix.org) */
  homeserver_url: string;
  /** Bot access token */
  access_token: string;
  /** Bot user ID (e.g. @bot:matrix.org) */
  user_id: string;
  /** Allowed room IDs */
  allowed_room_ids?: string[];
}

export interface IRCConfig {
  /** IRC server hostname */
  server: string;
  /** IRC server port (default: 6697 for TLS) */
  port?: number;
  /** Use TLS (default: true) */
  tls?: boolean;
  /** Bot nickname */
  nickname: string;
  /** NickServ password (optional) */
  password?: string;
  /** Channels to join and monitor */
  channels: string[];
  /** Only respond to DMs and @mentions (default: true) */
  mentions_only?: boolean;
}

export interface MessengerConfig {
  /** Facebook Page Access Token */
  page_access_token: string;
  /** Facebook App Secret (for webhook signature verification) */
  app_secret: string;
  /** Webhook verify token */
  verify_token: string;
}

export interface GoogleChatConfig {
  /** Google Service Account credentials JSON path */
  service_account_path: string;
  /** Space IDs to monitor (if empty, monitors all) */
  allowed_space_ids?: string[];
}

export interface XConfig {
  /** X API v2 Bearer Token */
  bearer_token: string;
  /** X API Consumer Key */
  api_key: string;
  /** X API Consumer Secret */
  api_secret: string;
  /** X API Access Token */
  access_token: string;
  /** X API Access Token Secret */
  access_token_secret: string;
  /** Poll interval for DMs in milliseconds (default: 15000) */
  poll_interval_ms?: number;
}

export interface LINEConfig {
  /** LINE Channel Access Token */
  channel_access_token: string;
  /** LINE Channel Secret (for webhook signature verification) */
  channel_secret: string;
}

export interface WeChatConfig {
  /** WeChat Official Account App ID */
  app_id: string;
  /** WeChat Official Account App Secret */
  app_secret: string;
  /** Webhook verification token */
  token: string;
  /** Message encryption key (if using encrypted mode) */
  encoding_aes_key?: string;
}

export interface WebhookConfig {
  /** Shared secret for HMAC signature verification of incoming webhooks */
  shared_secret?: string;
  /** Expected header name for signature (default: X-Signature-256) */
  signature_header?: string;
  /** Outbound webhook URL to POST replies to */
  reply_url?: string;
  /** Custom headers for outbound requests */
  reply_headers?: Record<string, string>;
}
