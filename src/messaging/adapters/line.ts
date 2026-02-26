/**
 * openclaw-spa — LINE Adapter
 *
 * Connects to LINE via the Messaging API.
 *
 * Setup:
 *   1. Create a LINE Developers account at https://developers.line.biz
 *   2. Create a Messaging API channel
 *   3. Get the Channel Access Token and Channel Secret
 *   4. Configure webhook URL to POST /webhook/line
 */

import * as crypto from "crypto";
import type { ChannelMessage, ChannelReply, LINEConfig } from "../types.js";

const LINE_API = "https://api.line.me/v2/bot";

export class LINEAdapter {
  private config: LINEConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;

  constructor(config: LINEConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle incoming LINE webhook events.
   */
  async handleWebhook(
    req: { body: LINEWebhookBody; headers: Record<string, string | undefined> },
    res: { status: (code: number) => { json: (body: unknown) => void; end: () => void } }
  ): Promise<void> {
    // Verify signature
    const signature = req.headers["x-line-signature"];
    if (signature && this.config.channel_secret) {
      const expected = crypto
        .createHmac("sha256", this.config.channel_secret)
        .update(JSON.stringify(req.body))
        .digest("base64");
      if (signature !== expected) {
        console.error("[LINE] Invalid webhook signature");
        res.status(403).end();
        return;
      }
    }

    const events = req.body.events ?? [];
    for (const event of events) {
      if (event.type !== "message" || event.message?.type !== "text") continue;

      const channelMsg: ChannelMessage = {
        channel: "line",
        sender_id: event.source?.userId ?? "unknown",
        raw_text: event.message.text ?? "",
        platform_message_id: event.message.id ?? `line-${Date.now()}`,
        sent_at: event.timestamp
          ? new Date(event.timestamp).toISOString()
          : new Date().toISOString(),
        metadata: {
          reply_token: event.replyToken,
          source_type: event.source?.type,
          group_id: event.source?.groupId,
          room_id: event.source?.roomId,
        },
      };

      if (this.onMessage) {
        await this.onMessage(channelMsg);
      }
    }

    res.status(200).json({});
  }

  /**
   * Send a reply using the reply token (preferred, free).
   */
  async sendReplyToken(replyToken: string, text: string): Promise<void> {
    const resp = await fetch(`${LINE_API}/message/reply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.channel_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[LINE] Reply failed (${resp.status}): ${errText}`);
    }
  }

  /**
   * Send a push message (costs money per message after free tier).
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const resp = await fetch(`${LINE_API}/message/push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.channel_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: reply.recipient_id,
        messages: [{ type: "text", text: reply.text }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[LINE] Push failed (${resp.status}): ${errText}`);
    }
  }
}

// ─── LINE Types ──────────────────────────────────────────────────────────

interface LINEWebhookBody {
  events?: Array<{
    type?: string;
    replyToken?: string;
    timestamp?: number;
    source?: {
      type?: string;
      userId?: string;
      groupId?: string;
      roomId?: string;
    };
    message?: {
      id?: string;
      type?: string;
      text?: string;
    };
  }>;
}
