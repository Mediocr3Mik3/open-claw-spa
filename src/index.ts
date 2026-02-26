/**
 * openclaw-spa — Barrel Export
 *
 * Re-exports the public API for consumers of the library.
 *
 * Usage:
 *   import { signEnvelope, verifyEnvelope, SPAProcessor } from "openclaw-spa";
 */

// Core types
export type {
  AuthLevel,
  SigningAlgorithm,
  PromptEnvelope,
  EnvelopePayload,
  RegisteredKey,
  KeyRegistry,
  GatedAction,
  GateRegistry,
  VerificationStatus,
  VerificationResult,
  SPAConfig,
  ProcessedMessage,
} from "./types.js";

export { AUTH_LEVEL_WEIGHT, DEFAULT_ALGORITHM } from "./types.js";

// Crypto — key management
export {
  generateKeyPair,
  computeFingerprint,
  registerPublicKey,
  lookupKey,
  revokeKey,
  listKeys,
  savePrivateKey,
  loadPrivateKey,
} from "./crypto/key-manager.js";

// Crypto — envelope signing/verification
export {
  canonicalize,
  validatePayload,
  signEnvelope,
  verifyEnvelope,
  serializeEnvelope,
  deserializeEnvelope,
  extractEnvelopeFromMessage,
} from "./crypto/envelope.js";

// Gates
export { ActionGateRegistry, DEFAULT_GATES } from "./gates/registry.js";

// Middleware
export { SPAProcessor, createSPAMiddleware } from "./middleware/gateway-plugin.js";

// Messaging types
export type {
  ChannelType,
  ChannelMessage,
  ChannelReply,
  ChannelIdentity,
  MessagingBridgeConfig,
  WhatsAppConfig,
  SignalConfig,
  TelegramConfig,
  DiscordConfig,
} from "./messaging/types.js";

// Messaging bridge
export { MessagingBridge } from "./messaging/bridge.js";
export { ChannelIdentityManager } from "./messaging/identity.js";

// Messaging adapters
export { WhatsAppAdapter } from "./messaging/adapters/whatsapp.js";
export { SignalAdapter } from "./messaging/adapters/signal.js";
export { TelegramAdapter } from "./messaging/adapters/telegram.js";
export { DiscordAdapter } from "./messaging/adapters/discord.js";
