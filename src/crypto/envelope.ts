/**
 * openclaw-spa — Envelope Signing & Verification
 *
 * Handles the creation, signing, verification, and serialization of
 * PromptEnvelopes — the core SPA security primitive.
 *
 * Security properties:
 *   - Canonical JSON ensures deterministic signing (sorted keys)
 *   - Nonce + timestamp prevent replay attacks
 *   - Algorithm-aware: ECDSA P-384 (SHA-384) or RSA (SHA-256)
 *   - Envelope schema validation rejects malformed payloads before crypto
 */

import * as crypto from "crypto";
import type {
  PromptEnvelope,
  EnvelopePayload,
  VerificationResult,
  RegisteredKey,
  AuthLevel,
  SigningAlgorithm,
} from "../types.js";
import { AUTH_LEVEL_WEIGHT } from "../types.js";
import { lookupKey } from "./key-manager.js";

// ─── Canonical JSON ──────────────────────────────────────────────────────

/**
 * Produce a deterministic JSON string by sorting keys recursively.
 * This ensures the same payload always produces the same bytes for signing.
 */
export function canonicalize(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// ─── Schema Validation ───────────────────────────────────────────────────

const VALID_AUTH_LEVELS = new Set<string>(["standard", "elevated", "admin"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Validate envelope payload structure before any cryptographic operations.
 * Rejects obviously malformed payloads early to avoid wasting CPU on bad input.
 */
export function validatePayload(payload: unknown): payload is EnvelopePayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;

  if (typeof p["text"] !== "string" || p["text"].length === 0) return false;
  if (!VALID_AUTH_LEVELS.has(p["auth_level"] as string)) return false;
  if (typeof p["timestamp"] !== "string" || !ISO_DATE_RE.test(p["timestamp"])) return false;
  if (typeof p["nonce"] !== "string" || p["nonce"].length < 8) return false;

  if (p["requested_tools"] !== undefined) {
    if (!Array.isArray(p["requested_tools"])) return false;
    if (!p["requested_tools"].every((t: unknown) => typeof t === "string")) return false;
  }

  if (p["sender_id"] !== undefined && typeof p["sender_id"] !== "string") return false;

  return true;
}

// ─── Signing ─────────────────────────────────────────────────────────────

/**
 * Determine the hash algorithm based on the signing algorithm.
 */
function hashAlgorithm(algo: SigningAlgorithm): string {
  return algo === "ecdsa-p384" ? "SHA384" : "SHA256";
}

export interface SignEnvelopeOptions {
  text: string;
  auth_level: AuthLevel;
  key_id: string;
  private_key_pem: string;
  algorithm?: SigningAlgorithm;
  requested_tools?: string[];
  sender_id?: string;
}

/**
 * Create and sign a PromptEnvelope.
 */
export function signEnvelope(opts: SignEnvelopeOptions): PromptEnvelope {
  const algorithm = opts.algorithm ?? "ecdsa-p384";

  const payload: EnvelopePayload = {
    text: opts.text,
    auth_level: opts.auth_level,
    timestamp: new Date().toISOString(),
    nonce: crypto.randomUUID(),
    ...(opts.requested_tools?.length ? { requested_tools: opts.requested_tools } : {}),
    ...(opts.sender_id ? { sender_id: opts.sender_id } : {}),
  };

  const canonical = canonicalize(payload as unknown as Record<string, unknown>);
  const signer = crypto.createSign(hashAlgorithm(algorithm));
  signer.update(canonical);
  signer.end();

  const signature = signer.sign(opts.private_key_pem, "base64");

  return {
    spa_version: "1.0",
    payload,
    signature,
    key_id: opts.key_id,
    algorithm,
  };
}

// ─── Verification ────────────────────────────────────────────────────────

/**
 * Verify a PromptEnvelope against the key registry.
 *
 * Checks performed (in order):
 *   1. Schema validation
 *   2. Key lookup (exists, active, not expired)
 *   3. Auth level within key's max
 *   4. Envelope freshness (timestamp not too old)
 *   5. Nonce replay check
 *   6. Cryptographic signature verification
 */
export function verifyEnvelope(
  envelope: PromptEnvelope,
  registryPath: string,
  opts: {
    max_age_seconds?: number;
    checkNonce?: (nonce: string) => boolean;
  } = {}
): VerificationResult {
  const max_age = opts.max_age_seconds ?? 300;

  // 1. Schema validation
  if (!validatePayload(envelope.payload)) {
    return { status: "malformed", message: "Invalid envelope payload structure" };
  }

  // 2. Key lookup
  const key = lookupKey(registryPath, envelope.key_id);
  if (!key) {
    return { status: "key_not_found", key_id: envelope.key_id, message: `Key ${envelope.key_id} not found or inactive` };
  }
  if (!key.active) {
    return { status: "key_revoked", key_id: envelope.key_id };
  }
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return { status: "key_expired", key_id: envelope.key_id };
  }

  // 3. Auth level check
  const requested = AUTH_LEVEL_WEIGHT[envelope.payload.auth_level];
  const allowed = AUTH_LEVEL_WEIGHT[key.max_auth_level];
  if (requested > allowed) {
    return {
      status: "auth_level_exceeded",
      key_id: envelope.key_id,
      auth_level: envelope.payload.auth_level,
      message: `Key max_auth_level is ${key.max_auth_level}, but envelope requests ${envelope.payload.auth_level}`,
    };
  }

  // 4. Freshness check
  const envelope_time = new Date(envelope.payload.timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - envelope_time) > max_age * 1000) {
    return {
      status: "expired_envelope",
      key_id: envelope.key_id,
      message: `Envelope timestamp is ${Math.round(Math.abs(now - envelope_time) / 1000)}s from now (max ${max_age}s)`,
    };
  }

  // 5. Nonce replay check
  if (opts.checkNonce && !opts.checkNonce(envelope.payload.nonce)) {
    return {
      status: "replay_detected",
      key_id: envelope.key_id,
      message: `Nonce ${envelope.payload.nonce} has been seen before`,
    };
  }

  // 6. Signature verification
  const algorithm = envelope.algorithm ?? detectAlgorithm(key);
  const canonical = canonicalize(envelope.payload as unknown as Record<string, unknown>);
  const verifier = crypto.createVerify(hashAlgorithm(algorithm));
  verifier.update(canonical);
  verifier.end();

  const valid = verifier.verify(key.public_key_pem, envelope.signature, "base64");
  if (!valid) {
    return {
      status: "invalid_signature",
      key_id: envelope.key_id,
      message: "Cryptographic signature verification failed",
    };
  }

  return {
    status: "valid",
    key_id: envelope.key_id,
    auth_level: envelope.payload.auth_level,
  };
}

/**
 * Detect algorithm from key metadata or PEM content.
 */
function detectAlgorithm(key: RegisteredKey): SigningAlgorithm {
  if (key.algorithm) return key.algorithm;
  // Heuristic: EC keys contain "EC" in the PEM header
  if (key.public_key_pem.includes("EC")) return "ecdsa-p384";
  return "rsa-4096";
}

// ─── Serialization ───────────────────────────────────────────────────────

const SPA_PREFIX = "SPA1:";

/**
 * Serialize an envelope to a compact token string: SPA1:<base64(json)>
 */
export function serializeEnvelope(envelope: PromptEnvelope): string {
  return SPA_PREFIX + Buffer.from(JSON.stringify(envelope)).toString("base64");
}

/**
 * Deserialize a SPA1: token back into a PromptEnvelope.
 * Returns null if the token is malformed.
 */
export function deserializeEnvelope(token: string): PromptEnvelope | null {
  if (!token.startsWith(SPA_PREFIX)) return null;
  try {
    const json = Buffer.from(token.slice(SPA_PREFIX.length), "base64").toString("utf-8");
    const parsed = JSON.parse(json) as PromptEnvelope;
    if (!parsed.spa_version || !parsed.payload || !parsed.signature || !parsed.key_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extract an SPA1: token from a mixed text message.
 * Users can send "SPA1:xxxxx please do this thing" and we extract the token.
 * Returns the envelope and the remaining clean text.
 */
export function extractEnvelopeFromMessage(text: string): {
  envelope: PromptEnvelope;
  clean_text: string;
} | null {
  const match = text.match(/SPA1:[A-Za-z0-9+/=]+/);
  if (!match) return null;

  const envelope = deserializeEnvelope(match[0]);
  if (!envelope) return null;

  const clean_text = text.replace(match[0], "").trim();
  return { envelope, clean_text };
}
