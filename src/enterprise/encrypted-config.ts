/**
 * openclaw-spa — Encrypted Configuration Store
 *
 * Replaces plaintext .env files with AES-256-GCM encrypted config.
 * On Electron: uses safeStorage (OS keychain) for the master key.
 * On server: derives key from machine ID + optional passphrase via PBKDF2.
 *
 * Config entries are individually encrypted so partial reads are fast.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const ALGORITHM = "aes-256-gcm";
const PBKDF2_ITERATIONS = 310_000;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export interface EncryptedConfigOptions {
  config_path: string;
  master_key?: Buffer;
  passphrase?: string;
}

interface ConfigFile {
  version: "1.0";
  salt: string;
  entries: Record<string, EncryptedEntry>;
}

interface EncryptedEntry {
  iv: string;
  ciphertext: string;
  tag: string;
}

export class EncryptedConfig {
  private configPath: string;
  private derivedKey: Buffer;
  private data: ConfigFile;

  constructor(opts: EncryptedConfigOptions) {
    this.configPath = opts.config_path;
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.data = this.loadOrCreate();

    if (opts.master_key) {
      this.derivedKey = opts.master_key.subarray(0, 32);
    } else {
      const passphrase = opts.passphrase ?? this.getMachineId();
      this.derivedKey = crypto.pbkdf2Sync(
        passphrase,
        Buffer.from(this.data.salt, "hex"),
        PBKDF2_ITERATIONS,
        32,
        "sha512"
      );
    }
  }

  private loadOrCreate(): ConfigFile {
    if (fs.existsSync(this.configPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.configPath, "utf-8")) as ConfigFile;
      } catch {
        // Corrupted file — create fresh
      }
    }
    const fresh: ConfigFile = {
      version: "1.0",
      salt: crypto.randomBytes(SALT_LENGTH).toString("hex"),
      entries: {},
    };
    this.save(fresh);
    return fresh;
  }

  private save(data?: ConfigFile): void {
    const d = data ?? this.data;
    fs.writeFileSync(this.configPath, JSON.stringify(d, null, 2), { mode: 0o600 });
  }

  private getMachineId(): string {
    // Use hostname + platform as a basic machine fingerprint
    // In production, use a proper machine-id library
    const os = require("os");
    return `${os.hostname()}-${os.platform()}-${os.arch()}-openclaw-spa`;
  }

  private encrypt(plaintext: string): EncryptedEntry {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString("hex"),
      ciphertext: encrypted.toString("hex"),
      tag: tag.toString("hex"),
    };
  }

  private decrypt(entry: EncryptedEntry): string {
    const iv = Buffer.from(entry.iv, "hex");
    const ciphertext = Buffer.from(entry.ciphertext, "hex");
    const tag = Buffer.from(entry.tag, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, this.derivedKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
  }

  /**
   * Set a config value (encrypts and persists).
   */
  set(key: string, value: string): void {
    this.data.entries[key] = this.encrypt(value);
    this.save();
  }

  /**
   * Get a config value (decrypts from store).
   * Returns undefined if key doesn't exist or decryption fails.
   */
  get(key: string): string | undefined {
    const entry = this.data.entries[key];
    if (!entry) return undefined;
    try {
      return this.decrypt(entry);
    } catch {
      return undefined;
    }
  }

  /**
   * Delete a config value.
   */
  delete(key: string): boolean {
    if (!(key in this.data.entries)) return false;
    delete this.data.entries[key];
    this.save();
    return true;
  }

  /**
   * List all config keys (values remain encrypted).
   */
  keys(): string[] {
    return Object.keys(this.data.entries);
  }

  /**
   * Check if a key exists.
   */
  has(key: string): boolean {
    return key in this.data.entries;
  }

  /**
   * Get all config values as a plain object (decrypts everything).
   */
  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of this.keys()) {
      const val = this.get(key);
      if (val !== undefined) result[key] = val;
    }
    return result;
  }

  /**
   * Import from a plain object (encrypts all values).
   */
  importAll(entries: Record<string, string>): void {
    for (const [key, value] of Object.entries(entries)) {
      this.data.entries[key] = this.encrypt(value);
    }
    this.save();
  }

  /**
   * Import from environment variables matching a prefix.
   */
  importFromEnv(prefix: string = ""): number {
    let count = 0;
    for (const [key, value] of Object.entries(process.env)) {
      if (prefix && !key.startsWith(prefix)) continue;
      if (value !== undefined) {
        this.set(key, value);
        count++;
      }
    }
    return count;
  }
}
