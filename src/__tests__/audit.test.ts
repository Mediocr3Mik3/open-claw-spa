/**
 * Audit log tests — tamper-evident hash chain, queries, stats, NDJSON export.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AuditLog } from "../enterprise/audit.js";

const TEST_DIR = path.join(os.tmpdir(), `spa-audit-test-${Date.now()}`);
const DB_PATH = path.join(TEST_DIR, "audit.db");

describe("AuditLog", () => {
  let audit: AuditLog;

  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    audit = new AuditLog(DB_PATH);
  });

  afterAll(() => {
    audit.close();
  });

  it("logs an event and returns it with hash", () => {
    const entry = audit.log({
      event_type: "app_started",
      detail: "Test boot",
    });
    expect(entry.hash).toBeDefined();
    expect(entry.prev_hash).toBe("GENESIS");
    expect(entry.event_type).toBe("app_started");
  });

  it("chains hashes correctly", () => {
    const e1 = audit.log({ event_type: "key_generated", key_id: "k1" });
    const e2 = audit.log({ event_type: "key_registered", key_id: "k1" });
    expect(e2.prev_hash).toBe(e1.hash);
    expect(e2.hash).not.toBe(e1.hash);
  });

  it("queries by event_type", () => {
    audit.log({ event_type: "envelope_verified", key_id: "k2", status: "valid" });
    const results = audit.query({ event_type: "envelope_verified" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((e) => e.event_type === "envelope_verified")).toBe(true);
  });

  it("returns correct count", () => {
    const count = audit.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it("verifies intact hash chain", () => {
    const broken = audit.verifyChain();
    expect(broken).toBeNull();
  });

  it("returns stats grouped by event_type", () => {
    const s = audit.stats();
    expect(s["app_started"]).toBeGreaterThanOrEqual(1);
    expect(s["key_generated"]).toBeGreaterThanOrEqual(1);
  });

  it("exports NDJSON", () => {
    const ndjson = audit.exportNDJSON();
    const lines = ndjson.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event_type).toBeDefined();
    expect(parsed.hash).toBeDefined();
  });
});
