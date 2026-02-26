/**
 * openclaw-spa — Telegram Adapter
 *
 * Uses the Telegram Bot API to receive and send messages.
 * Supports webhook mode (for production) and long-polling fallback (for dev).
 *
 * Setup:
 *   1. Create a bot via @BotFather
 *   2. Get the bot token
 *   3. Optionally whitelist chat IDs for security
 */

import type { Request, Response } from "express";
import type { ChannelMessage, ChannelReply, TelegramConfig } from "../types.js";

export class TelegramAdapter {
  private config: TelegramConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private polling: boolean = false;
  private lastUpdateId: number = 0;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle a webhook POST from Telegram.
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    res.status(200).json({ ok: true });

    try {
      const update = req.body as TelegramUpdate;
      await this.processUpdate(update);
    } catch (err) {
      console.error("[Telegram] Webhook error:", err);
    }
  }

  /**
   * Start long-polling (for development/testing).
   */
  async startPolling(intervalMs: number = 1000): Promise<void> {
    this.polling = true;
    console.log("[Telegram] Long-polling started");

    while (this.polling) {
      try {
        const url = `https://api.telegram.org/bot${this.config.bot_token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`;
        const resp = await fetch(url);
        const data = (await resp.json()) as { ok: boolean; result: TelegramUpdate[] };

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            await this.processUpdate(update);
          }
        }
      } catch (err) {
        console.error("[Telegram] Poll error:", err);
      }
      await sleep(intervalMs);
    }
  }

  stopPolling(): void {
    this.polling = false;
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg || !msg.text) return;

    // Enforce chat whitelist if configured
    if (
      this.config.allowed_chat_ids?.length &&
      !this.config.allowed_chat_ids.includes(msg.chat.id)
    ) {
      return;
    }

    const channelMsg: ChannelMessage = {
      channel: "telegram",
      sender_id: String(msg.from?.id ?? msg.chat.id),
      sender_name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || undefined,
      raw_text: msg.text,
      platform_message_id: String(msg.message_id),
      sent_at: new Date(msg.date * 1000).toISOString(),
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }
  }

  /**
   * Send a reply via Telegram Bot API.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.bot_token}/sendMessage`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: reply.recipient_id,
        text: reply.text,
        parse_mode: "Markdown",
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Telegram] Send failed (${resp.status}): ${errText}`);
    }
  }

  /**
   * Send a typing indicator.
   */
  async sendTyping(chatId: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.bot_token}/sendChatAction`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
  }
}

// ─── Telegram Types ──────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
