/**
 * openclaw-spa — Action Gate Registry
 *
 * Maps OpenClaw tool/action names to required authorization levels.
 *
 * The gate registry is the policy layer: it decides which tools require
 * signed prompts and at what level. Tools not in the registry are treated
 * as "standard" (ungated) by default.
 *
 * Default gates follow the principle of least privilege:
 *   - admin:    shell_exec, system_command, sudo, process_kill, env_set, ...
 *   - elevated: file_write, file_delete, email_send, browser_navigate, ...
 *   - standard: search, read, ask_user, summarize, ... (ungated)
 */

import * as fs from "fs";
import * as path from "path";
import type { GatedAction, GateRegistry, AuthLevel } from "../types.js";
import { AUTH_LEVEL_WEIGHT } from "../types.js";

// ─── Default Gates ───────────────────────────────────────────────────────

const DEFAULT_ADMIN_GATES: GatedAction[] = [
  { tool: "shell_exec",       required_level: "admin", description: "Execute arbitrary shell commands" },
  { tool: "system_command",   required_level: "admin", description: "Run system-level commands" },
  { tool: "sudo",             required_level: "admin", description: "Execute with elevated OS privileges" },
  { tool: "process_kill",     required_level: "admin", description: "Terminate running processes" },
  { tool: "env_set",          required_level: "admin", description: "Modify environment variables" },
  { tool: "cron_edit",        required_level: "admin", description: "Modify scheduled tasks" },
  { tool: "service_restart",  required_level: "admin", description: "Restart system services" },
  { tool: "network_config",   required_level: "admin", description: "Modify network configuration" },
  { tool: "user_management",  required_level: "admin", description: "Create/modify OS user accounts" },
  { tool: "key_revoke",       required_level: "admin", description: "Revoke SPA signing keys" },
  { tool: "gate_modify",      required_level: "admin", description: "Modify the gate registry itself" },
  { tool: "database_admin",   required_level: "admin", description: "Database DDL and admin operations" },
  { tool: "vault_write_key",  required_level: "admin", description: "Add or update API keys in the vault" },
  { tool: "vault_remove_key", required_level: "admin", description: "Remove API keys from the vault" },
  { tool: "budget_modify",    required_level: "admin", description: "Modify spend budget configuration" },
];

const DEFAULT_ELEVATED_GATES: GatedAction[] = [
  { tool: "file_write",       required_level: "elevated", description: "Write or create files" },
  { tool: "file_delete",      required_level: "elevated", description: "Delete files" },
  { tool: "file_move",        required_level: "elevated", description: "Move or rename files" },
  { tool: "directory_create",  required_level: "elevated", description: "Create directories" },
  { tool: "email_send",       required_level: "elevated", description: "Send email messages" },
  { tool: "email_draft",      required_level: "elevated", description: "Draft email messages" },
  { tool: "browser_navigate", required_level: "elevated", description: "Navigate browser to URLs" },
  { tool: "browser_form",     required_level: "elevated", description: "Fill and submit web forms" },
  { tool: "api_call",         required_level: "elevated", description: "Make external API requests" },
  { tool: "webhook_trigger",  required_level: "elevated", description: "Trigger webhooks" },
  { tool: "git_push",         required_level: "elevated", description: "Push to git remotes" },
  { tool: "git_commit",       required_level: "elevated", description: "Create git commits" },
  { tool: "deploy",           required_level: "elevated", description: "Deploy applications" },
  { tool: "database_write",   required_level: "elevated", description: "Write to databases" },
  { tool: "calendar_modify",  required_level: "elevated", description: "Modify calendar events" },
  { tool: "message_send",     required_level: "elevated", description: "Send messages on behalf of user" },
  { tool: "llm_switch",       required_level: "elevated", description: "Switch active LLM provider/model" },
  { tool: "llm_add_provider", required_level: "elevated", description: "Add a new LLM provider configuration" },
  { tool: "vault_read_key",   required_level: "elevated", description: "Read API keys from the vault" },
];

export const DEFAULT_GATES: GatedAction[] = [
  ...DEFAULT_ADMIN_GATES,
  ...DEFAULT_ELEVATED_GATES,
];

// ─── Gate Registry Class ─────────────────────────────────────────────────

export class ActionGateRegistry {
  private gates: Map<string, GatedAction>;

  constructor(gates?: GatedAction[]) {
    this.gates = new Map();
    for (const g of gates ?? DEFAULT_GATES) {
      this.gates.set(g.tool, g);
    }
  }

  /**
   * Load a gate registry from a JSON file, falling back to defaults.
   */
  static fromFile(registryPath?: string): ActionGateRegistry {
    if (!registryPath || !fs.existsSync(registryPath)) {
      return new ActionGateRegistry();
    }
    const data = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as GateRegistry;
    return new ActionGateRegistry(data.gates);
  }

  /**
   * Save the current registry to a JSON file.
   */
  save(registryPath: string): void {
    const dir = path.dirname(registryPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data: GateRegistry = {
      version: "1.0",
      gates: Array.from(this.gates.values()),
    };
    fs.writeFileSync(registryPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Get the required auth level for a tool. Returns "standard" for ungated tools.
   */
  getRequiredLevel(tool: string): AuthLevel {
    return this.gates.get(tool)?.required_level ?? "standard";
  }

  /**
   * Check if a given auth level satisfies the requirement for a tool.
   */
  isAllowed(tool: string, grantedLevel: AuthLevel): boolean {
    const required = this.getRequiredLevel(tool);
    return AUTH_LEVEL_WEIGHT[grantedLevel] >= AUTH_LEVEL_WEIGHT[required];
  }

  /**
   * Partition a list of tool names into approved and blocked,
   * given the granted auth level.
   */
  partition(
    tools: string[],
    grantedLevel: AuthLevel
  ): { approved: string[]; blocked: string[] } {
    const approved: string[] = [];
    const blocked: string[] = [];
    for (const tool of tools) {
      if (this.isAllowed(tool, grantedLevel)) {
        approved.push(tool);
      } else {
        blocked.push(tool);
      }
    }
    return { approved, blocked };
  }

  /**
   * List all gated actions, optionally filtered by level.
   */
  list(filterLevel?: AuthLevel): GatedAction[] {
    const all = Array.from(this.gates.values());
    if (!filterLevel) return all;
    return all.filter((g) => g.required_level === filterLevel);
  }

  /**
   * Add or update a gate entry.
   */
  set(tool: string, required_level: AuthLevel, description: string): void {
    this.gates.set(tool, { tool, required_level, description });
  }

  /**
   * Remove a gate entry (tool becomes ungated).
   */
  remove(tool: string): boolean {
    return this.gates.delete(tool);
  }
}
