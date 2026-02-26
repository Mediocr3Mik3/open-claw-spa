/**
 * openclaw-spa — Core Type Definitions
 *
 * Defines the contract for the Signed Prompt Architecture (SPA).
 * Every type here is used across the core library, middleware, CLI, and adapters.
 *
 * Security model:
 *   1. Users hold asymmetric key pairs (ECDSA P-384 preferred, RSA-4096 supported)
 *   2. Each prompt is signed into a PromptEnvelope before reaching the agent
 *   3. The gateway verifies the signature, checks auth level, and gates tool access
 *   4. Unsigned prompts can only access ungated (standard) tools
 */

// ─── Auth Levels ─────────────────────────────────────────────────────────

/** Authorization tiers — each level unlocks progressively more powerful tools */
export type AuthLevel = "standard" | "elevated" | "admin";

/** Numeric weight for comparing auth levels */
export const AUTH_LEVEL_WEIGHT: Record<AuthLevel, number> = {
  standard: 0,
  elevated: 1,
  admin: 2,
};

// ─── Cryptographic Algorithm Support ─────────────────────────────────────

/** Supported signing algorithms */
export type SigningAlgorithm = "ecdsa-p384" | "rsa-4096" | "rsa-2048";

/** Default algorithm for new key generation */
export const DEFAULT_ALGORITHM: SigningAlgorithm = "ecdsa-p384";

// ─── Prompt Envelope ─────────────────────────────────────────────────────

/**
 * A signed prompt envelope — the core SPA primitive.
 *
 * The payload is canonicalized (sorted keys, deterministic JSON) before signing.
 * The signature covers the exact canonical bytes so any tampering invalidates it.
 */
export interface PromptEnvelope {
  /** SPA protocol version */
  spa_version: "1.0";
  /** The signed payload */
  payload: EnvelopePayload;
  /** Base64-encoded signature over canonical(payload) */
  signature: string;
  /** Key ID that produced this signature */
  key_id: string;
  /** Algorithm used for signing */
  algorithm?: SigningAlgorithm;
}

export interface EnvelopePayload {
  /** The user's prompt text */
  text: string;
  /** Tools the user is requesting access to */
  requested_tools?: string[];
  /** Auth level this prompt is signed at */
  auth_level: AuthLevel;
  /** ISO 8601 timestamp — used for freshness checks */
  timestamp: string;
  /** Unique nonce — prevents replay attacks */
  nonce: string;
  /** Optional sender identifier for multi-user setups */
  sender_id?: string;
}

// ─── Key Registry ────────────────────────────────────────────────────────

/** A registered public key in the SPA key registry */
export interface RegisteredKey {
  /** Unique key identifier (UUID v4) */
  key_id: string;
  /** PEM-encoded public key */
  public_key_pem: string;
  /** Maximum auth level this key may sign at */
  max_auth_level: AuthLevel;
  /** Human-readable label */
  label: string;
  /** Signing algorithm */
  algorithm?: SigningAlgorithm;
  /** Whether this key is active */
  active: boolean;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** Optional expiry */
  expires_at?: string;
  /** SHA-256 fingerprint of the public key (hex) — for safe logging */
  fingerprint?: string;
}

export interface KeyRegistry {
  version: "1.0";
  keys: RegisteredKey[];
}

// ─── Action Gate Registry ────────────────────────────────────────────────

/** Maps an OpenClaw tool/action to a required authorization level */
export interface GatedAction {
  /** Tool or action name (e.g. "shell_exec", "file_write") */
  tool: string;
  /** Minimum auth level required */
  required_level: AuthLevel;
  /** Human-readable description */
  description: string;
}

export interface GateRegistry {
  version: "1.0";
  gates: GatedAction[];
}

// ─── Verification ────────────────────────────────────────────────────────

export type VerificationStatus =
  | "valid"
  | "invalid_signature"
  | "key_not_found"
  | "key_revoked"
  | "key_expired"
  | "expired_envelope"
  | "replay_detected"
  | "auth_level_exceeded"
  | "malformed"
  | "unsigned";

export interface VerificationResult {
  status: VerificationStatus;
  key_id?: string;
  auth_level?: AuthLevel;
  message?: string;
}

// ─── SPA Config ──────────────────────────────────────────────────────────

export interface SPAConfig {
  /** Path to the key registry JSON file */
  key_registry_path: string;
  /** Path to the gate registry JSON file (optional — uses defaults if omitted) */
  gate_registry_path?: string;
  /** Max age of an envelope in seconds before it's considered stale (default: 300) */
  max_envelope_age_seconds?: number;
  /** Whether to block unsigned messages that request gated tools (default: true) */
  block_unsigned_gated?: boolean;
  /** Enable verbose audit logging (default: false) */
  verbose?: boolean;
  /** Max nonce cache size — bounded to prevent memory exhaustion (default: 100_000) */
  max_nonce_cache_size?: number;
  /** Rate limit: max envelopes per key_id per minute (default: 60) */
  rate_limit_per_key_per_minute?: number;
}

// ─── Processed Message ───────────────────────────────────────────────────

/** Result of processing a message through SPAProcessor */
export interface ProcessedMessage {
  /** Whether the message is allowed to proceed */
  allowed: boolean;
  /** Original or cleaned prompt text */
  text: string;
  /** Verification result */
  verification: VerificationResult;
  /** Effective auth level granted */
  granted_auth_level: AuthLevel | null;
  /** Tools approved for this message */
  approved_tools: string[];
  /** Tools that were requested but blocked */
  blocked_tools: string[];
  /** Human-readable rejection reason (if blocked) */
  rejection_reason?: string;
}
