/**
 * openclaw-spa — Matrix Adapter
 *
 * Connects to a Matrix homeserver via the Client-Server API.
 * Supports any Matrix-compatible client (Element, FluffyChat, etc.).
 *
 * Setup:
 *   1. Create a bot account on your Matrix homeserver
 *   2. Get an access token (via login API or Element settings)
 *   3. Invite the bot to the rooms you want to monitor
 *   4. Optionally set allowed_room_ids to restrict access
 */

import type { ChannelMessage, ChannelReply, MatrixConfig } from "../types.js";

export class MatrixAdapter {
  private config: MatrixConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private syncToken: string | null = null;
  private running = false;

  constructor(config: MatrixConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Start long-polling the /sync endpoint.
   */
  async startSync(): Promise<void> {
    this.running = true;
    console.log(`[Matrix] Starting sync with ${this.config.homeserver_url}`);

    // Initial sync to get the since token (skip historical messages)
    await this.doSync(true);

    // Ongoing sync loop
    while (this.running) {
      try {
        await this.doSync(false);
      } catch (err) {
        console.error("[Matrix] Sync error:", err);
        await sleep(5000);
      }
    }
  }

  stopSync(): void {
    this.running = false;
  }

  private async doSync(initialSync: boolean): Promise<void> {
    const baseUrl = this.config.homeserver_url.replace(/\/$/, "");
    let url = `${baseUrl}/_matrix/client/v3/sync?timeout=30000`;

    if (this.syncToken) {
      url += `&since=${this.syncToken}`;
    }
    if (initialSync) {
      url += `&filter={"room":{"timeline":{"limit":0}}}`;
    }

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.access_token}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Sync failed (${resp.status}): ${errText}`);
    }

    const data = (await resp.json()) as MatrixSyncResponse;
    this.syncToken = data.next_batch ?? this.syncToken;

    if (initialSync) return;

    // Process room events
    const rooms = data.rooms?.join ?? {};
    for (const [roomId, room] of Object.entries(rooms)) {
      // Enforce room allowlist
      if (this.config.allowed_room_ids?.length) {
        if (!this.config.allowed_room_ids.includes(roomId)) continue;
      }

      const events = room.timeline?.events ?? [];
      for (const event of events) {
        if (event.type !== "m.room.message") continue;
        if (event.sender === this.config.user_id) continue;

        const content = event.content as Record<string, unknown>;
        const msgtype = content["msgtype"] as string;
        if (msgtype !== "m.text") continue;

        const channelMsg: ChannelMessage = {
          channel: "matrix",
          sender_id: event.sender ?? "unknown",
          raw_text: (content["body"] as string) ?? "",
          platform_message_id: event.event_id ?? `matrix-${Date.now()}`,
          sent_at: event.origin_server_ts
            ? new Date(event.origin_server_ts).toISOString()
            : new Date().toISOString(),
          metadata: { room_id: roomId },
        };

        if (this.onMessage) {
          await this.onMessage(channelMsg);
        }
      }
    }
  }

  /**
   * Send a reply via Matrix Client-Server API.
   */
  async sendReply(reply: ChannelReply, roomId: string): Promise<void> {
    const baseUrl = this.config.homeserver_url.replace(/\/$/, "");
    const txnId = `spa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;

    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: reply.text,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Matrix] Send failed (${resp.status}): ${errText}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Matrix Types ────────────────────────────────────────────────────────

interface MatrixSyncResponse {
  next_batch?: string;
  rooms?: {
    join?: Record<string, {
      timeline?: {
        events?: Array<{
          type?: string;
          sender?: string;
          event_id?: string;
          origin_server_ts?: number;
          content?: unknown;
        }>;
      };
    }>;
  };
}
