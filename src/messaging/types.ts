/**
 * openclaw-spa — Messaging Bridge Types
 *
 * Defines the contract between messaging channels (WhatsApp, Signal, Telegram, Discord, SMS)
 * and the SPA gateway. Each channel adapter translates platform-specific messages
 * into a normalized ChannelMessage, then SPA verifies and gates as normal.
 */

export type ChannelType = "whatsapp" | "signal" | "telegram" | "sms" | "slack" | "discord";

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
