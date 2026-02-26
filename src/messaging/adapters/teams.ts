/**
 * openclaw-spa — Microsoft Teams Adapter
 *
 * Connects to Microsoft Teams via the Bot Framework REST API.
 *
 * Setup:
 *   1. Register a bot at https://dev.botframework.com or via Azure
 *   2. Get the App ID and App Password (Client Secret)
 *   3. Configure the messaging endpoint to POST /webhook/teams
 *   4. Install the bot in your Teams tenant
 */

import type { ChannelMessage, ChannelReply, TeamsConfig } from "../types.js";

const LOGIN_URL = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";

export class TeamsAdapter {
  private config: TeamsConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config: TeamsConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Handle incoming Bot Framework activity (Express route handler).
   */
  async handleWebhook(
    req: { body: TeamsActivity; headers: Record<string, string | undefined> },
    res: { status: (code: number) => { json: (body: unknown) => void; end: () => void } }
  ): Promise<void> {
    const activity = req.body;

    // Only process message activities
    if (activity.type !== "message" || !activity.text) {
      res.status(200).end();
      return;
    }

    const channelMsg: ChannelMessage = {
      channel: "teams",
      sender_id: activity.from?.id ?? "unknown",
      sender_name: activity.from?.name,
      raw_text: activity.text,
      platform_message_id: activity.id ?? `teams-${Date.now()}`,
      sent_at: activity.timestamp ?? new Date().toISOString(),
      metadata: {
        conversation_id: activity.conversation?.id,
        service_url: activity.serviceUrl,
        channel_id: activity.channelId,
        tenant_id: activity.conversation?.tenantId,
      },
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }

    res.status(200).end();
  }

  /**
   * Get an OAuth token for the Bot Framework.
   */
  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.app_id,
      client_secret: this.config.app_password,
      scope: "https://api.botframework.com/.default",
    });

    const resp = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = (await resp.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  /**
   * Send a reply via Bot Framework REST API.
   */
  async sendReply(reply: ChannelReply, serviceUrl: string, conversationId: string): Promise<void> {
    const token = await this.getToken();
    const url = `${serviceUrl}v3/conversations/${conversationId}/activities`;

    const activity = {
      type: "message",
      text: reply.text,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(activity),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Teams] Send failed (${resp.status}): ${errText}`);
    }
  }
}

// ─── Teams Types ─────────────────────────────────────────────────────────

interface TeamsActivity {
  type?: string;
  id?: string;
  text?: string;
  timestamp?: string;
  serviceUrl?: string;
  channelId?: string;
  from?: { id: string; name?: string };
  conversation?: { id: string; tenantId?: string };
  recipient?: { id: string; name?: string };
}
