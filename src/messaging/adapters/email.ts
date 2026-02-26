/**
 * openclaw-spa — Email Adapter (IMAP/SMTP)
 *
 * Polls an IMAP mailbox for new messages and sends replies via SMTP.
 * Works with any email provider (Gmail, Outlook, self-hosted, etc.).
 *
 * Setup:
 *   1. Configure IMAP/SMTP host, port, and credentials
 *   2. For Gmail: enable "Less secure apps" or use App Passwords
 *   3. Optionally set allowed_senders to whitelist specific addresses
 *
 * Note: Uses raw TCP via Node.js net/tls modules for IMAP/SMTP.
 * For production, consider using nodemailer + imap libraries.
 */

import * as net from "net";
import * as tls from "tls";
import type { ChannelMessage, ChannelReply, EmailConfig } from "../types.js";

const DEFAULT_POLL_INTERVAL = 10000;

export class EmailAdapter {
  private config: EmailConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeenUid = 0;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Start polling the IMAP mailbox for new messages.
   */
  startPolling(): void {
    const interval = this.config.poll_interval_ms ?? DEFAULT_POLL_INTERVAL;
    console.log(`[Email] Polling ${this.config.imap_host} every ${interval}ms`);
    this.poll(); // Initial poll
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
      const messages = await this.fetchNewMessages();
      for (const msg of messages) {
        if (this.onMessage) {
          await this.onMessage(msg);
        }
      }
    } catch (err) {
      console.error("[Email] Poll error:", err);
    }
  }

  /**
   * Fetch new messages via a simplified IMAP flow.
   * In production, use a proper IMAP library like `imapflow`.
   */
  private async fetchNewMessages(): Promise<ChannelMessage[]> {
    return new Promise((resolve, reject) => {
      const messages: ChannelMessage[] = [];
      const port = this.config.imap_port ?? (this.config.imap_tls !== false ? 993 : 143);
      const useTls = this.config.imap_tls !== false;

      let dataBuffer = "";
      let phase: "login" | "select" | "search" | "fetch" | "done" = "login";

      const handleData = (data: string) => {
        dataBuffer += data;

        if (phase === "login" && dataBuffer.includes("OK")) {
          dataBuffer = "";
          phase = "select";
          const mailbox = this.config.mailbox ?? "INBOX";
          socket.write(`A2 SELECT "${mailbox}"\r\n`);
        } else if (phase === "select" && dataBuffer.includes("A2 OK")) {
          dataBuffer = "";
          phase = "search";
          socket.write(`A3 SEARCH UNSEEN\r\n`);
        } else if (phase === "search" && dataBuffer.includes("A3 OK")) {
          const searchLine = dataBuffer.split("\r\n").find((l) => l.startsWith("* SEARCH"));
          const uids = searchLine
            ? searchLine.replace("* SEARCH", "").trim().split(" ").filter(Boolean)
            : [];
          dataBuffer = "";

          if (uids.length === 0) {
            phase = "done";
            socket.write("A99 LOGOUT\r\n");
            resolve(messages);
            return;
          }

          // Fetch each message (simplified — just headers + body preview)
          phase = "fetch";
          const uidList = uids.join(",");
          socket.write(`A4 FETCH ${uidList} (BODY[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] BODY[TEXT])\r\n`);
        } else if (phase === "fetch" && dataBuffer.includes("A4 OK")) {
          // Parse fetched data (simplified)
          const parts = dataBuffer.split("* ");
          for (const part of parts) {
            if (!part.trim()) continue;
            const fromMatch = part.match(/From:\s*(.+)/i);
            const subjectMatch = part.match(/Subject:\s*(.+)/i);
            const dateMatch = part.match(/Date:\s*(.+)/i);
            const msgIdMatch = part.match(/Message-ID:\s*<(.+?)>/i);

            if (fromMatch) {
              const fromRaw = fromMatch[1]?.trim() ?? "";
              const emailMatch = fromRaw.match(/<(.+?)>/) ?? [null, fromRaw];
              const senderEmail = emailMatch[1] ?? fromRaw;

              // Enforce sender allowlist
              if (this.config.allowed_senders?.length) {
                if (!this.config.allowed_senders.includes(senderEmail)) continue;
              }

              // Extract body text (very simplified)
              const bodyStart = part.indexOf("\r\n\r\n");
              const rawText = bodyStart > -1 ? part.slice(bodyStart + 4).trim() : "";
              // Strip IMAP artifacts
              const cleanText = rawText.replace(/\)\r\n.*$/s, "").trim();

              if (cleanText) {
                messages.push({
                  channel: "email",
                  sender_id: senderEmail,
                  sender_name: fromRaw,
                  raw_text: subjectMatch ? `[${subjectMatch[1]?.trim()}] ${cleanText}` : cleanText,
                  platform_message_id: msgIdMatch?.[1] ?? `email-${Date.now()}`,
                  sent_at: dateMatch?.[1] ? new Date(dateMatch[1]).toISOString() : new Date().toISOString(),
                  metadata: { subject: subjectMatch?.[1]?.trim() },
                });
              }
            }
          }

          phase = "done";
          socket.write("A99 LOGOUT\r\n");
          resolve(messages);
        }
      };

      const connectOpts = { host: this.config.imap_host, port };
      let socket: net.Socket;

      if (useTls) {
        socket = tls.connect(connectOpts, () => {
          socket.write(`A1 LOGIN "${this.config.username}" "${this.config.password}"\r\n`);
        });
      } else {
        socket = net.connect(connectOpts, () => {
          socket.write(`A1 LOGIN "${this.config.username}" "${this.config.password}"\r\n`);
        });
      }

      socket.setEncoding("utf-8");
      socket.on("data", (chunk) => handleData(String(chunk)));
      socket.on("error", (err) => reject(err));
      socket.on("end", () => {
        if (phase !== "done") resolve(messages);
      });

      // Timeout after 30s
      setTimeout(() => {
        if (phase !== "done") {
          socket.destroy();
          resolve(messages);
        }
      }, 30000);
    });
  }

  /**
   * Send a reply via SMTP.
   * Simplified implementation — for production use nodemailer.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.config.smtp_port ?? (this.config.smtp_tls !== false ? 465 : 25);
      const useTls = this.config.smtp_tls !== false;

      const message = [
        `From: ${this.config.username}`,
        `To: ${reply.recipient_id}`,
        `Subject: Re: OpenClaw SPA`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        reply.text,
      ].join("\r\n");

      let phase: "greeting" | "ehlo" | "auth" | "from" | "to" | "data" | "body" | "quit" | "done" = "greeting";

      const handleData = (data: string) => {
        const code = parseInt(data.slice(0, 3), 10);
        if (phase === "greeting" && code === 220) {
          phase = "ehlo";
          socket.write(`EHLO openclaw-spa\r\n`);
        } else if (phase === "ehlo" && code === 250) {
          phase = "auth";
          const creds = Buffer.from(`\0${this.config.username}\0${this.config.password}`).toString("base64");
          socket.write(`AUTH PLAIN ${creds}\r\n`);
        } else if (phase === "auth" && code === 235) {
          phase = "from";
          socket.write(`MAIL FROM:<${this.config.username}>\r\n`);
        } else if (phase === "from" && code === 250) {
          phase = "to";
          socket.write(`RCPT TO:<${reply.recipient_id}>\r\n`);
        } else if (phase === "to" && code === 250) {
          phase = "data";
          socket.write(`DATA\r\n`);
        } else if (phase === "data" && code === 354) {
          phase = "body";
          socket.write(`${message}\r\n.\r\n`);
        } else if (phase === "body" && code === 250) {
          phase = "quit";
          socket.write(`QUIT\r\n`);
        } else if (phase === "quit") {
          phase = "done";
          socket.destroy();
          resolve();
        }
      };

      const connectOpts = { host: this.config.smtp_host, port };
      let socket: net.Socket;

      if (useTls) {
        socket = tls.connect(connectOpts);
      } else {
        socket = net.connect(connectOpts);
      }

      socket.setEncoding("utf-8");
      socket.on("data", (chunk) => handleData(String(chunk)));
      socket.on("error", (err) => {
        console.error("[Email] SMTP error:", err);
        reject(err);
      });

      setTimeout(() => {
        if (phase !== "done") {
          socket.destroy();
          resolve();
        }
      }, 15000);
    });
  }
}
