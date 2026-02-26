/**
 * openclaw-spa — Signal Adapter
 *
 * Interfaces with signal-cli REST API (self-hosted) to receive/send Signal messages.
 *
 * Signal provides E2E encryption at the transport layer. SPA adds an authorization
 * layer on top — signing proves the message came from the holder of a specific key,
 * not just from "someone with this phone number."
 *
 * Setup:
 *   1. Run signal-cli in REST mode: https://github.com/bbernhard/signal-cli-rest-api
 *   2. Register a phone number with signal-cli
 *   3. Point the adapter at the signal-cli REST API URL
 */

import type { ChannelMessage, ChannelReply, SignalConfig } from "../types.js";

export class SignalAdapter {
  private config: SignalConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private polling: boolean = false;

  constructor(config: SignalConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Start polling signal-cli for new messages.
   */
  async startPolling(intervalMs: number = 2000): Promise<void> {
    this.polling = true;
    console.log(`[Signal] Polling ${this.config.api_url} every ${intervalMs}ms`);

    while (this.polling) {
      try {
        await this.pollOnce();
      } catch (err) {
        console.error("[Signal] Poll error:", err);
      }
      await sleep(intervalMs);
    }
  }

  stopPolling(): void {
    this.polling = false;
  }

  private async pollOnce(): Promise<void> {
    const url = `${this.config.api_url}/v1/receive/${encodeURIComponent(this.config.phone_number)}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      console.error(`[Signal] Receive failed (${resp.status})`);
      return;
    }

    const messages = (await resp.json()) as SignalReceiveResponse[];

    for (const msg of messages) {
      if (!msg.envelope?.dataMessage?.message) continue;

      const channelMsg: ChannelMessage = {
        channel: "signal",
        sender_id: msg.envelope.source ?? "",
        sender_name: msg.envelope.sourceName,
        raw_text: msg.envelope.dataMessage.message,
        platform_message_id: `signal-${msg.envelope.timestamp}`,
        sent_at: new Date(msg.envelope.timestamp ?? Date.now()).toISOString(),
      };

      if (this.onMessage) {
        await this.onMessage(channelMsg);
      }
    }
  }

  /**
   * Send a reply back through Signal.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const url = `${this.config.api_url}/v2/send`;

    const body = {
      number: this.config.phone_number,
      recipients: [reply.recipient_id],
      message: reply.text,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Signal] Send failed (${resp.status}): ${errText}`);
    }
  }
}

// ─── Signal Types ────────────────────────────────────────────────────────

interface SignalReceiveResponse {
  envelope?: {
    source?: string;
    sourceName?: string;
    timestamp?: number;
    dataMessage?: {
      message?: string;
      timestamp?: number;
    };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
