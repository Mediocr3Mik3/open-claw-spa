/**
 * openclaw-spa — Key Manager
 *
 * Generates, registers, and manages cryptographic key pairs for SPA.
 *
 * Supports:
 *   - ECDSA P-384 (default, recommended — fast signatures, strong security)
 *   - RSA-4096 (fallback — wider compatibility, slower)
 *   - RSA-2048 (legacy — supported for backward compat, not recommended for new keys)
 *
 * Key storage:
 *   - Public keys are stored in a JSON registry (shareable, versioned)
 *   - Private keys are stored as PEM files with 0o600 permissions (owner-only)
 *   - Fingerprints (SHA-256 of public key) are logged instead of raw PEMs
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type {
  KeyRegistry,
  RegisteredKey,
  SigningAlgorithm,
  AuthLevel,
} from "../types.js";
import { DEFAULT_ALGORITHM } from "../types.js";

// Re-export the default for convenience
export { DEFAULT_ALGORITHM } from "../types.js";

// ─── Key Generation ──────────────────────────────────────────────────────

export interface GeneratedKeyPair {
  key_id: string;
  public_key_pem: string;
  private_key_pem: string;
  algorithm: SigningAlgorithm;
  fingerprint: string;
}

/**
 * Generate a new key pair.
 *
 * @param algorithm - Signing algorithm (default: "ecdsa-p384")
 * @returns Generated key pair with ID, PEMs, algorithm, and fingerprint
 */
export function generateKeyPair(
  algorithm: SigningAlgorithm = "ecdsa-p384"
): GeneratedKeyPair {
  let publicKeyPem: string;
  let privateKeyPem: string;

  switch (algorithm) {
    case "ecdsa-p384": {
      const kp = crypto.generateKeyPairSync("ec", {
        namedCurve: "P-384",
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      publicKeyPem = kp.publicKey;
      privateKeyPem = kp.privateKey;
      break;
    }
    case "rsa-4096": {
      const kp = crypto.generateKeyPairSync("rsa", {
        modulusLength: 4096,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      publicKeyPem = kp.publicKey;
      privateKeyPem = kp.privateKey;
      break;
    }
    case "rsa-2048": {
      const kp = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      publicKeyPem = kp.publicKey;
      privateKeyPem = kp.privateKey;
      break;
    }
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  const key_id = crypto.randomUUID();
  const fingerprint = computeFingerprint(publicKeyPem);

  return { key_id, public_key_pem: publicKeyPem, private_key_pem: privateKeyPem, algorithm, fingerprint };
}

/**
 * Compute SHA-256 fingerprint of a public key PEM (hex-encoded).
 * Use this for logging — never log full PEMs.
 */
export function computeFingerprint(public_key_pem: string): string {
  return crypto.createHash("sha256").update(public_key_pem.trim()).digest("hex");
}

// ─── Key Registry CRUD ───────────────────────────────────────────────────

function loadRegistry(registryPath: string): KeyRegistry {
  if (!fs.existsSync(registryPath)) {
    return { version: "1.0", keys: [] };
  }
  return JSON.parse(fs.readFileSync(registryPath, "utf-8")) as KeyRegistry;
}

function saveRegistry(registryPath: string, registry: KeyRegistry): void {
  const dir = path.dirname(registryPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Register a public key in the registry.
 */
export function registerPublicKey(
  registryPath: string,
  opts: {
    key_id: string;
    public_key_pem: string;
    max_auth_level: AuthLevel;
    label: string;
    algorithm?: SigningAlgorithm;
    expires_at?: string;
  }
): RegisteredKey {
  const registry = loadRegistry(registryPath);

  const entry: RegisteredKey = {
    key_id: opts.key_id,
    public_key_pem: opts.public_key_pem,
    max_auth_level: opts.max_auth_level,
    label: opts.label,
    algorithm: opts.algorithm ?? "ecdsa-p384",
    active: true,
    created_at: new Date().toISOString(),
    expires_at: opts.expires_at,
    fingerprint: computeFingerprint(opts.public_key_pem),
  };

  registry.keys.push(entry);
  saveRegistry(registryPath, registry);
  return entry;
}

/**
 * Look up a key by ID. Returns null if not found, revoked, or expired.
 */
export function lookupKey(
  registryPath: string,
  key_id: string
): RegisteredKey | null {
  const registry = loadRegistry(registryPath);
  const key = registry.keys.find((k) => k.key_id === key_id);
  if (!key || !key.active) return null;
  if (key.expires_at && new Date(key.expires_at) < new Date()) return null;
  return key;
}

/**
 * Revoke a key by ID.
 */
export function revokeKey(registryPath: string, key_id: string): boolean {
  const registry = loadRegistry(registryPath);
  const key = registry.keys.find((k) => k.key_id === key_id);
  if (!key) return false;
  key.active = false;
  saveRegistry(registryPath, registry);
  return true;
}

/**
 * List all keys in the registry.
 */
export function listKeys(registryPath: string): RegisteredKey[] {
  return loadRegistry(registryPath).keys;
}

// ─── Private Key Storage ─────────────────────────────────────────────────

/**
 * Save a private key PEM to disk with secure permissions (0o600).
 */
export function savePrivateKey(keyDir: string, key_id: string, pem: string): void {
  if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir, { recursive: true });
  const keyPath = path.join(keyDir, `${key_id}.pem`);
  fs.writeFileSync(keyPath, pem, { mode: 0o600, encoding: "utf-8" });
}

/**
 * Load a private key PEM from disk.
 */
export function loadPrivateKey(keyPath: string): string {
  if (!fs.existsSync(keyPath)) throw new Error(`Private key not found: ${keyPath}`);
  return fs.readFileSync(keyPath, "utf-8");
}
