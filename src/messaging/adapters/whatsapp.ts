/**
 * openclaw-spa — WhatsApp Adapter
 *
 * Translates WhatsApp Business Cloud API webhooks into normalized ChannelMessages,
 * and sends replies back through the WhatsApp API.
 *
 * Setup:
 *   1. Create a Meta Business account and WhatsApp Business API app
 *   2. Get an API token and phone_number_id from the Meta dashboard
 *   3. Set a webhook verify token and point the webhook URL to /webhook/whatsapp
 */

import type { Request, Response } from "express";
import type { ChannelMessage, ChannelReply, WhatsAppConfig } from "../types.js";

export class WhatsAppAdapter {
  private config: WhatsAppConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  /**
   * Register the message handler.
   */
  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle GET requests for webhook verification (Meta challenge).
   */
  handleVerification(req: Request, res: Response): void {
    const mode = req.query["hub.mode"] as string;
    const token = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"] as string;

    if (mode === "subscribe" && token === this.config.webhook_verify_token) {
      console.log("[WhatsApp] Webhook verified");
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Forbidden");
    }
  }

  /**
   * Handle POST requests from the WhatsApp webhook.
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    // Always respond 200 quickly to avoid retries
    res.status(200).json({ status: "received" });

    try {
      const body = req.body as WhatsAppWebhookPayload;
      const entries = body?.entry ?? [];

      for (const entry of entries) {
        const changes = entry.changes ?? [];
        for (const change of changes) {
          if (change.field !== "messages") continue;
          const messages = change.value?.messages ?? [];
          const contacts = change.value?.contacts ?? [];

          for (const msg of messages) {
            if (msg.type !== "text") continue; // Only handle text for now

            const contact = contacts.find((c: WhatsAppContact) => c.wa_id === msg.from);
            const channelMsg: ChannelMessage = {
              channel: "whatsapp",
              sender_id: msg.from,
              sender_name: contact?.profile?.name,
              raw_text: msg.text?.body ?? "",
              platform_message_id: msg.id,
              sent_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            };

            if (this.onMessage) {
              await this.onMessage(channelMsg);
            }
          }
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Error processing webhook:", err);
    }
  }

  /**
   * Send a reply back through WhatsApp.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const url = `https://graph.facebook.com/v18.0/${this.config.phone_number_id}/messages`;

    const body = {
      messaging_product: "whatsapp",
      to: reply.recipient_id,
      type: "text",
      text: { body: reply.text },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[WhatsApp] Send failed (${resp.status}): ${errText}`);
    }
  }
}

// ─── WhatsApp Webhook Types ──────────────────────────────────────────────

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field: string;
      value?: {
        messages?: WhatsAppMessage[];
        contacts?: WhatsAppContact[];
      };
    }>;
  }>;
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppContact {
  wa_id: string;
  profile?: { name?: string };
}
