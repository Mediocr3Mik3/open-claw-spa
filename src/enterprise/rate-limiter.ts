/**
 * openclaw-spa — Rate Limiter & Intrusion Detection
 *
 * In-memory sliding window rate limiter with intrusion detection alerts.
 * For distributed deployments, swap the in-memory store for Redis.
 *
 * Detects and alerts on:
 *   - Repeated invalid signatures from the same sender
 *   - Clock skew beyond threshold
 *   - Unknown sender IDs hitting gated endpoints
 *   - Rate limit violations
 */

export interface RateLimitConfig {
  /** Max requests per window per key (default: 60) */
  max_per_window?: number;
  /** Window size in seconds (default: 60) */
  window_seconds?: number;
  /** Max failed signature verifications before alert (default: 5) */
  max_failures_before_alert?: number;
  /** Clock skew threshold in seconds before alert (default: 30) */
  clock_skew_alert_seconds?: number;
}

export type IntrusionEventType =
  | "rate_limit_exceeded"
  | "repeated_invalid_signature"
  | "clock_skew_detected"
  | "unknown_sender_gated_access"
  | "replay_attack_detected";

export interface IntrusionAlert {
  type: IntrusionEventType;
  source_id: string;
  timestamp: string;
  detail: string;
  count?: number;
}

type AlertCallback = (alert: IntrusionAlert) => void;

interface WindowEntry {
  timestamps: number[];
  failure_count: number;
}

export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private windows = new Map<string, WindowEntry>();
  private alertCallbacks: AlertCallback[] = [];
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config: RateLimitConfig = {}) {
    this.config = {
      max_per_window: config.max_per_window ?? 60,
      window_seconds: config.window_seconds ?? 60,
      max_failures_before_alert: config.max_failures_before_alert ?? 5,
      clock_skew_alert_seconds: config.clock_skew_alert_seconds ?? 30,
    };

    // Clean up stale entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 300_000);
  }

  /**
   * Register a callback for intrusion alerts.
   */
  onAlert(callback: AlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  private emit(alert: IntrusionAlert): void {
    for (const cb of this.alertCallbacks) {
      try { cb(alert); } catch { /* ignore callback errors */ }
    }
  }

  /**
   * Check if a request is allowed under rate limits.
   * Returns true if allowed, false if rate-limited.
   */
  check(sourceId: string): boolean {
    const now = Date.now();
    const windowMs = this.config.window_seconds * 1000;

    let entry = this.windows.get(sourceId);
    if (!entry) {
      entry = { timestamps: [], failure_count: 0 };
      this.windows.set(sourceId, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= this.config.max_per_window) {
      this.emit({
        type: "rate_limit_exceeded",
        source_id: sourceId,
        timestamp: new Date().toISOString(),
        detail: `${entry.timestamps.length} requests in ${this.config.window_seconds}s (max: ${this.config.max_per_window})`,
        count: entry.timestamps.length,
      });
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  /**
   * Record a signature verification failure. Alerts after threshold.
   */
  recordFailure(sourceId: string): void {
    let entry = this.windows.get(sourceId);
    if (!entry) {
      entry = { timestamps: [], failure_count: 0 };
      this.windows.set(sourceId, entry);
    }

    entry.failure_count++;

    if (entry.failure_count >= this.config.max_failures_before_alert) {
      this.emit({
        type: "repeated_invalid_signature",
        source_id: sourceId,
        timestamp: new Date().toISOString(),
        detail: `${entry.failure_count} failed signature verifications`,
        count: entry.failure_count,
      });
    }
  }

  /**
   * Check for clock skew and alert if beyond threshold.
   */
  checkClockSkew(sourceId: string, envelopeTimestamp: string): boolean {
    const skew = Math.abs(Date.now() - new Date(envelopeTimestamp).getTime()) / 1000;
    if (skew > this.config.clock_skew_alert_seconds) {
      this.emit({
        type: "clock_skew_detected",
        source_id: sourceId,
        timestamp: new Date().toISOString(),
        detail: `Clock skew: ${Math.round(skew)}s (threshold: ${this.config.clock_skew_alert_seconds}s)`,
      });
      return false;
    }
    return true;
  }

  /**
   * Record an unknown sender attempting gated access.
   */
  recordUnknownSenderGated(sourceId: string, tool: string): void {
    this.emit({
      type: "unknown_sender_gated_access",
      source_id: sourceId,
      timestamp: new Date().toISOString(),
      detail: `Unknown sender attempted gated tool: ${tool}`,
    });
  }

  /**
   * Record a replay attack detection.
   */
  recordReplayAttempt(sourceId: string, nonce: string): void {
    this.emit({
      type: "replay_attack_detected",
      source_id: sourceId,
      timestamp: new Date().toISOString(),
      detail: `Replay detected — nonce: ${nonce.slice(0, 8)}...`,
    });
  }

  /**
   * Reset failure count for a source (e.g., after successful auth).
   */
  resetFailures(sourceId: string): void {
    const entry = this.windows.get(sourceId);
    if (entry) entry.failure_count = 0;
  }

  /**
   * Get current stats for monitoring.
   */
  getStats(): { active_sources: number; total_requests: number } {
    let total = 0;
    for (const entry of this.windows.values()) {
      total += entry.timestamps.length;
    }
    return { active_sources: this.windows.size, total_requests: total };
  }

  private cleanup(): void {
    const now = Date.now();
    const windowMs = this.config.window_seconds * 1000;
    for (const [key, entry] of this.windows) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0 && entry.failure_count === 0) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.windows.clear();
  }
}
