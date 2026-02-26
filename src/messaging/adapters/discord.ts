/**
 * openclaw-spa — Discord Adapter
 *
 * Connects to Discord via REST + Gateway WebSocket API.
 * Listens for DMs and @mentions in allowed guilds/channels.
 *
 * Setup:
 *   1. Create a Discord application at https://discord.com/developers
 *   2. Create a bot user and get the bot token
 *   3. Invite the bot to your server with message read/send permissions
 *   4. Optionally configure allowed_guild_ids and allowed_channel_ids
 */

import type { ChannelMessage, ChannelReply, DiscordConfig } from "../types.js";

// ─── Discord Gateway opcodes ─────────────────────────────────────────────

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

export class DiscordAdapter {
  private config: DiscordConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private sequence: number | null = null;
  private botUserId: string | null = null;

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Connect to the Discord Gateway WebSocket.
   */
  async connect(): Promise<void> {
    console.log("[Discord] Connecting to gateway...");

    this.ws = new WebSocket(GATEWAY_URL);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(String(event.data)) as DiscordGatewayPayload;
      this.handleGatewayMessage(data);
    };

    this.ws.onclose = (event) => {
      console.log(`[Discord] Connection closed: ${event.code} ${event.reason}`);
      this.cleanup();
      // Auto-reconnect after 5s
      setTimeout(() => this.connect(), 5000);
    };

    this.ws.onerror = (err) => {
      console.error("[Discord] WebSocket error:", err);
    };
  }

  private handleGatewayMessage(data: DiscordGatewayPayload): void {
    if (data.s !== null && data.s !== undefined) {
      this.sequence = data.s;
    }

    switch (data.op) {
      case OP_HELLO:
        this.startHeartbeat((data.d?.heartbeat_interval as number) ?? 41250);
        this.identify();
        break;

      case OP_HEARTBEAT_ACK:
        // Connection is alive
        break;

      case OP_DISPATCH:
        this.handleDispatch(data.t ?? "", data.d ?? {});
        break;
    }
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.ws?.send(JSON.stringify({ op: OP_HEARTBEAT, d: this.sequence }));
    }, intervalMs);
  }

  private identify(): void {
    this.ws?.send(
      JSON.stringify({
        op: OP_IDENTIFY,
        d: {
          token: this.config.bot_token,
          intents: 1 << 9 | 1 << 12 | 1 << 15, // GUILD_MESSAGES | DIRECT_MESSAGES | MESSAGE_CONTENT
          properties: {
            os: "linux",
            browser: "openclaw-spa",
            device: "openclaw-spa",
          },
        },
      })
    );
  }

  private handleDispatch(eventName: string, data: Record<string, unknown>): void {
    if (eventName === "READY") {
      const user = data["user"] as Record<string, unknown> | undefined;
      this.botUserId = (user?.["id"] as string) ?? null;
      console.log(`[Discord] Ready as ${user?.["username"]}#${user?.["discriminator"]}`);
      return;
    }

    if (eventName === "MESSAGE_CREATE") {
      this.handleMessageCreate(data);
    }
  }

  private async handleMessageCreate(data: Record<string, unknown>): Promise<void> {
    const author = data["author"] as Record<string, unknown> | undefined;
    const authorId = author?.["id"] as string;

    // Ignore messages from the bot itself
    if (authorId === this.botUserId) return;

    // Ignore bot messages
    if (author?.["bot"]) return;

    const guildId = data["guild_id"] as string | undefined;
    const channelId = data["channel_id"] as string;
    const content = data["content"] as string;

    // Enforce guild allowlist
    if (guildId && this.config.allowed_guild_ids?.length) {
      if (!this.config.allowed_guild_ids.includes(guildId)) return;
    }

    // Enforce channel allowlist
    if (this.config.allowed_channel_ids?.length) {
      if (!this.config.allowed_channel_ids.includes(channelId)) return;
    }

    // For guild messages, only respond to @mentions
    if (guildId && this.botUserId) {
      const mentions = data["mentions"] as Array<Record<string, unknown>> | undefined;
      const isMentioned = mentions?.some((m) => (m["id"] as string) === this.botUserId);
      if (!isMentioned) return;
    }

    const channelMsg: ChannelMessage = {
      channel: "discord",
      sender_id: authorId,
      sender_name: author?.["username"] as string | undefined,
      raw_text: content,
      platform_message_id: data["id"] as string,
      sent_at: data["timestamp"] as string ?? new Date().toISOString(),
      metadata: {
        guild_id: guildId,
        channel_id: channelId,
      },
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }
  }

  /**
   * Send a reply via Discord REST API.
   */
  async sendReply(reply: ChannelReply, channelId: string): Promise<void> {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${this.config.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: reply.text }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Discord] Send failed (${resp.status}): ${errText}`);
    }
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect(): void {
    this.cleanup();
    this.ws?.close();
    this.ws = null;
  }
}

// ─── Discord Types ───────────────────────────────────────────────────────

interface DiscordGatewayPayload {
  op: number;
  d?: Record<string, unknown>;
  s?: number | null;
  t?: string | null;
}
