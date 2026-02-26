/**
 * openclaw-spa — Channel Identity Registry
 *
 * Links a messaging platform sender (phone number, Telegram user ID, etc.)
 * to their registered SPA public key.
 *
 * This solves the UX problem: users don't paste SPA1:... tokens into WhatsApp.
 * Instead, they register their number → key binding once, and all future messages
 * from that number are treated as coming from that key.
 *
 * The signing still happens — it just happens transparently via the mobile SDK
 * or the bridge server (if the private key is held server-side for the user).
 */

import * as fs from "fs";
import * as path from "path";
import type { ChannelIdentity, ChannelIdentityRegistry, ChannelType } from "./types.js";

function load(registryPath: string): ChannelIdentityRegistry {
  if (!fs.existsSync(registryPath)) {
    return { version: "1.0", identities: [] };
  }
  return JSON.parse(fs.readFileSync(registryPath, "utf-8")) as ChannelIdentityRegistry;
}

function save(registryPath: string, registry: ChannelIdentityRegistry): void {
  const dir = path.dirname(registryPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf-8");
}

export class ChannelIdentityManager {
  constructor(private readonly registryPath: string) {}

  /**
   * Register or update a channel → SPA key binding.
   */
  register(
    channel: ChannelType,
    sender_id: string,
    spa_key_id: string,
    label: string
  ): ChannelIdentity {
    const registry = load(this.registryPath);

    // Deactivate any existing binding for this sender on this channel
    for (const id of registry.identities) {
      if (id.channel === channel && id.sender_id === sender_id) {
        id.active = false;
      }
    }

    const identity: ChannelIdentity = {
      channel,
      sender_id,
      spa_key_id,
      label,
      registered_at: new Date().toISOString(),
      active: true,
    };

    registry.identities.push(identity);
    save(this.registryPath, registry);
    return identity;
  }

  /**
   * Look up the SPA key_id for a channel sender.
   * Returns null if not registered or inactive.
   */
  lookup(channel: ChannelType, sender_id: string): string | null {
    const registry = load(this.registryPath);
    const match = registry.identities.find(
      (id) => id.channel === channel && id.sender_id === sender_id && id.active
    );
    return match?.spa_key_id ?? null;
  }

  /**
   * Revoke a binding.
   */
  revoke(channel: ChannelType, sender_id: string): void {
    const registry = load(this.registryPath);
    for (const id of registry.identities) {
      if (id.channel === channel && id.sender_id === sender_id) {
        id.active = false;
      }
    }
    save(this.registryPath, registry);
  }

  /**
   * List all registered identities.
   */
  list(): ChannelIdentity[] {
    return load(this.registryPath).identities;
  }
}
