/**
 * Core crypto tests — key generation, envelope signing, and verification.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  generateKeyPair,
  computeFingerprint,
  registerPublicKey,
  lookupKey,
  revokeKey,
  listKeys,
} from "../crypto/key-manager.js";
import {
  signEnvelope,
  verifyEnvelope,
  canonicalize,
  validatePayload,
  serializeEnvelope,
  deserializeEnvelope,
} from "../crypto/envelope.js";
import type { AuthLevel } from "../types.js";

const TEST_DIR = path.join(os.tmpdir(), `spa-test-${Date.now()}`);
const REGISTRY_PATH = path.join(TEST_DIR, "keys.json");

describe("Key Manager", () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify({ version: "1.0", keys: [] }));
  });

  it("generates an ECDSA P-384 key pair", () => {
    const result = generateKeyPair("ecdsa-p384");
    expect(result.public_key_pem).toBeDefined();
    expect(result.private_key_pem).toBeDefined();
    expect(result.algorithm).toBe("ecdsa-p384");
    expect(result.key_id).toBeDefined();
  });

  it("computes a deterministic fingerprint", () => {
    const { public_key_pem } = generateKeyPair("ecdsa-p384");
    const fp1 = computeFingerprint(public_key_pem);
    const fp2 = computeFingerprint(public_key_pem);
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBeGreaterThan(10);
  });

  it("registers a public key in the registry", () => {
    const pair = generateKeyPair("ecdsa-p384");
    const entry = registerPublicKey(REGISTRY_PATH, {
      key_id: pair.key_id,
      label: "Test Key",
      public_key_pem: pair.public_key_pem,
      max_auth_level: "elevated" as AuthLevel,
      algorithm: "ecdsa-p384",
    });

    expect(entry.key_id).toBe(pair.key_id);
    expect(entry.active).toBe(true);

    const found = lookupKey(REGISTRY_PATH, entry.key_id);
    expect(found).toBeDefined();
    expect(found!.label).toBe("Test Key");
  });

  it("lists all keys", () => {
    const keys = listKeys(REGISTRY_PATH);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("revokes a key", () => {
    const pair = generateKeyPair("ecdsa-p384");
    const entry = registerPublicKey(REGISTRY_PATH, {
      key_id: pair.key_id,
      label: "Revoke Me",
      public_key_pem: pair.public_key_pem,
      max_auth_level: "standard" as AuthLevel,
      algorithm: "ecdsa-p384",
    });

    const revoked = revokeKey(REGISTRY_PATH, entry.key_id);
    expect(revoked).toBe(true);

    // lookupKey returns null for revoked keys
    const found = lookupKey(REGISTRY_PATH, entry.key_id);
    expect(found).toBeNull();
  });
});

describe("Envelope", () => {
  let privateKeyPem: string;
  let keyId: string;

  beforeAll(() => {
    const pair = generateKeyPair("ecdsa-p384");
    privateKeyPem = pair.private_key_pem;

    const entry = registerPublicKey(REGISTRY_PATH, {
      key_id: pair.key_id,
      label: "Signing Key",
      public_key_pem: pair.public_key_pem,
      max_auth_level: "admin" as AuthLevel,
      algorithm: "ecdsa-p384",
    });
    keyId = entry.key_id;
  });

  it("canonicalizes JSON deterministically", () => {
    const a = canonicalize({ b: 2, a: 1 });
    const b = canonicalize({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it("validates a well-formed payload", () => {
    const result = validatePayload({
      text: "Hello world",
      auth_level: "standard",
      timestamp: new Date().toISOString(),
      nonce: "abcdefgh",
    });
    expect(result).toBe(true);
  });

  it("rejects a payload missing text", () => {
    const result = validatePayload({
      auth_level: "standard",
      timestamp: new Date().toISOString(),
      nonce: "abcdefgh",
    });
    expect(result).toBe(false);
  });

  it("signs and verifies an envelope", () => {
    const envelope = signEnvelope({
      text: "Test message",
      auth_level: "elevated" as AuthLevel,
      key_id: keyId,
      private_key_pem: privateKeyPem,
      algorithm: "ecdsa-p384",
    });

    expect(envelope.signature).toBeDefined();
    expect(envelope.key_id).toBe(keyId);

    const result = verifyEnvelope(envelope, REGISTRY_PATH);

    expect(result.status).toBe("valid");
    expect(result.auth_level).toBe("elevated");
  });

  it("serializes and deserializes an envelope", () => {
    const envelope = signEnvelope({
      text: "Serialize test",
      auth_level: "standard" as AuthLevel,
      key_id: keyId,
      private_key_pem: privateKeyPem,
      algorithm: "ecdsa-p384",
    });

    const token = serializeEnvelope(envelope);
    expect(typeof token).toBe("string");
    expect(token.startsWith("SPA1:")).toBe(true);

    const restored = deserializeEnvelope(token);
    expect(restored).not.toBeNull();
    expect(restored!.payload.text).toBe("Serialize test");
    expect(restored!.signature).toBe(envelope.signature);
  });

  it("rejects tampered envelope", () => {
    const envelope = signEnvelope({
      text: "Original",
      auth_level: "elevated" as AuthLevel,
      key_id: keyId,
      private_key_pem: privateKeyPem,
      algorithm: "ecdsa-p384",
    });

    // Tamper with the payload
    (envelope.payload as any).text = "Tampered";

    const result = verifyEnvelope(envelope, REGISTRY_PATH);
    expect(result.status).toBe("invalid_signature");
  });
});
