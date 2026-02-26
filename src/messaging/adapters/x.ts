/**
 * openclaw-spa — X (Twitter) DM Adapter
 *
 * Polls for Direct Messages via the X API v2 and sends replies.
 *
 * Setup:
 *   1. Create a developer account at https://developer.twitter.com
 *   2. Create an App with DM read/write permissions
 *   3. Get API Key, API Secret, Access Token, and Access Token Secret
 *   4. Enable OAuth 1.0a User Context for DM access
 *
 * Note: X API v2 DM endpoints require elevated or academic access.
 */

import * as crypto from "crypto";
import type { ChannelMessage, ChannelReply, XConfig } from "../types.js";

const X_API = "https://api.twitter.com/2";
const DEFAULT_POLL_INTERVAL = 15000;

export class XAdapter {
  private config: XConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventId: string | null = null;

  constructor(config: XConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Start polling for new DMs.
   */
  startPolling(): void {
    const interval = this.config.poll_interval_ms ?? DEFAULT_POLL_INTERVAL;
    console.log(`[X] Polling for DMs every ${interval}ms`);
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), interval);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      let url = `${X_API}/dm_events?dm_event.fields=id,text,sender_id,created_at&event_types=MessageCreate`;
      if (this.lastEventId) {
        url += `&since_id=${this.lastEventId}`;
      }

      const resp = await this.signedRequest("GET", url);
      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[X] DM poll failed (${resp.status}): ${errText}`);
        return;
      }

      const data = (await resp.json()) as XDMResponse;
      const events = data.data ?? [];

      for (const event of events) {
        if (this.lastEventId && event.id <= this.lastEventId) continue;
        this.lastEventId = event.id;

        const channelMsg: ChannelMessage = {
          channel: "x",
          sender_id: event.sender_id ?? "unknown",
          raw_text: event.text ?? "",
          platform_message_id: event.id,
          sent_at: event.created_at ?? new Date().toISOString(),
        };

        if (this.onMessage) {
          await this.onMessage(channelMsg);
        }
      }
    } catch (err) {
      console.error("[X] Poll error:", err);
    }
  }

  /**
   * Send a DM reply via X API v2.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const url = `${X_API}/dm_conversations/with/${reply.recipient_id}/messages`;

    const resp = await this.signedRequest("POST", url, {
      text: reply.text,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[X] DM send failed (${resp.status}): ${errText}`);
    }
  }

  /**
   * Make an OAuth 1.0a signed request to the X API.
   */
  private async signedRequest(
    method: string,
    url: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.api_key,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.config.access_token,
      oauth_version: "1.0",
    };

    // Build signature base string
    const parsedUrl = new URL(url);
    const allParams = new Map<string, string>();
    for (const [k, v] of parsedUrl.searchParams) allParams.set(k, v);
    for (const [k, v] of Object.entries(oauthParams)) allParams.set(k, v);

    const sortedParams = [...allParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeRFC3986(k)}=${encodeRFC3986(v)}`)
      .join("&");

    const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const baseString = `${method.toUpperCase()}&${encodeRFC3986(baseUrl)}&${encodeRFC3986(sortedParams)}`;

    const signingKey = `${encodeRFC3986(this.config.api_secret)}&${encodeRFC3986(this.config.access_token_secret)}`;
    const signature = crypto
      .createHmac("sha1", signingKey)
      .update(baseString)
      .digest("base64");

    oauthParams["oauth_signature"] = signature;

    const authHeader = "OAuth " + Object.entries(oauthParams)
      .map(([k, v]) => `${encodeRFC3986(k)}="${encodeRFC3986(v)}"`)
      .join(", ");

    const headers: Record<string, string> = {
      Authorization: authHeader,
    };

    const fetchOpts: RequestInit = { method, headers };
    if (body) {
      headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(body);
    }

    return fetch(url, fetchOpts);
  }
}

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

// ─── X Types ─────────────────────────────────────────────────────────────

interface XDMResponse {
  data?: Array<{
    id: string;
    text?: string;
    sender_id?: string;
    created_at?: string;
  }>;
}
