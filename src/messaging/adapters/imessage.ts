/**
 * openclaw-spa — iMessage Adapter
 *
 * macOS-only adapter that reads/sends iMessages via AppleScript and
 * the Messages.app SQLite database (chat.db).
 *
 * Requirements:
 *   - macOS with Messages.app configured
 *   - Full Disk Access granted to the Node.js process (for chat.db)
 *   - sqlite3 available on the system
 *
 * Limitations:
 *   - macOS-only (AppleScript + Messages.app)
 *   - Requires Full Disk Access for chat.db reads
 *   - Polling-based (no real-time push from Messages.app)
 */

import { execSync } from "child_process";
import * as path from "path";
import * as os from "os";
import type { ChannelMessage, ChannelReply, iMessageConfig } from "../types.js";

const DEFAULT_CHAT_DB = path.join(os.homedir(), "Library", "Messages", "chat.db");
const DEFAULT_POLL_INTERVAL = 3000;

export class iMessageAdapter {
  private config: iMessageConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastRowId = 0;

  constructor(config: iMessageConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Start polling chat.db for new messages.
   */
  startPolling(): void {
    const interval = this.config.poll_interval_ms ?? DEFAULT_POLL_INTERVAL;

    // Get the current max ROWID so we only process new messages
    this.lastRowId = this.getMaxRowId();
    console.log(`[iMessage] Polling started (interval: ${interval}ms, from ROWID > ${this.lastRowId})`);

    this.pollTimer = setInterval(() => this.poll(), interval);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private getMaxRowId(): number {
    try {
      const dbPath = this.config.chat_db_path ?? DEFAULT_CHAT_DB;
      const result = execSync(
        `sqlite3 "${dbPath}" "SELECT MAX(ROWID) FROM message;"`,
        { encoding: "utf-8" }
      ).trim();
      return parseInt(result, 10) || 0;
    } catch {
      console.error("[iMessage] Failed to read chat.db — do you have Full Disk Access?");
      return 0;
    }
  }

  private async poll(): Promise<void> {
    try {
      const dbPath = this.config.chat_db_path ?? DEFAULT_CHAT_DB;
      const query = `
        SELECT
          m.ROWID,
          m.text,
          m.date,
          m.is_from_me,
          h.id as sender_id
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.ROWID > ${this.lastRowId}
          AND m.is_from_me = 0
          AND m.text IS NOT NULL
        ORDER BY m.ROWID ASC
        LIMIT 50;
      `.replace(/\n/g, " ").trim();

      const result = execSync(
        `sqlite3 -separator '|||' "${dbPath}" "${query}"`,
        { encoding: "utf-8" }
      ).trim();

      if (!result) return;

      const rows = result.split("\n").filter(Boolean);
      for (const row of rows) {
        const parts = row.split("|||");
        const rowId = parseInt(parts[0] ?? "0", 10);
        const text = parts[1] ?? "";
        const dateVal = parts[2] ?? "";
        const senderId = parts[4] ?? "unknown";

        if (rowId > this.lastRowId) this.lastRowId = rowId;

        // Enforce sender allowlist
        if (this.config.allowed_senders?.length) {
          if (!this.config.allowed_senders.includes(senderId)) continue;
        }

        // Convert Apple epoch (nanoseconds since 2001-01-01) to ISO
        const appleEpochOffset = 978307200;
        const unixTimestamp = Math.floor(parseInt(dateVal, 10) / 1e9) + appleEpochOffset;
        const timestamp = new Date(unixTimestamp * 1000).toISOString();

        const channelMsg: ChannelMessage = {
          channel: "imessage",
          sender_id: senderId,
          sender_name: senderId,
          raw_text: text,
          platform_message_id: `imsg-${rowId}`,
          sent_at: timestamp,
          metadata: { rowid: rowId },
        };

        if (this.onMessage) {
          await this.onMessage(channelMsg);
        }
      }
    } catch (err) {
      console.error("[iMessage] Poll error:", err);
    }
  }

  /**
   * Send a reply via AppleScript → Messages.app
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    const escapedText = reply.text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const recipientId = reply.recipient_id;

    // Determine if it's a phone number or email
    const service = recipientId.includes("@") ? "E:${recipientId}" : recipientId;

    const script = `
      tell application "Messages"
        set targetBuddy to buddy "${service}" of service 1
        send "${escapedText}" to targetBuddy
      end tell
    `;

    try {
      execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: "utf-8" });
    } catch (err) {
      console.error(`[iMessage] Send failed to ${recipientId}:`, err);
    }
  }
}
