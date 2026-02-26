/**
 * openclaw-spa — Slack Adapter
 *
 * Connects to Slack via Socket Mode (WebSocket) for real-time events
 * and the Web API for sending messages.
 *
 * Setup:
 *   1. Create a Slack App at https://api.slack.com/apps
 *   2. Enable Socket Mode and get an App-Level Token (xapp-...)
 *   3. Add Bot Token Scopes: chat:write, app_mentions:read, im:read, im:history
 *   4. Install to workspace and get Bot Token (xoxb-...)
 */

import type { ChannelMessage, ChannelReply, SlackConfig } from "../types.js";

const SLACK_API = "https://slack.com/api";

export class SlackAdapter {
  private config: SlackConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private ws: WebSocket | null = null;
  private botUserId: string | null = null;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Connect via Socket Mode for real-time events.
   */
  async connect(): Promise<void> {
    // Get WebSocket URL via apps.connections.open
    const resp = await fetch(`${SLACK_API}/apps.connections.open`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.app_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const data = (await resp.json()) as { ok: boolean; url?: string; error?: string };
    if (!data.ok || !data.url) {
      throw new Error(`[Slack] Socket Mode connection failed: ${data.error ?? "no url"}`);
    }

    // Identify the bot user
    await this.identifyBot();

    this.ws = new WebSocket(data.url);

    this.ws.onmessage = (event) => {
      const payload = JSON.parse(String(event.data)) as SlackSocketPayload;
      this.handleSocketEvent(payload);
    };

    this.ws.onclose = () => {
      console.log("[Slack] Socket closed, reconnecting in 5s...");
      setTimeout(() => this.connect(), 5000);
    };

    this.ws.onerror = (err) => {
      console.error("[Slack] Socket error:", err);
    };

    console.log("[Slack] Socket Mode connected");
  }

  private async identifyBot(): Promise<void> {
    const resp = await fetch(`${SLACK_API}/auth.test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.bot_token}` },
    });
    const data = (await resp.json()) as { ok: boolean; user_id?: string };
    if (data.ok && data.user_id) {
      this.botUserId = data.user_id;
    }
  }

  private async handleSocketEvent(payload: SlackSocketPayload): Promise<void> {
    // Acknowledge envelope
    if (payload.envelope_id) {
      this.ws?.send(JSON.stringify({ envelope_id: payload.envelope_id }));
    }

    if (payload.type === "events_api") {
      const event = payload.payload?.event;
      if (!event) return;

      // Handle message events (DMs and app_mentions)
      if (event.type === "message" && !event.subtype && !event.bot_id) {
        await this.handleMessage(event);
      } else if (event.type === "app_mention") {
        await this.handleMessage(event);
      }
    }
  }

  private async handleMessage(event: SlackEvent): Promise<void> {
    const userId = event.user;
    if (!userId || userId === this.botUserId) return;

    // Enforce channel allowlist
    if (this.config.allowed_channel_ids?.length) {
      if (!this.config.allowed_channel_ids.includes(event.channel ?? "")) return;
    }

    const channelMsg: ChannelMessage = {
      channel: "slack",
      sender_id: userId,
      raw_text: event.text ?? "",
      platform_message_id: event.ts ?? `slack-${Date.now()}`,
      sent_at: event.ts
        ? new Date(parseFloat(event.ts) * 1000).toISOString()
        : new Date().toISOString(),
      metadata: {
        slack_channel: event.channel,
        thread_ts: event.thread_ts,
      },
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }
  }

  /**
   * Send a reply via Slack Web API.
   */
  async sendReply(reply: ChannelReply, threadTs?: string): Promise<void> {
    const body: Record<string, unknown> = {
      channel: reply.recipient_id,
      text: reply.text,
    };
    if (threadTs) body["thread_ts"] = threadTs;

    const resp = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await resp.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      console.error(`[Slack] Send failed: ${data.error}`);
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// ─── Slack Types ─────────────────────────────────────────────────────────

interface SlackSocketPayload {
  type?: string;
  envelope_id?: string;
  payload?: {
    event?: SlackEvent;
  };
}

interface SlackEvent {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
}
