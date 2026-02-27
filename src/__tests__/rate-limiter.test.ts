/**
 * Rate limiter & intrusion detection tests.
 */

import { describe, it, expect, afterEach } from "vitest";
import { RateLimiter } from "../enterprise/rate-limiter.js";
import type { IntrusionAlert } from "../enterprise/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it("allows requests under the limit", () => {
    limiter = new RateLimiter({ max_per_window: 5, window_seconds: 60 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("user-1")).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    limiter = new RateLimiter({ max_per_window: 3, window_seconds: 60 });
    expect(limiter.check("user-1")).toBe(true);
    expect(limiter.check("user-1")).toBe(true);
    expect(limiter.check("user-1")).toBe(true);
    expect(limiter.check("user-1")).toBe(false);
  });

  it("emits rate_limit_exceeded alert", () => {
    limiter = new RateLimiter({ max_per_window: 2, window_seconds: 60 });
    const alerts: IntrusionAlert[] = [];
    limiter.onAlert((a) => alerts.push(a));

    limiter.check("user-1");
    limiter.check("user-1");
    limiter.check("user-1"); // should trigger

    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("rate_limit_exceeded");
    expect(alerts[0].source_id).toBe("user-1");
  });

  it("tracks separate windows per source", () => {
    limiter = new RateLimiter({ max_per_window: 2, window_seconds: 60 });
    expect(limiter.check("user-a")).toBe(true);
    expect(limiter.check("user-a")).toBe(true);
    expect(limiter.check("user-a")).toBe(false);
    // user-b is independent
    expect(limiter.check("user-b")).toBe(true);
    expect(limiter.check("user-b")).toBe(true);
  });

  it("emits repeated_invalid_signature after threshold", () => {
    limiter = new RateLimiter({ max_failures_before_alert: 3 });
    const alerts: IntrusionAlert[] = [];
    limiter.onAlert((a) => alerts.push(a));

    limiter.recordFailure("attacker-1");
    limiter.recordFailure("attacker-1");
    expect(alerts.length).toBe(0);

    limiter.recordFailure("attacker-1"); // 3rd → triggers
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("repeated_invalid_signature");
  });

  it("detects clock skew", () => {
    limiter = new RateLimiter({ clock_skew_alert_seconds: 5 });
    const alerts: IntrusionAlert[] = [];
    limiter.onAlert((a) => alerts.push(a));

    // Fresh timestamp should be fine
    const ok = limiter.checkClockSkew("user-1", new Date().toISOString());
    expect(ok).toBe(true);
    expect(alerts.length).toBe(0);

    // Old timestamp should trigger
    const old = new Date(Date.now() - 60_000).toISOString();
    const bad = limiter.checkClockSkew("user-1", old);
    expect(bad).toBe(false);
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("clock_skew_detected");
  });

  it("emits unknown_sender_gated_access alert", () => {
    limiter = new RateLimiter();
    const alerts: IntrusionAlert[] = [];
    limiter.onAlert((a) => alerts.push(a));

    limiter.recordUnknownSenderGated("stranger", "admin_tool");
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("unknown_sender_gated_access");
    expect(alerts[0].detail).toContain("admin_tool");
  });

  it("emits replay_attack_detected alert", () => {
    limiter = new RateLimiter();
    const alerts: IntrusionAlert[] = [];
    limiter.onAlert((a) => alerts.push(a));

    limiter.recordReplayAttempt("user-1", "nonce-12345678");
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("replay_attack_detected");
  });

  it("resets failure count", () => {
    limiter = new RateLimiter({ max_failures_before_alert: 3 });
    const alerts: IntrusionAlert[] = [];
    limiter.onAlert((a) => alerts.push(a));

    limiter.recordFailure("user-1");
    limiter.recordFailure("user-1");
    limiter.resetFailures("user-1");
    limiter.recordFailure("user-1"); // only 1 after reset
    expect(alerts.length).toBe(0);
  });

  it("reports stats", () => {
    limiter = new RateLimiter({ max_per_window: 100 });
    limiter.check("a");
    limiter.check("a");
    limiter.check("b");

    const stats = limiter.getStats();
    expect(stats.active_sources).toBe(2);
    expect(stats.total_requests).toBe(3);
  });
});
