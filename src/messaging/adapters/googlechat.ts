/**
 * openclaw-spa — Google Chat Adapter
 *
 * Connects to Google Chat via the Google Workspace Chat API.
 *
 * Setup:
 *   1. Create a Google Cloud project with Chat API enabled
 *   2. Create a Service Account and download the credentials JSON
 *   3. Configure the Chat bot in Google Workspace Admin
 *   4. Set the webhook URL to POST /webhook/googlechat
 */

import * as crypto from "crypto";
import * as fs from "fs";
import type { ChannelMessage, ChannelReply, GoogleChatConfig } from "../types.js";

const CHAT_API = "https://chat.googleapis.com/v1";

export class GoogleChatAdapter {
  private config: GoogleChatConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config: GoogleChatConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle incoming Google Chat webhook event.
   */
  async handleWebhook(
    req: { body: GoogleChatEvent },
    res: { status: (code: number) => { json: (body: unknown) => void; end: () => void } }
  ): Promise<void> {
    const event = req.body;

    if (event.type !== "MESSAGE" || !event.message?.text) {
      res.status(200).end();
      return;
    }

    const spaceId = event.space?.name ?? "";

    // Enforce space allowlist
    if (this.config.allowed_space_ids?.length) {
      if (!this.config.allowed_space_ids.includes(spaceId)) {
        res.status(200).end();
        return;
      }
    }

    const channelMsg: ChannelMessage = {
      channel: "googlechat",
      sender_id: event.user?.name ?? "unknown",
      sender_name: event.user?.displayName,
      raw_text: event.message.text,
      platform_message_id: event.message.name ?? `gchat-${Date.now()}`,
      sent_at: event.message.createTime ?? new Date().toISOString(),
      metadata: {
        space: spaceId,
        thread: event.message.thread?.name,
      },
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }

    // Synchronous reply (Google Chat expects a response body for sync replies)
    res.status(200).json({});
  }

  /**
   * Get an OAuth2 token using the service account.
   * Uses JWT-based auth (RS256 signed assertion).
   */
  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credJson = JSON.parse(
      fs.readFileSync(this.config.service_account_path, "utf-8")
    ) as ServiceAccountCredentials;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: credJson.client_email,
      scope: "https://www.googleapis.com/auth/chat.bot",
      aud: credJson.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    const segments = [
      base64url(JSON.stringify(header)),
      base64url(JSON.stringify(payload)),
    ];
    const signingInput = segments.join(".");

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    const signature = signer.sign(credJson.private_key, "base64url");
    const jwt = `${signingInput}.${signature}`;

    const tokenUrl = credJson.token_uri ?? "https://oauth2.googleapis.com/token";
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });

    const data = (await resp.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  /**
   * Send a reply via Google Chat API.
   */
  async sendReply(reply: ChannelReply, spaceName: string, threadName?: string): Promise<void> {
    const token = await this.getToken();
    let url = `${CHAT_API}/${spaceName}/messages`;
    if (threadName) {
      url += `?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;
    }

    const body: Record<string, unknown> = { text: reply.text };
    if (threadName) {
      body["thread"] = { name: threadName };
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[GoogleChat] Send failed (${resp.status}): ${errText}`);
    }
  }
}

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

// ─── Google Chat Types ───────────────────────────────────────────────────

interface GoogleChatEvent {
  type?: string;
  message?: {
    name?: string;
    text?: string;
    createTime?: string;
    thread?: { name?: string };
  };
  user?: { name?: string; displayName?: string };
  space?: { name?: string };
}

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}
