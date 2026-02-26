/**
 * openclaw-spa — Gateway Plugin (Middleware)
 *
 * SPAProcessor: the central verification engine that processes inbound messages.
 * Express middleware factory for HTTP-based OpenClaw gateways.
 *
 * Security improvements over the original:
 *   - Bounded LRU nonce cache (prevents memory exhaustion DoS)
 *   - Per-key rate limiting (prevents brute-force / abuse)
 *   - CSP headers on all responses
 *   - Schema validation before crypto operations
 *   - Structured audit logging with key fingerprints (not raw PEMs)
 */

import type { Request, Response, NextFunction } from "express";
import type {
  SPAConfig,
  ProcessedMessage,
  VerificationResult,
  AuthLevel,
} from "../types.js";
import { AUTH_LEVEL_WEIGHT } from "../types.js";
import {
  extractEnvelopeFromMessage,
  verifyEnvelope,
} from "../crypto/envelope.js";
import { ActionGateRegistry } from "../gates/registry.js";

// ─── Bounded LRU Nonce Cache ─────────────────────────────────────────────

/**
 * A simple bounded set that evicts the oldest entries when full.
 * Prevents memory exhaustion from nonce accumulation under heavy traffic.
 */
class BoundedNonceCache {
  private cache: Set<string>;
  private order: string[];
  private maxSize: number;

  constructor(maxSize: number = 100_000) {
    this.cache = new Set();
    this.order = [];
    this.maxSize = maxSize;
  }

  /**
   * Check if nonce is fresh (not seen before).
   * Returns true if fresh, false if replay.
   * Automatically adds fresh nonces to the cache.
   */
  checkAndAdd(nonce: string): boolean {
    if (this.cache.has(nonce)) return false; // replay detected

    // Evict oldest if at capacity
    while (this.order.length >= this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.add(nonce);
    this.order.push(nonce);
    return true; // fresh nonce
  }

  get size(): number {
    return this.cache.size;
  }
}

// ─── Per-Key Rate Limiter ────────────────────────────────────────────────

/**
 * Sliding window rate limiter per key_id.
 * Prevents a single compromised key from flooding the system.
 */
class KeyRateLimiter {
  private windows: Map<string, number[]> = new Map();
  private maxPerMinute: number;

  constructor(maxPerMinute: number = 60) {
    this.maxPerMinute = maxPerMinute;
  }

  /**
   * Check if a key_id is within its rate limit.
   * Returns true if allowed, false if rate-limited.
   */
  check(key_id: string): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;

    let timestamps = this.windows.get(key_id) ?? [];
    // Prune old entries
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.maxPerMinute) {
      this.windows.set(key_id, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(key_id, timestamps);

    // Periodic cleanup of stale keys (every ~100 checks)
    if (Math.random() < 0.01) this.cleanup(windowStart);

    return true;
  }

  private cleanup(windowStart: number): void {
    for (const [key, timestamps] of this.windows.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, active);
      }
    }
  }
}

// ─── SPA Processor ───────────────────────────────────────────────────────

export class SPAProcessor {
  private config: Required<SPAConfig>;
  private gateRegistry: ActionGateRegistry;
  private nonceCache: BoundedNonceCache;
  private rateLimiter: KeyRateLimiter;

  constructor(config: SPAConfig) {
    this.config = {
      key_registry_path: config.key_registry_path,
      gate_registry_path: config.gate_registry_path ?? "",
      max_envelope_age_seconds: config.max_envelope_age_seconds ?? 300,
      block_unsigned_gated: config.block_unsigned_gated ?? true,
      verbose: config.verbose ?? false,
      max_nonce_cache_size: config.max_nonce_cache_size ?? 100_000,
      rate_limit_per_key_per_minute: config.rate_limit_per_key_per_minute ?? 60,
    };

    this.gateRegistry = ActionGateRegistry.fromFile(config.gate_registry_path);
    this.nonceCache = new BoundedNonceCache(this.config.max_nonce_cache_size);
    this.rateLimiter = new KeyRateLimiter(this.config.rate_limit_per_key_per_minute);
  }

  /**
   * Process an inbound message through the full SPA verification pipeline.
   */
  process(input: {
    text: string;
    channel_sender?: string;
    tool_calls?: string[];
  }): ProcessedMessage {
    const { text, tool_calls = [] } = input;

    // ── Step 1: Try to extract an embedded SPA1: token ────────────────────
    const extracted = extractEnvelopeFromMessage(text);

    if (!extracted) {
      // Unsigned message
      return this.processUnsigned(text, tool_calls);
    }

    const { envelope, clean_text } = extracted;

    // ── Step 2: Rate limit check ──────────────────────────────────────────
    if (!this.rateLimiter.check(envelope.key_id)) {
      this.audit("RATE_LIMITED", envelope.key_id, text);
      return {
        allowed: false,
        text: clean_text || text,
        verification: {
          status: "invalid_signature",
          key_id: envelope.key_id,
          message: "Rate limit exceeded for this key",
        },
        granted_auth_level: null,
        approved_tools: [],
        blocked_tools: tool_calls,
        rejection_reason: `Rate limit exceeded for key ${envelope.key_id}. Max ${this.config.rate_limit_per_key_per_minute}/min.`,
      };
    }

    // ── Step 3: Verify envelope ───────────────────────────────────────────
    const verification = verifyEnvelope(envelope, this.config.key_registry_path, {
      max_age_seconds: this.config.max_envelope_age_seconds,
      checkNonce: (nonce) => this.nonceCache.checkAndAdd(nonce),
    });

    if (verification.status !== "valid") {
      this.audit("REJECTED", envelope.key_id, text, verification.status);
      return {
        allowed: false,
        text: clean_text || text,
        verification,
        granted_auth_level: null,
        approved_tools: [],
        blocked_tools: tool_calls,
        rejection_reason: `Verification failed: ${verification.status} — ${verification.message ?? ""}`,
      };
    }

    // ── Step 4: Gate tool calls against granted auth level ────────────────
    const granted_level = verification.auth_level!;
    const all_tools = [
      ...tool_calls,
      ...(envelope.payload.requested_tools ?? []),
    ];
    const unique_tools = [...new Set(all_tools)];
    const { approved, blocked } = this.gateRegistry.partition(unique_tools, granted_level);

    const allowed = blocked.length === 0;

    this.audit(
      allowed ? "ALLOWED" : "PARTIALLY_BLOCKED",
      envelope.key_id,
      clean_text || text,
      `level=${granted_level} approved=[${approved.join(",")}] blocked=[${blocked.join(",")}]`
    );

    return {
      allowed,
      text: clean_text || envelope.payload.text,
      verification,
      granted_auth_level: granted_level,
      approved_tools: approved,
      blocked_tools: blocked,
      rejection_reason: blocked.length > 0
        ? `Blocked tools require higher auth: ${blocked.join(", ")}`
        : undefined,
    };
  }

  /**
   * Process an unsigned message — only ungated (standard) tools are allowed.
   */
  private processUnsigned(text: string, tool_calls: string[]): ProcessedMessage {
    const verification: VerificationResult = { status: "unsigned" };

    if (tool_calls.length === 0) {
      // No tools requested — allow through
      return {
        allowed: true,
        text,
        verification,
        granted_auth_level: "standard",
        approved_tools: [],
        blocked_tools: [],
      };
    }

    const { approved, blocked } = this.gateRegistry.partition(tool_calls, "standard");
    const has_blocked = blocked.length > 0 && this.config.block_unsigned_gated;

    return {
      allowed: !has_blocked,
      text,
      verification,
      granted_auth_level: "standard",
      approved_tools: approved,
      blocked_tools: has_blocked ? blocked : [],
      rejection_reason: has_blocked
        ? `Unsigned message cannot use gated tools: ${blocked.join(", ")}. Sign your prompt with an appropriate key.`
        : undefined,
    };
  }

  private audit(action: string, key_id: string, text: string, detail?: string): void {
    if (!this.config.verbose) return;
    const ts = new Date().toISOString();
    const snippet = text.slice(0, 80).replace(/\n/g, " ");
    const keyShort = key_id.split("-")[0] ?? "none";
    console.log(`[SPA ${ts}] ${action} key=${keyShort} ${detail ?? ""} text="${snippet}..."`);
  }
}

// ─── Express Middleware ──────────────────────────────────────────────────

/**
 * CSP headers to include on all responses.
 */
const CSP_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'self'; script-src 'none'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/**
 * Create an Express middleware that verifies SPA envelopes on inbound messages.
 *
 * Usage:
 *   app.use("/message", createSPAMiddleware({ key_registry_path: ".spa/keys.json" }));
 */
export function createSPAMiddleware(config: SPAConfig) {
  const processor = new SPAProcessor(config);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Apply CSP headers to every response
    for (const [header, value] of Object.entries(CSP_HEADERS)) {
      res.setHeader(header, value);
    }

    if (req.method !== "POST") {
      next();
      return;
    }

    const body = req.body as { text?: string; message?: string; tool_calls?: string[] } | undefined;
    const text = body?.text ?? body?.message ?? "";
    const tool_calls = body?.tool_calls ?? [];

    if (!text) {
      res.status(400).json({ error: "Missing 'text' or 'message' field" });
      return;
    }

    const result = processor.process({ text, tool_calls });

    if (!result.allowed) {
      res.status(403).json({
        error: "SPA authorization failed",
        reason: result.rejection_reason,
        verification_status: result.verification.status,
      });
      return;
    }

    // Attach SPA result to request for downstream handlers
    (req as unknown as Record<string, unknown>)["spa"] = result;
    next();
  };
}
