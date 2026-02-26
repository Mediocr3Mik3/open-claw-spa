/**
 * openclaw-spa — WeChat Adapter
 *
 * Connects to WeChat via the Official Account API.
 *
 * Setup:
 *   1. Register a WeChat Official Account at https://mp.weixin.qq.com
 *   2. Get the App ID and App Secret
 *   3. Configure the webhook URL and verification token
 *   4. Optionally enable encrypted mode with an EncodingAESKey
 *
 * Note: Requires a Chinese business entity for full access.
 * Sandbox accounts are available for development.
 */

import * as crypto from "crypto";
import type { ChannelMessage, ChannelReply, WeChatConfig } from "../types.js";

const WECHAT_API = "https://api.weixin.qq.com/cgi-bin";

export class WeChatAdapter {
  private config: WeChatConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config: WeChatConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle webhook verification (GET request from WeChat).
   */
  handleVerification(
    req: { query: Record<string, string> },
    res: { status: (code: number) => { send: (body: string) => void } }
  ): void {
    const { signature, timestamp, nonce, echostr } = req.query;

    // Sort token, timestamp, nonce and compute SHA1
    const arr = [this.config.token, timestamp ?? "", nonce ?? ""].sort();
    const hash = crypto.createHash("sha1").update(arr.join("")).digest("hex");

    if (hash === signature) {
      res.status(200).send(echostr ?? "");
    } else {
      res.status(403).send("Verification failed");
    }
  }

  /**
   * Handle incoming messages (POST request — XML body).
   * WeChat sends XML; this expects the body to be pre-parsed.
   */
  async handleWebhook(
    req: { body: WeChatMessage },
    res: { type: (t: string) => void; status: (code: number) => { send: (body: string) => void } }
  ): Promise<void> {
    const msg = req.body;

    if (msg.MsgType !== "text" || !msg.Content) {
      // Respond with "success" to acknowledge
      res.type("text/plain");
      res.status(200).send("success");
      return;
    }

    const channelMsg: ChannelMessage = {
      channel: "wechat",
      sender_id: msg.FromUserName ?? "unknown",
      raw_text: msg.Content,
      platform_message_id: msg.MsgId?.toString() ?? `wechat-${Date.now()}`,
      sent_at: msg.CreateTime
        ? new Date(parseInt(msg.CreateTime, 10) * 1000).toISOString()
        : new Date().toISOString(),
      metadata: {
        to_user: msg.ToUserName,
        msg_type: msg.MsgType,
      },
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }

    // Passive reply via XML (within 5 seconds — WeChat requirement)
    // For async replies, use Customer Service API instead
    res.type("application/xml");
    res.status(200).send("success");
  }

  /**
   * Get an access token for the WeChat API.
   */
  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const url = `${WECHAT_API}/token?grant_type=client_credential&appid=${this.config.app_id}&secret=${this.config.app_secret}`;
    const resp = await fetch(url);
    const data = (await resp.json()) as { access_token: string; expires_in: number; errcode?: number };

    if (data.errcode) {
      throw new Error(`[WeChat] Token error: ${JSON.stringify(data)}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  /**
   * Send a reply via WeChat Customer Service Message API.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const token = await this.getToken();
    const url = `${WECHAT_API}/message/custom/send?access_token=${token}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: reply.recipient_id,
        msgtype: "text",
        text: { content: reply.text },
      }),
    });

    const data = (await resp.json()) as { errcode?: number; errmsg?: string };
    if (data.errcode) {
      console.error(`[WeChat] Send failed: ${data.errmsg}`);
    }
  }
}

// ─── WeChat Types ────────────────────────────────────────────────────────

interface WeChatMessage {
  ToUserName?: string;
  FromUserName?: string;
  CreateTime?: string;
  MsgType?: string;
  Content?: string;
  MsgId?: string | number;
}
