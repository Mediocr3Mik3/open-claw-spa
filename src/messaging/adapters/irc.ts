/**
 * openclaw-spa — IRC Adapter
 *
 * Connects to an IRC server via raw TCP/TLS socket.
 * Listens for DMs (PRIVMSG to bot nick) and @mentions in channels.
 *
 * Setup:
 *   1. Configure server, port, nickname, and channels
 *   2. Optionally set NickServ password for registered nicks
 *   3. Set mentions_only to false to process all channel messages
 */

import * as net from "net";
import * as tls from "tls";
import type { ChannelMessage, ChannelReply, IRCConfig } from "../types.js";

export class IRCAdapter {
  private config: IRCConfig;
  private onMessage: ((msg: ChannelMessage) => Promise<void>) | null = null;
  private socket: net.Socket | null = null;
  private registered = false;

  constructor(config: IRCConfig) {
    this.config = config;
  }

  onIncoming(handler: (msg: ChannelMessage) => Promise<void>): void {
    this.onMessage = handler;
  }

  /**
   * Connect to the IRC server.
   */
  connect(): void {
    const port = this.config.port ?? (this.config.tls !== false ? 6697 : 6667);
    const useTls = this.config.tls !== false;

    const connectOpts = { host: this.config.server, port };

    if (useTls) {
      this.socket = tls.connect(connectOpts, () => this.onConnect());
    } else {
      this.socket = net.connect(connectOpts, () => this.onConnect());
    }

    this.socket.setEncoding("utf-8");

    let buffer = "";
    this.socket.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        this.handleLine(line);
      }
    });

    this.socket.on("close", () => {
      console.log("[IRC] Connection closed, reconnecting in 10s...");
      this.registered = false;
      setTimeout(() => this.connect(), 10000);
    });

    this.socket.on("error", (err) => {
      console.error("[IRC] Socket error:", err);
    });
  }

  private onConnect(): void {
    console.log(`[IRC] Connected to ${this.config.server}`);
    if (this.config.password) {
      this.send(`PASS ${this.config.password}`);
    }
    this.send(`NICK ${this.config.nickname}`);
    this.send(`USER ${this.config.nickname} 0 * :OpenClaw SPA Bot`);
  }

  private handleLine(line: string): void {
    // Respond to PING
    if (line.startsWith("PING")) {
      this.send(`PONG${line.slice(4)}`);
      return;
    }

    // Parse IRC message
    const parsed = parseIRCMessage(line);
    if (!parsed) return;

    // Handle numeric 001 (RPL_WELCOME) — registration complete
    if (parsed.command === "001" && !this.registered) {
      this.registered = true;
      console.log("[IRC] Registered successfully");

      // Identify with NickServ if password provided
      if (this.config.password) {
        this.send(`PRIVMSG NickServ :IDENTIFY ${this.config.password}`);
      }

      // Join channels
      for (const channel of this.config.channels) {
        this.send(`JOIN ${channel}`);
        console.log(`[IRC] Joined ${channel}`);
      }
    }

    // Handle PRIVMSG
    if (parsed.command === "PRIVMSG") {
      this.handlePrivmsg(parsed);
    }
  }

  private async handlePrivmsg(parsed: IRCParsedMessage): Promise<void> {
    const sender = parsed.prefix?.split("!")[0] ?? "unknown";
    const target = parsed.params[0] ?? "";
    const text = parsed.trailing ?? "";

    // Ignore messages from self
    if (sender.toLowerCase() === this.config.nickname.toLowerCase()) return;

    // Determine if this is a DM or channel message
    const isDM = target.toLowerCase() === this.config.nickname.toLowerCase();
    const isChannel = target.startsWith("#");

    // For channel messages, optionally only respond to @mentions
    if (isChannel && this.config.mentions_only !== false) {
      const mentionPattern = new RegExp(`\\b${this.config.nickname}\\b`, "i");
      if (!mentionPattern.test(text)) return;
    }

    const channelMsg: ChannelMessage = {
      channel: "irc",
      sender_id: sender,
      sender_name: sender,
      raw_text: text,
      platform_message_id: `irc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sent_at: new Date().toISOString(),
      metadata: {
        target,
        is_dm: isDM,
        full_prefix: parsed.prefix,
      },
    };

    if (this.onMessage) {
      await this.onMessage(channelMsg);
    }
  }

  /**
   * Send a reply via IRC PRIVMSG.
   */
  async sendReply(reply: ChannelReply): Promise<void> {
    // Split long messages into multiple lines (IRC has ~512 byte limit)
    const maxLen = 400;
    const lines = reply.text.match(new RegExp(`.{1,${maxLen}}`, "g")) ?? [reply.text];
    for (const line of lines) {
      this.send(`PRIVMSG ${reply.recipient_id} :${line}`);
    }
  }

  private send(raw: string): void {
    this.socket?.write(`${raw}\r\n`);
  }

  disconnect(): void {
    this.send("QUIT :OpenClaw SPA shutting down");
    this.socket?.destroy();
    this.socket = null;
  }
}

// ─── IRC Parsing ─────────────────────────────────────────────────────────

interface IRCParsedMessage {
  prefix?: string;
  command: string;
  params: string[];
  trailing?: string;
}

function parseIRCMessage(raw: string): IRCParsedMessage | null {
  if (!raw) return null;

  let prefix: string | undefined;
  let rest = raw;

  if (rest.startsWith(":")) {
    const idx = rest.indexOf(" ");
    if (idx === -1) return null;
    prefix = rest.slice(1, idx);
    rest = rest.slice(idx + 1);
  }

  let trailing: string | undefined;
  const trailingIdx = rest.indexOf(" :");
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2);
    rest = rest.slice(0, trailingIdx);
  }

  const parts = rest.split(" ").filter(Boolean);
  const command = parts.shift() ?? "";
  const params = parts;

  return { prefix, command, params, trailing };
}
