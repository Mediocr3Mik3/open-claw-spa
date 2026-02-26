/**
 * openclaw-spa — Messaging Bridge
 *
 * Channel-agnostic message processing layer.
 *
 * Flow:
 *   [WhatsApp/Signal/Telegram/Discord message]
 *        ↓  normalize to ChannelMessage
 *   [MessagingBridge.process()]
 *        ↓  check channel identity registry for sender's SPA key
 *        ↓  if sender is registered: auto-sign OR verify embedded token
 *        ↓  if sender is unregistered: unsigned path (ungated tools only)
 *        ↓  run SPAProcessor
 *        ↓  return BridgeResult → forward to OpenClaw
 *
 * IMPORTANT: Two signing modes are supported:
 *
 * Mode A — Server-held keys (simpler, less secure):
 *   The bridge server holds the user's private key and signs on their behalf.
 *   The user just sends normal WhatsApp messages. Convenient but the server
 *   is a key compromise point. Suitable for internal enterprise deployments.
 *
 * Mode B — Client-side signing (recommended):
 *   The user's mobile app (or CLI) signs the message before sending it.
 *   The signed token (SPA1:...) is embedded in the WhatsApp/Signal message.
 *   The bridge just forwards and verifies. No private keys on the bridge server.
 */

import { SPAProcessor } from "../middleware/gateway-plugin.js";
import { ChannelIdentityManager } from "./identity.js";
import { lookupKey, loadPrivateKey } from "../crypto/key-manager.js";
import { signEnvelope, serializeEnvelope, extractEnvelopeFromMessage } from "../crypto/envelope.js";
import type { MessagingBridgeConfig, ChannelMessage, ChannelType } from "./types.js";
import type { AuthLevel, ProcessedMessage } from "../types.js";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// ─── Result types ─────────────────────────────────────────────────────────

export interface BridgeResult {
  /** The processed SPA result */
  spa: ProcessedMessage;
  /** Channel the message came from */
  channel: ChannelType;
  /** The sender that was identified */
  sender_id: string;
  /** Whether this sender is registered (has an SPA identity) */
  sender_registered: boolean;
  /** Mode used for this message */
  signing_mode: "client_signed" | "server_signed" | "unsigned";
  /** Human-readable status for logging */
  summary: string;
}

// ─── Messaging Bridge ─────────────────────────────────────────────────────

export class MessagingBridge {
  private spa: SPAProcessor;
  private identity: ChannelIdentityManager;
  private config: MessagingBridgeConfig;
  private server_key_dir: string;

  constructor(config: MessagingBridgeConfig) {
    this.config = config;
    this.spa = new SPAProcessor({
      key_registry_path: config.key_registry_path,
      gate_registry_path: config.gate_registry_path,
      max_envelope_age_seconds: config.max_envelope_age_seconds ?? 300,
      block_unsigned_gated: true,
      verbose: false,
    });
    this.identity = new ChannelIdentityManager(config.identity_registry_path);
    // Default dir for server-held private keys (Mode A)
    this.server_key_dir = path.join(os.homedir(), ".openclaw-spa", "private");
  }

  /**
   * Process a normalized channel message through SPA.
   * This is the single entry point for ALL messaging channels.
   */
  async process(msg: ChannelMessage): Promise<BridgeResult> {
    // ── Step 1: Check if message already has a client-signed token ────────
    const embedded = extractEnvelopeFromMessage(msg.raw_text);

    if (embedded !== null) {
      // Mode B: client-signed
      const spa_result = this.spa.process({
        text: msg.raw_text,
        channel_sender: `${msg.channel}:${msg.sender_id}`,
      });

      return {
        spa: spa_result,
        channel: msg.channel,
        sender_id: msg.sender_id,
        sender_registered: true,
        signing_mode: "client_signed",
        summary: this.summarize("client_signed", spa_result),
      };
    }

    // ── Step 2: Look up channel identity ──────────────────────────────────
    const key_id = this.identity.lookup(msg.channel, msg.sender_id);

    if (key_id !== null) {
      // Mode A: server-side auto-sign
      const private_key_pem = this.tryLoadServerKey(key_id);

      if (private_key_pem !== null) {
        // Determine auth level from the registered key
        const registered_key = lookupKey(this.config.key_registry_path, key_id);
        const auth_level: AuthLevel = registered_key?.max_auth_level ?? "standard";

        // Parse any tool hints from the message text
        const requested_tools = parseToolHints(msg.raw_text);

        const envelope = signEnvelope({
          text: msg.raw_text,
          auth_level,
          key_id,
          private_key_pem,
          algorithm: registered_key?.algorithm,
          sender_id: `${msg.channel}:${msg.sender_id}`,
          requested_tools: requested_tools.length > 0 ? requested_tools : undefined,
        });

        const token = serializeEnvelope(envelope);
        const augmented_text = `${token} ${msg.raw_text}`;

        const spa_result = this.spa.process({
          text: augmented_text,
          channel_sender: `${msg.channel}:${msg.sender_id}`,
          tool_calls: requested_tools,
        });

        return {
          spa: spa_result,
          channel: msg.channel,
          sender_id: msg.sender_id,
          sender_registered: true,
          signing_mode: "server_signed",
          summary: this.summarize("server_signed", spa_result),
        };
      }
    }

    // ── Step 3: Unsigned path ─────────────────────────────────────────────
    const spa_result = this.spa.process({
      text: msg.raw_text,
      channel_sender: `${msg.channel}:${msg.sender_id}`,
    });

    return {
      spa: spa_result,
      channel: msg.channel,
      sender_id: msg.sender_id,
      sender_registered: key_id !== null,
      signing_mode: "unsigned",
      summary: this.summarize("unsigned", spa_result),
    };
  }

  /**
   * Register a channel sender → SPA key binding.
   */
  registerSender(
    channel: ChannelType,
    sender_id: string,
    spa_key_id: string,
    label: string
  ): void {
    this.identity.register(channel, sender_id, spa_key_id, label);
  }

  /**
   * Try to load a server-held private key for Mode A signing.
   */
  private tryLoadServerKey(key_id: string): string | null {
    const key_path = path.join(this.server_key_dir, `${key_id}.pem`);
    if (!fs.existsSync(key_path)) return null;
    try {
      return loadPrivateKey(key_path);
    } catch {
      return null;
    }
  }

  private summarize(mode: string, result: ProcessedMessage): string {
    const icon = result.allowed ? "+" : "x";
    return `[${icon}] [${mode}] status=${result.verification.status} level=${result.granted_auth_level ?? "none"} approved=[${result.approved_tools.join(",")}] blocked=[${result.blocked_tools.join(",")}]`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Very lightweight tool hint extraction.
 * Users can prefix tool names with "#tool:" in their message.
 * e.g. "Please #tool:exec run my deploy script"
 */
function parseToolHints(text: string): string[] {
  const matches = text.matchAll(/#tool:(\w+)/g);
  return [...matches].map((m) => m[1]!);
}
