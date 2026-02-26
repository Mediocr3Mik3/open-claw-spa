/**
 * openclaw-spa — Mobile Crypto Module
 *
 * ⚠️  UNTESTED — included for ease of use. See README for details.
 *
 * On-device cryptographic operations for React Native / Expo:
 *   - RSA-2048 key generation via Web Crypto API (SubtleCrypto)
 *   - Secure key storage via expo-secure-store
 *   - Biometric authentication via expo-local-authentication
 *   - Prompt signing for SPA envelopes
 *
 * Note: Uses RSA-2048 on mobile for performance; ECDSA P-384 is preferred
 * on desktop/server where native crypto is faster.
 */

import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";

// ─── Types ───────────────────────────────────────────────────────────────

export interface MobileKeyPair {
  key_id: string;
  public_key_pem: string;
  algorithm: string;
  created_at: string;
}

interface StoredKeyMeta {
  keys: Array<{
    key_id: string;
    public_key_pem: string;
    algorithm: string;
    created_at: string;
  }>;
}

// ─── Key Storage ─────────────────────────────────────────────────────────

const KEY_META_STORE = "spa_key_meta";

async function loadKeyMeta(): Promise<StoredKeyMeta> {
  const raw = await SecureStore.getItemAsync(KEY_META_STORE);
  if (!raw) return { keys: [] };
  return JSON.parse(raw) as StoredKeyMeta;
}

async function saveKeyMeta(meta: StoredKeyMeta): Promise<void> {
  await SecureStore.setItemAsync(KEY_META_STORE, JSON.stringify(meta));
}

// ─── Key Generation ──────────────────────────────────────────────────────

/**
 * Generate a new RSA-2048 key pair on device using Web Crypto API.
 * The private key is stored in expo-secure-store (hardware-backed on iOS/Android).
 */
export async function generateMobileKeyPair(): Promise<MobileKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256",
    },
    true, // extractable
    ["sign", "verify"]
  );

  // Export keys
  const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  const publicKeyPem = bufferToPem(publicKeyBuffer, "PUBLIC KEY");
  const privateKeyPem = bufferToPem(privateKeyBuffer, "PRIVATE KEY");

  // Generate key ID
  const key_id = generateUUID();

  // Store private key securely
  await SecureStore.setItemAsync(`spa_privkey_${key_id}`, privateKeyPem);

  // Update key metadata
  const meta = await loadKeyMeta();
  const entry: MobileKeyPair = {
    key_id,
    public_key_pem: publicKeyPem,
    algorithm: "rsa-2048",
    created_at: new Date().toISOString(),
  };
  meta.keys.push(entry);
  await saveKeyMeta(meta);

  return entry;
}

// ─── Key Listing / Deletion ──────────────────────────────────────────────

export async function listMobileKeys(): Promise<MobileKeyPair[]> {
  const meta = await loadKeyMeta();
  return meta.keys;
}

export async function deleteMobileKey(key_id: string): Promise<void> {
  await SecureStore.deleteItemAsync(`spa_privkey_${key_id}`);
  const meta = await loadKeyMeta();
  meta.keys = meta.keys.filter((k) => k.key_id !== key_id);
  await saveKeyMeta(meta);
}

// ─── Biometric Authentication ────────────────────────────────────────────

/**
 * Check if biometric auth is available on this device.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

/**
 * Prompt the user for biometric authentication.
 * Call this before signing elevated/admin messages.
 */
export async function authenticateBiometric(
  reason: string = "Authenticate to sign this prompt"
): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: "Cancel",
    fallbackLabel: "Use passcode",
    disableDeviceFallback: false,
  });
  return result.success;
}

// ─── Signing ─────────────────────────────────────────────────────────────

export interface MobileSignOptions {
  text: string;
  auth_level: "standard" | "elevated" | "admin";
  key_id: string;
  requested_tools?: string[];
  require_biometric?: boolean;
}

/**
 * Sign a prompt on device. Optionally requires biometric auth first.
 * Returns a serialized SPA1: token.
 */
export async function signPromptMobile(opts: MobileSignOptions): Promise<string> {
  // Biometric gate for elevated/admin
  if (
    opts.require_biometric !== false &&
    (opts.auth_level === "elevated" || opts.auth_level === "admin")
  ) {
    const authed = await authenticateBiometric(
      `Authenticate to sign ${opts.auth_level} prompt`
    );
    if (!authed) throw new Error("Biometric authentication failed or cancelled");
  }

  // Load private key
  const privateKeyPem = await SecureStore.getItemAsync(`spa_privkey_${opts.key_id}`);
  if (!privateKeyPem) throw new Error(`Private key not found for ${opts.key_id}`);

  // Import private key
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(privateKeyPem, "PRIVATE KEY"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Build payload
  const nonce = generateUUID();
  const payload = {
    text: opts.text,
    auth_level: opts.auth_level,
    timestamp: new Date().toISOString(),
    nonce,
    ...(opts.requested_tools?.length ? { requested_tools: opts.requested_tools } : {}),
  };

  // Canonical JSON
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);

  // Sign
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    data
  );

  const signature = bufferToBase64(signatureBuffer);

  // Build envelope
  const envelope = {
    spa_version: "1.0",
    payload,
    signature,
    key_id: opts.key_id,
    algorithm: "rsa-2048",
  };

  // Serialize as SPA1: token
  const json = JSON.stringify(envelope);
  const token = "SPA1:" + btoa(json);
  return token;
}

// ─── Utilities ───────────────────────────────────────────────────────────

function bufferToPem(buffer: ArrayBuffer, label: string): string {
  const b64 = bufferToBase64(buffer);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function pemToBuffer(pem: string, label: string): ArrayBuffer {
  const b64 = pem
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s/g, "");
  return base64ToBuffer(b64);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateUUID(): string {
  // Simple UUID v4 generator for environments without crypto.randomUUID
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) | 8];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
}
