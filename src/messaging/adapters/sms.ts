/**
 * openclaw-spa — SMS/MMS Adapter (Twilio)
 *
 * Receives inbound SMS via Twilio webhook and sends replies via Twilio REST API.
 *
 * Setup:
 *   1. Create a Twilio account at https://www.twilio.com
 *   2. Get Account SID, Auth Token, and a Twilio phone number
 *   3. Set the webhook URL for your Twilio number to POST /webhook/sms
 */

import type { ChannelMessage, ChannelReply, SMSConfig } from "../types.js";

export class SMSAdapter {
  private config: SMSConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;

  constructor(config: SMSConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle inbound Twilio webhook (Express route handler).
   * Twilio POSTs form-urlencoded data.
   */
  handleWebhook(req: { body: Record<string, string> }, res: { status: (code: number) => { send: (body: string) => void }; type: (t: string) => void }): void {
    const body = req.body;
    const from = body["From"] ?? "";
    const text = body["Body"] ?? "";
    const messageSid = body["MessageSid"] ?? `sms-${Date.now()}`;

    if (!from || !text) {
      res.type("text/xml");
      res.status(200).send("<Response></Response>");
      return;
    }

    const channelMsg: ChannelMessage = {
      channel: "sms",
      sender_id: from,
      raw_text: text,
      platform_message_id: messageSid,
      sent_at: new Date().toISOString(),
      metadata: {
        to: body["To"],
        num_media: body["NumMedia"],
      },
    };

    if (this.onMessage) {
      this.onMessage(channelMsg).catch((err) =>
        console.error("[SMS] Handler error:", err)
      );
    }

    // Respond with empty TwiML (we send replies via REST API)
    res.type("text/xml");
    res.status(200).send("<Response></Response>");
  }

  /**
   * Send an SMS reply via Twilio REST API.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.account_sid}/Messages.json`;

    const params = new URLSearchParams({
      To: reply.recipient_id,
      From: this.config.from_number,
      Body: reply.text,
    });

    const auth = Buffer.from(`${this.config.account_sid}:${this.config.auth_token}`).toString("base64");

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[SMS] Twilio send failed (${resp.status}): ${errText}`);
    }
  }
}
