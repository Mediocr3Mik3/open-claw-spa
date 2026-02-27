/**
 * openclaw-spa — API Key Vault
 *
 * Secure storage for LLM provider API keys. Built on top of
 * the existing EncryptedConfig module (AES-256-GCM, OS keychain).
 *
 * Security model:
 *   - Keys are encrypted at rest, never written to disk in plaintext
 *   - Decrypted keys live only in main process memory
 *   - Renderer process only sees { provider, key_present, last_used }
 *   - API key format validation on entry (catches paste errors)
 *   - Secret leak detection scans prompts for key-shaped strings
 */

import type { VaultEntry, VaultKeyFormat } from "./types.js";
import { PROVIDER_REGISTRY } from "./registry.js";

// ─── Key Format Validators ──────────────────────────────────────────────

export const KEY_FORMATS: VaultKeyFormat[] = [
  {
    provider_id: "anthropic",
    key_name: "ANTHROPIC_API_KEY",
    prefix: "sk-ant-",
    min_length: 40,
    max_length: 200,
    description: "Anthropic API key (starts with sk-ant-)",
  },
  {
    provider_id: "openai",
    key_name: "OPENAI_API_KEY",
    prefix: "sk-",
    min_length: 40,
    max_length: 200,
    description: "OpenAI API key (starts with sk-)",
  },
  {
    provider_id: "openai",
    key_name: "OPENAI_ORG_ID",
    prefix: "org-",
    min_length: 10,
    max_length: 100,
    description: "OpenAI organization ID (starts with org-)",
  },
  {
    provider_id: "groq",
    key_name: "GROQ_API_KEY",
    prefix: "gsk_",
    min_length: 30,
    max_length: 200,
    description: "Groq API key (starts with gsk_)",
  },
];

// ─── Secret Leak Patterns ───────────────────────────────────────────────

const LEAK_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "Anthropic API Key", pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
  { name: "OpenAI API Key", pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "Groq API Key", pattern: /gsk_[a-zA-Z0-9]{20,}/ },
  { name: "GitHub Token", pattern: /gh[ps]_[a-zA-Z0-9]{36,}/ },
  { name: "GitHub PAT", pattern: /github_pat_[a-zA-Z0-9_]{20,}/ },
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "Generic API Key", pattern: /[a-zA-Z0-9_-]{32,}(?:key|token|secret|password)/i },
];

// ─── Vault Class ────────────────────────────────────────────────────────

export interface VaultBackend {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  keys(): string[];
}

export class APIKeyVault {
  private backend: VaultBackend;
  private metadata: Map<string, { last_used?: string; last_validated?: string }> = new Map();
  private static METADATA_KEY = "__vault_metadata__";

  constructor(backend: VaultBackend) {
    this.backend = backend;
    this.loadMetadata();
  }

  // ─── Key Management ─────────────────────────────────────────────────

  /**
   * Store an API key. Validates format before saving.
   * Returns validation result.
   */
  setKey(keyName: string, value: string): { saved: boolean; warning?: string } {
    const format = KEY_FORMATS.find(f => f.key_name === keyName);
    let warning: string | undefined;

    if (format) {
      if (format.prefix && !value.startsWith(format.prefix)) {
        warning = `Expected key to start with "${format.prefix}" for ${format.description}`;
      }
      if (format.min_length && value.length < format.min_length) {
        warning = `Key seems too short (${value.length} chars, expected at least ${format.min_length})`;
      }
      if (format.max_length && value.length > format.max_length) {
        warning = `Key seems too long (${value.length} chars, expected at most ${format.max_length})`;
      }
    }

    this.backend.set(keyName, value);
    this.updateMetadata(keyName, { last_validated: new Date().toISOString() });

    return { saved: true, warning };
  }

  /**
   * Retrieve an API key. Only available in the main process.
   * The renderer should NEVER call this.
   */
  getKey(keyName: string): string | undefined {
    const value = this.backend.get(keyName);
    if (value) {
      this.updateMetadata(keyName, { last_used: new Date().toISOString() });
    }
    return value;
  }

  /**
   * Remove an API key.
   */
  removeKey(keyName: string): boolean {
    this.metadata.delete(keyName);
    this.saveMetadata();
    return this.backend.delete(keyName);
  }

  /**
   * Check if a key exists (safe for renderer).
   */
  hasKey(keyName: string): boolean {
    return this.backend.has(keyName);
  }

  // ─── Provider Status (Renderer-Safe) ────────────────────────────────

  /**
   * Get vault entries for all providers — safe to send to renderer.
   * Never includes actual key values.
   */
  listEntries(): VaultEntry[] {
    const entries: VaultEntry[] = [];

    for (const provider of PROVIDER_REGISTRY) {
      for (const keyName of provider.vault_key_names) {
        const meta = this.metadata.get(keyName);
        const format = KEY_FORMATS.find(f => f.key_name === keyName);
        const hasKey = this.backend.has(keyName);

        let formatValid: boolean | undefined;
        if (hasKey && format) {
          const val = this.backend.get(keyName);
          formatValid = val ? this.validateFormat(keyName, val) : undefined;
        }

        entries.push({
          provider_id: provider.id,
          key_name: keyName,
          key_present: hasKey,
          last_used: meta?.last_used,
          last_validated: meta?.last_validated,
          format_valid: formatValid,
        });
      }
    }

    return entries;
  }

  /**
   * Get which providers are fully configured (all required keys present).
   */
  getConfiguredProviders(): string[] {
    return PROVIDER_REGISTRY
      .filter(p => {
        if (!p.requires_vault_key) return true;
        return p.vault_key_names.every(k => this.backend.has(k));
      })
      .map(p => p.id);
  }

  // ─── Format Validation ──────────────────────────────────────────────

  private validateFormat(keyName: string, value: string): boolean {
    const format = KEY_FORMATS.find(f => f.key_name === keyName);
    if (!format) return true; // No format defined = always valid

    if (format.prefix && !value.startsWith(format.prefix)) return false;
    if (format.min_length && value.length < format.min_length) return false;
    if (format.max_length && value.length > format.max_length) return false;
    return true;
  }

  // ─── Secret Leak Detection ──────────────────────────────────────────

  /**
   * Scan a text for potential API key leaks.
   * Call this on every outgoing prompt to prevent accidental key exposure.
   */
  static scanForSecrets(text: string): { leaked: boolean; matches: string[] } {
    const matches: string[] = [];
    for (const { name, pattern } of LEAK_PATTERNS) {
      if (pattern.test(text)) {
        matches.push(name);
      }
    }
    return { leaked: matches.length > 0, matches };
  }

  // ─── Metadata Persistence ──────────────────────────────────────────

  private loadMetadata(): void {
    try {
      const raw = this.backend.get(APIKeyVault.METADATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { last_used?: string; last_validated?: string }>;
        for (const [k, v] of Object.entries(parsed)) {
          this.metadata.set(k, v);
        }
      }
    } catch { /* ignore corrupt metadata */ }
  }

  private saveMetadata(): void {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.metadata) {
      obj[k] = v;
    }
    this.backend.set(APIKeyVault.METADATA_KEY, JSON.stringify(obj));
  }

  private updateMetadata(keyName: string, update: { last_used?: string; last_validated?: string }): void {
    const existing = this.metadata.get(keyName) ?? {};
    this.metadata.set(keyName, { ...existing, ...update });
    this.saveMetadata();
  }
}
