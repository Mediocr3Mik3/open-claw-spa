/**
 * openclaw-spa — Key Rotation Manager
 *
 * Handles secure key rotation with successor chain tracking.
 * When a key is rotated:
 *   1. A new key pair is generated
 *   2. The old key is marked with a successor pointer
 *   3. The old key enters a grace period before full revocation
 *   4. Active sessions can migrate to the new key
 *
 * The rotation chain is stored in the key registry for audit trail.
 */

import * as crypto from "crypto";
import {
  generateKeyPair,
  registerPublicKey,
  lookupKey,
  computeFingerprint,
} from "../crypto/key-manager.js";
import type { AuthLevel, SigningAlgorithm, RegisteredKey, KeyRegistry } from "../types.js";
import * as fs from "fs";

export interface RotationResult {
  old_key_id: string;
  new_key_id: string;
  new_fingerprint: string;
  grace_period_until: string;
  algorithm: SigningAlgorithm;
}

export interface RotationChainEntry {
  key_id: string;
  successor_id: string | null;
  rotated_at: string;
  grace_until: string;
}

export class KeyRotationManager {
  private registryPath: string;
  private chainPath: string;
  private chain: RotationChainEntry[];

  constructor(registryPath: string, chainPath?: string) {
    this.registryPath = registryPath;
    this.chainPath = chainPath ?? registryPath.replace(/\.json$/, "-rotation-chain.json");
    this.chain = this.loadChain();
  }

  private loadChain(): RotationChainEntry[] {
    if (!fs.existsSync(this.chainPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.chainPath, "utf-8")) as RotationChainEntry[];
    } catch {
      return [];
    }
  }

  private saveChain(): void {
    fs.writeFileSync(this.chainPath, JSON.stringify(this.chain, null, 2), { mode: 0o600 });
  }

  /**
   * Rotate a key: generate successor, mark old key with grace period.
   *
   * @param oldKeyId - The key to rotate
   * @param gracePeriodHours - Hours to keep old key active (default: 24)
   * @param privateKeyDir - Directory to store the new private key PEM
   * @returns Rotation result with both key IDs
   */
  rotate(
    oldKeyId: string,
    opts: {
      grace_period_hours?: number;
      label?: string;
      algorithm?: SigningAlgorithm;
    } = {}
  ): RotationResult & { new_private_key_pem: string } {
    const oldKey = lookupKey(this.registryPath, oldKeyId);
    if (!oldKey) {
      throw new Error(`Key ${oldKeyId} not found or already revoked`);
    }

    const algorithm = opts.algorithm ?? oldKey.algorithm ?? "ecdsa-p384";
    const graceHours = opts.grace_period_hours ?? 24;
    const graceUntil = new Date(Date.now() + graceHours * 3600 * 1000).toISOString();

    // Generate successor
    const newKP = generateKeyPair(algorithm);
    const label = opts.label ?? `${oldKey.label} (rotated ${new Date().toISOString().slice(0, 10)})`;

    registerPublicKey(this.registryPath, {
      key_id: newKP.key_id,
      public_key_pem: newKP.public_key_pem,
      max_auth_level: oldKey.max_auth_level,
      label,
      algorithm,
    });

    // Record chain entry
    this.chain.push({
      key_id: oldKeyId,
      successor_id: newKP.key_id,
      rotated_at: new Date().toISOString(),
      grace_until: graceUntil,
    });
    this.saveChain();

    return {
      old_key_id: oldKeyId,
      new_key_id: newKP.key_id,
      new_fingerprint: newKP.fingerprint,
      grace_period_until: graceUntil,
      algorithm,
      new_private_key_pem: newKP.private_key_pem,
    };
  }

  /**
   * Finalize rotation: revoke old keys whose grace period has expired.
   * Returns the IDs of keys that were revoked.
   */
  finalizeExpired(): string[] {
    const now = Date.now();
    const revoked: string[] = [];

    for (const entry of this.chain) {
      if (new Date(entry.grace_until).getTime() <= now) {
        // Load registry and revoke the old key if still active
        const registry = JSON.parse(fs.readFileSync(this.registryPath, "utf-8")) as KeyRegistry;
        const key = registry.keys.find((k) => k.key_id === entry.key_id);
        if (key && key.active) {
          key.active = false;
          fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
          revoked.push(entry.key_id);
        }
      }
    }

    return revoked;
  }

  /**
   * Get the full rotation chain for a key (follow successor pointers).
   */
  getChain(keyId: string): RotationChainEntry[] {
    const result: RotationChainEntry[] = [];
    let currentId: string | null = keyId;

    while (currentId) {
      const entry = this.chain.find((e) => e.key_id === currentId);
      if (!entry) break;
      result.push(entry);
      currentId = entry.successor_id;
    }

    return result;
  }

  /**
   * Get the latest active key in a rotation chain.
   */
  getLatestSuccessor(keyId: string): string {
    const chain = this.getChain(keyId);
    if (chain.length === 0) return keyId;
    return chain[chain.length - 1].successor_id ?? keyId;
  }

  /**
   * List all pending rotations (old keys still in grace period).
   */
  pendingRotations(): RotationChainEntry[] {
    const now = Date.now();
    return this.chain.filter((e) => new Date(e.grace_until).getTime() > now);
  }
}
