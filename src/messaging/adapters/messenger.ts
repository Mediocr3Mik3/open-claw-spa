/**
 * openclaw-spa — Facebook Messenger Adapter
 *
 * Connects to Facebook Messenger via the Meta Graph API (Send/Receive API).
 *
 * Setup:
 *   1. Create a Facebook App at https://developers.facebook.com
 *   2. Add the Messenger product
 *   3. Create a Page and get a Page Access Token
 *   4. Configure webhook to POST /webhook/messenger with message subscriptions
 *   5. Set the App Secret for webhook signature verification
 */

import * as crypto from "crypto";
import type { ChannelMessage, ChannelReply, MessengerConfig } from "../types.js";

const GRAPH_API = "https://graph.facebook.com/v18.0";

export class MessengerAdapter {
  private config: MessengerConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;

  constructor(config: MessengerConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle webhook verification (GET request from Meta).
   */
  handleVerification(
    req: { query: Record<string, string> },
    res: { status: (code: number) => { send: (body: string) => void } }
  ): void {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === this.config.verify_token) {
      res.status(200).send(challenge ?? "");
    } else {
      res.status(403).send("Verification failed");
    }
  }

  /**
   * Handle incoming webhook events (POST request).
   */
  async handleWebhook(
    req: { body: MessengerWebhookBody; headers: Record<string, string | undefined> },
    res: { status: (code: number) => { send: (body: string) => void } }
  ): Promise<void> {
    // Verify signature
    const signature = req.headers["x-hub-signature-256"];
    if (signature && this.config.app_secret) {
      const expected = "sha256=" + crypto
        .createHmac("sha256", this.config.app_secret)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (signature !== expected) {
        console.error("[Messenger] Invalid webhook signature");
        res.status(403).send("Invalid signature");
        return;
      }
    }

    const body = req.body;
    if (body.object !== "page") {
      res.status(200).send("OK");
      return;
    }

    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        if (event.message?.text) {
          const channelMsg: ChannelMessage = {
            channel: "messenger",
            sender_id: event.sender?.id ?? "unknown",
            raw_text: event.message.text,
            platform_message_id: event.message.mid ?? `msg-${Date.now()}`,
            sent_at: event.timestamp
              ? new Date(event.timestamp).toISOString()
              : new Date().toISOString(),
            metadata: {
              recipient_id: event.recipient?.id,
            },
          };

          if (this.onMessage) {
            await this.onMessage(channelMsg);
          }
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  }

  /**
   * Send a reply via Messenger Send API.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const url = `${GRAPH_API}/me/messages?access_token=${this.config.page_access_token}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: reply.recipient_id },
        message: { text: reply.text },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Messenger] Send failed (${resp.status}): ${errText}`);
    }
  }

  /**
   * Send a typing indicator.
   */
  async sendTyping(recipientId: string): Promise<void> {
    const url = `${GRAPH_API}/me/messages?access_token=${this.config.page_access_token}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: "typing_on",
      }),
    });
  }
}

// ─── Messenger Types ─────────────────────────────────────────────────────

interface MessengerWebhookBody {
  object?: string;
  entry?: Array<{
    messaging?: Array<{
      sender?: { id: string };
      recipient?: { id: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
      };
    }>;
  }>;
}
