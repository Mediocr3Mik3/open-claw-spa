/**
 * openclaw-spa — Generic Webhook Adapter
 *
 * A catch-all adapter for any messaging platform not directly supported.
 * Receives messages via incoming HTTP POST and sends replies via outbound POST.
 *
 * Incoming format (POST /webhook/generic):
 *   {
 *     "sender_id": "user-123",
 *     "sender_name": "Alice",
 *     "text": "hello agent",
 *     "message_id": "msg-abc",
 *     "timestamp": "2024-01-01T00:00:00Z",
 *     "metadata": {}
 *   }
 *
 * Outbound replies are POSTed to the configured reply_url with:
 *   {
 *     "recipient_id": "user-123",
 *     "text": "reply text",
 *     "envelope_token": "SPA1:..."
 *   }
 *
 * Security: Optionally verify incoming webhooks via HMAC-SHA256 signature.
 */

import * as crypto from "crypto";
import type { ChannelMessage, ChannelReply, WebhookConfig } from "../types.js";

export class WebhookAdapter {
  private config: WebhookConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle incoming generic webhook (Express route handler).
   */
  async handleWebhook(
    req: { body: WebhookIncoming; headers: Record<string, string | undefined> },
    res: { status: (code: number) => { json: (body: unknown) => void; end: () => void } }
  ): Promise<void> {
    // Verify HMAC signature if configured
    if (this.config.shared_secret) {
      const headerName = (this.config.signature_header ?? "x-signature-256").toLowerCase();
      const signature = req.headers[headerName];
      if (!signature) {
        console.error("[Webhook] Missing signature header");
        res.status(401).json({ error: "Missing signature" });
        return;
      }

      const expected = "sha256=" + crypto
        .createHmac("sha256", this.config.shared_secret)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (signature !== expected) {
        console.error("[Webhook] Invalid signature");
        res.status(403).json({ error: "Invalid signature" });
        return;
      }
    }

    const body = req.body;
    if (!body.text) {
      res.status(400).json({ error: "Missing text field" });
      return;
    }

    const channelMsg: ChannelMessage = {
      channel: "webhook",
      sender_id: body.sender_id ?? "anonymous",
      sender_name: body.sender_name,
      raw_text: body.text,
      platform_message_id: body.message_id ?? `webhook-${Date.now()}`,
      sent_at: body.timestamp ?? new Date().toISOString(),
      metadata: body.metadata,
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }

    res.status(200).json({ status: "received" });
  }

  /**
   * Send a reply via outbound HTTP POST.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    if (!this.config.reply_url) {
      console.warn("[Webhook] No reply_url configured, cannot send reply");
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.config.reply_headers ?? {}),
    };

    // Optionally sign outbound payload
    const payload = JSON.stringify({
      recipient_id: reply.recipient_id,
      text: reply.text,
      envelope_token: reply.attach_envelope_token,
    });

    if (this.config.shared_secret) {
      const sig = "sha256=" + crypto
        .createHmac("sha256", this.config.shared_secret)
        .update(payload)
        .digest("hex");
      headers[this.config.signature_header ?? "X-Signature-256"] = sig;
    }

    const resp = await fetch(this.config.reply_url, {
      method: "POST",
      headers,
      body: payload,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Webhook] Reply failed (${resp.status}): ${errText}`);
    }
  }
}

// ─── Webhook Types ───────────────────────────────────────────────────────

interface WebhookIncoming {
  sender_id?: string;
  sender_name?: string;
  text?: string;
  message_id?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}
