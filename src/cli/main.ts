#!/usr/bin/env node
/**
 * openclaw-spa — CLI
 *
 * Commands:
 *   keygen   — Generate a new key pair
 *   sign     — Sign a prompt into an SPA1: token
 *   verify   — Verify an SPA1: token
 *   list     — List registered keys
 *   revoke   — Revoke a key
 *   gates    — List gated actions
 *
 * Usage:
 *   npx tsx src/cli/main.ts keygen --label "Work laptop" --level elevated
 *   npx tsx src/cli/main.ts sign --text "deploy to prod" --key-id <uuid>
 *   npx tsx src/cli/main.ts verify --token "SPA1:..."
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  generateKeyPair,
  registerPublicKey,
  savePrivateKey,
  listKeys,
  revokeKey,
  lookupKey,
  loadPrivateKey,
} from "../crypto/key-manager.js";
import {
  signEnvelope,
  serializeEnvelope,
  deserializeEnvelope,
  verifyEnvelope,
} from "../crypto/envelope.js";
import { ActionGateRegistry } from "../gates/registry.js";
import type { AuthLevel, SigningAlgorithm } from "../types.js";
import { profileHardware } from "../providers/hardware-profiler.js";
import { generateRecommendations } from "../providers/model-database.js";
import { activeProvider } from "../providers/active-provider.js";
import { PROVIDER_REGISTRY } from "../providers/registry.js";
import { APIKeyVault, KEY_FORMATS, type VaultBackend } from "../providers/vault.js";
import { EncryptedConfig } from "../enterprise/encrypted-config.js";
import { SpendTracker } from "../providers/spend-tracker.js";
import { runOnboard } from "./onboard.js";
import { cmdSkillInstall, cmdSkillList, cmdSkillRemove, cmdSkillUpdate } from "./skill.js";

// ─── Paths ───────────────────────────────────────────────────────────────

const SPA_DIR = path.join(os.homedir(), ".openclaw-spa");
const KEY_REGISTRY = process.env["SPA_KEY_REGISTRY"] ?? path.join(SPA_DIR, "keys.json");
const PRIVATE_KEY_DIR = path.join(SPA_DIR, "private");
const GATE_REGISTRY = process.env["SPA_GATE_REGISTRY"] ?? path.join(SPA_DIR, "gates.json");

// ─── Arg Parser ──────────────────────────────────────────────────────────

function parseArgs(args: string[]): { command: string; flags: Record<string, string> } {
  const command = args[0] ?? "help";
  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1] ?? "true";
      if (!value.startsWith("--")) {
        flags[key] = value;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return { command, flags };
}

// ─── Commands ────────────────────────────────────────────────────────────

function cmdKeygen(flags: Record<string, string>): void {
  const label = flags["label"] ?? "default";
  const level = (flags["level"] ?? "standard") as AuthLevel;
  const algorithm = (flags["algorithm"] ?? "ecdsa-p384") as SigningAlgorithm;

  if (!["standard", "elevated", "admin"].includes(level)) {
    console.error(`Invalid auth level: ${level}. Use: standard, elevated, admin`);
    process.exit(1);
  }
  if (!["ecdsa-p384", "rsa-4096", "rsa-2048"].includes(algorithm)) {
    console.error(`Invalid algorithm: ${algorithm}. Use: ecdsa-p384, rsa-4096, rsa-2048`);
    process.exit(1);
  }

  console.log(`Generating ${algorithm} key pair...`);
  const kp = generateKeyPair(algorithm);

  registerPublicKey(KEY_REGISTRY, {
    key_id: kp.key_id,
    public_key_pem: kp.public_key_pem,
    max_auth_level: level,
    label,
    algorithm,
  });

  savePrivateKey(PRIVATE_KEY_DIR, kp.key_id, kp.private_key_pem);

  console.log(`\n  Key generated successfully`);
  console.log(`  key_id:      ${kp.key_id}`);
  console.log(`  algorithm:   ${kp.algorithm}`);
  console.log(`  fingerprint: ${kp.fingerprint.slice(0, 16)}...`);
  console.log(`  max_level:   ${level}`);
  console.log(`  label:       ${label}`);
  console.log(`  registry:    ${KEY_REGISTRY}`);
  console.log(`  private_key: ${PRIVATE_KEY_DIR}/${kp.key_id}.pem`);
}

function cmdSign(flags: Record<string, string>): void {
  const text = flags["text"];
  const key_id = flags["key-id"];
  const level = (flags["level"] ?? "standard") as AuthLevel;
  const tools = flags["tools"]?.split(",").map((t) => t.trim());

  if (!text) { console.error("Missing --text"); process.exit(1); }
  if (!key_id) { console.error("Missing --key-id"); process.exit(1); }

  const key = lookupKey(KEY_REGISTRY, key_id);
  if (!key) { console.error(`Key not found or inactive: ${key_id}`); process.exit(1); }

  const privateKeyPath = path.join(PRIVATE_KEY_DIR, `${key_id}.pem`);
  const private_key_pem = loadPrivateKey(privateKeyPath);

  const envelope = signEnvelope({
    text,
    auth_level: level,
    key_id,
    private_key_pem,
    algorithm: key.algorithm,
    requested_tools: tools,
  });

  const token = serializeEnvelope(envelope);
  console.log(`\n${token}\n`);
  console.log(`  nonce:     ${envelope.payload.nonce}`);
  console.log(`  timestamp: ${envelope.payload.timestamp}`);
  console.log(`  level:     ${level}`);
  if (tools) console.log(`  tools:     ${tools.join(", ")}`);
}

function cmdVerify(flags: Record<string, string>): void {
  const token = flags["token"];
  if (!token) { console.error("Missing --token"); process.exit(1); }

  const envelope = deserializeEnvelope(token);
  if (!envelope) {
    console.error("Malformed SPA1: token");
    process.exit(1);
  }

  const result = verifyEnvelope(envelope, KEY_REGISTRY, {
    max_age_seconds: 300,
  });

  console.log(`\n  status:     ${result.status}`);
  console.log(`  key_id:     ${result.key_id ?? "N/A"}`);
  console.log(`  auth_level: ${result.auth_level ?? "N/A"}`);
  if (result.message) console.log(`  message:    ${result.message}`);

  if (result.status === "valid") {
    console.log(`\n  Prompt text: "${envelope.payload.text.slice(0, 100)}..."`);
    console.log(`  Nonce:       ${envelope.payload.nonce}`);
    console.log(`  Timestamp:   ${envelope.payload.timestamp}`);
    if (envelope.payload.requested_tools?.length) {
      console.log(`  Tools:       ${envelope.payload.requested_tools.join(", ")}`);
    }
  }

  process.exit(result.status === "valid" ? 0 : 1);
}

function cmdList(): void {
  const keys = listKeys(KEY_REGISTRY);
  if (keys.length === 0) {
    console.log("No keys registered. Run: claw-spa keygen --label 'My Key'");
    return;
  }

  console.log(`\n  ${keys.length} key(s) in registry:\n`);
  for (const k of keys) {
    const status = k.active ? "active" : "REVOKED";
    const fp = k.fingerprint?.slice(0, 12) ?? "N/A";
    console.log(`  ${k.key_id}  ${status}  ${k.max_auth_level.padEnd(9)} ${k.algorithm ?? "unknown".padEnd(11)}  fp:${fp}  "${k.label}"`);
  }
}

function cmdRevoke(flags: Record<string, string>): void {
  const key_id = flags["key-id"];
  if (!key_id) { console.error("Missing --key-id"); process.exit(1); }

  const ok = revokeKey(KEY_REGISTRY, key_id);
  if (ok) {
    console.log(`Key ${key_id} revoked.`);
  } else {
    console.error(`Key not found: ${key_id}`);
    process.exit(1);
  }
}

function cmdGates(): void {
  const registry = ActionGateRegistry.fromFile(
    fs.existsSync(GATE_REGISTRY) ? GATE_REGISTRY : undefined
  );

  console.log("\n  Gated Actions:\n");
  for (const level of ["admin", "elevated"] as AuthLevel[]) {
    const gates = registry.list(level);
    console.log(`  === ${level.toUpperCase()} ===`);
    for (const g of gates) {
      console.log(`    ${g.tool.padEnd(22)} ${g.description}`);
    }
    console.log();
  }
  console.log("  All other tools are ungated (standard level).");
}

// ─── CLI Vault + Provider Helpers ───────────────────────────────────────

function getCliVault(): APIKeyVault {
  const encConfig = new EncryptedConfig({ config_path: path.join(SPA_DIR, "config.encrypted.json") });
  const backend: VaultBackend = {
    get: (k) => encConfig.get(k),
    set: (k, v) => encConfig.set(k, v),
    delete: (k) => encConfig.delete(k),
    has: (k) => encConfig.has(k),
    keys: () => encConfig.keys(),
  };
  return new APIKeyVault(backend);
}

// ─── LLM Commands ───────────────────────────────────────────────────────

async function cmdLlmSwitch(flags: Record<string, string>): Promise<void> {
  const providerId = flags["provider"];
  const modelId = flags["model"];
  if (!providerId || !modelId) {
    console.error("Missing --provider <id> --model <id>");
    process.exit(1);
  }

  const vault = getCliVault();
  activeProvider.setVault({ get: (k) => vault.getKey(k) });

  console.log(`Switching to ${providerId}/${modelId}...`);
  const result = await activeProvider.switchTo(providerId, modelId);
  if (result.success) {
    console.log(`\n  \u2713 Switched to ${result.current_provider}/${result.current_model} (${result.latency_ms}ms ping)`);
  } else {
    console.error(`\n  \u2717 Switch failed: ${result.reason}`);
    process.exit(1);
  }
}

async function cmdLlmStatus(): Promise<void> {
  const vault = getCliVault();
  activeProvider.setVault({ get: (k) => vault.getKey(k) });

  console.log("\n  LLM Provider Status:\n");
  for (const p of PROVIDER_REGISTRY) {
    const configured = p.requires_vault_key
      ? p.vault_key_names.every(k => vault.hasKey(k))
      : true;
    const icon = configured ? "\u2714" : "\u2718";
    const color = configured ? "\x1b[32m" : "\x1b[31m";
    console.log(`  ${color}${icon}\x1b[0m ${p.name.padEnd(20)} ${p.type.padEnd(6)} ${configured ? "configured" : "no key"}`);
    if (p.models.length > 0) {
      const modelNames = p.models.slice(0, 3).map(m => m.label).join(", ");
      console.log(`    Models: ${modelNames}${p.models.length > 3 ? " ..." : ""}`);
    }
  }
}

function cmdLlmRecommend(): void {
  console.log("\n  Scanning hardware...");
  const profile = profileHardware();
  const recs = generateRecommendations(profile);

  console.log(`\n  ${recs.summary}\n`);

  if (recs.preferred_runtime) {
    console.log(`  Runtime: ${recs.preferred_runtime.name} v${recs.preferred_runtime.version ?? "unknown"} ${recs.preferred_runtime.running ? "(running)" : "(stopped)"}`);
  } else {
    console.log("  Runtime: None detected. Install Ollama for the easiest experience.");
  }

  console.log();
  const tierLabels: Record<string, string> = {
    best_performance: "\x1b[32m\u25CF Best Performance\x1b[0m",
    sweet_spot: "\x1b[33m\u25CF Sweet Spot\x1b[0m",
    fast_lean: "\x1b[34m\u25CF Fast & Lean\x1b[0m",
  };

  let lastTier = "";
  for (const r of recs.recommendations) {
    if (r.tier !== lastTier) {
      console.log(`  ${tierLabels[r.tier] ?? r.tier}`);
      lastTier = r.tier;
    }
    const offload = r.needs_ram_offload ? " [RAM offload]" : "";
    console.log(`    ${r.model.label} ${r.quantization.name} (${r.quantization.size_gb}GB, ~${r.estimated_tokens_per_second} tok/s)${offload}`);
  }

  if (recs.warnings.length > 0) {
    console.log("\n  Warnings:");
    for (const w of recs.warnings) {
      console.log(`    \u26A0 ${w}`);
    }
  }
}

// ─── Vault Commands ─────────────────────────────────────────────────────

function cmdVaultList(): void {
  const vault = getCliVault();
  const entries = vault.listEntries();

  console.log("\n  API Key Vault:\n");
  for (const e of entries) {
    const icon = e.key_present ? "\x1b[32m\u2714\x1b[0m" : "\x1b[31m\u2718\x1b[0m";
    const valid = e.format_valid === false ? " \x1b[33m(invalid format)\x1b[0m" : "";
    const used = e.last_used ? ` last used: ${new Date(e.last_used).toLocaleDateString()}` : "";
    console.log(`  ${icon} ${e.key_name.padEnd(25)} ${e.provider_id.padEnd(12)} ${e.key_present ? "set" : "not set"}${valid}${used}`);
  }

  const configured = vault.getConfiguredProviders();
  console.log(`\n  Configured providers: ${configured.join(", ") || "none"}`);
}

function cmdVaultSet(flags: Record<string, string>): void {
  const keyName = flags["key"];
  const value = flags["value"];
  if (!keyName || !value) {
    console.error("Missing --key <KEY_NAME> --value <api_key>");
    console.error("Valid key names:");
    for (const f of KEY_FORMATS) {
      console.error(`  ${f.key_name} — ${f.description}`);
    }
    process.exit(1);
  }

  const vault = getCliVault();
  const result = vault.setKey(keyName, value);
  console.log(`\n  Key ${keyName} saved.`);
  if (result.warning) {
    console.log(`  \u26A0 Warning: ${result.warning}`);
  }
}

function cmdVaultRemove(flags: Record<string, string>): void {
  const keyName = flags["key"];
  if (!keyName) { console.error("Missing --key <KEY_NAME>"); process.exit(1); }

  const vault = getCliVault();
  const ok = vault.removeKey(keyName);
  console.log(ok ? `  Key ${keyName} removed.` : `  Key ${keyName} not found.`);
}

// ─── Spend Command ──────────────────────────────────────────────────────

function cmdSpend(): void {
  const tracker = new SpendTracker({ data_dir: SPA_DIR });
  const summary = tracker.getSummary();
  const budget = tracker.getBudget();

  console.log("\n  Spend Summary (current month):\n");
  console.log(`  Total cost:    $${summary.total_cost_usd.toFixed(4)}`);
  console.log(`  Input tokens:  ${summary.total_input_tokens.toLocaleString()}`);
  console.log(`  Output tokens: ${summary.total_output_tokens.toLocaleString()}`);

  if (Object.keys(summary.by_provider).length > 0) {
    console.log("\n  By provider:");
    for (const [pid, data] of Object.entries(summary.by_provider)) {
      console.log(`    ${pid.padEnd(12)} $${data.cost_usd.toFixed(4)} (${data.tokens.toLocaleString()} tokens)`);
    }
  }

  if (budget.enabled) {
    const pct = tracker.getBudgetUsagePercent();
    console.log(`\n  Budget: $${budget.monthly_limit_usd}/mo (${pct}% used)`);
  } else {
    console.log("\n  Budget: not set (use --set-budget to configure)");
  }
}

function cmdHelp(): void {
  console.log(`
  openclaw-spa CLI — Signed Prompt Architecture

  Commands:
    keygen    Generate a new key pair
              --label <name>  --level <standard|elevated|admin>  --algorithm <ecdsa-p384|rsa-4096|rsa-2048>

    sign      Sign a prompt into an SPA1: token
              --text <prompt>  --key-id <uuid>  --level <level>  [--tools <tool1,tool2>]

    verify    Verify an SPA1: token
              --token <SPA1:...>

    list      List all registered keys

    revoke    Revoke a key
              --key-id <uuid>

    gates     List all gated actions and their required levels

    llm       LLM provider management
      switch  --provider <id> --model <id>    Switch active LLM
      status                                  Show all provider statuses
      recommend                               Hardware scan + model recommendations

    vault     API key vault management
      list                                    Show all vault entries
      set     --key <NAME> --value <key>      Add/update an API key
      remove  --key <NAME>                    Remove an API key

    spend     Show current month spend summary

    onboard   Run the first-time setup wizard
              (environment check, messaging, LLM, key gen, Tailscale)

    skill     Skill management
      install <name-or-url>                 Install a skill from ClawHub or GitHub
      list                                  List installed skills
      remove  <name>                        Remove an installed skill
      update  <name>                        Update a skill to latest version

    help      Show this help message

  Environment:
    SPA_KEY_REGISTRY   Path to key registry (default: ~/.openclaw-spa/keys.json)
    SPA_GATE_REGISTRY  Path to gate registry (default: ~/.openclaw-spa/gates.json)
`);
}

// ─── Main ────────────────────────────────────────────────────────────────

const { command, flags } = parseArgs(process.argv.slice(2));

// Handle async commands
const asyncCommands: Record<string, (f: Record<string, string>) => Promise<void>> = {
  "llm-switch": cmdLlmSwitch,
  "llm-status": async () => { await cmdLlmStatus(); },
};

const subCommand = flags["_sub"] ?? "";
const fullCommand = subCommand ? `${command}-${subCommand}` : command;

if (fullCommand in asyncCommands) {
  asyncCommands[fullCommand]!(flags).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  switch (command) {
    case "keygen":  cmdKeygen(flags); break;
    case "sign":    cmdSign(flags); break;
    case "verify":  cmdVerify(flags); break;
    case "list":    cmdList(); break;
    case "revoke":  cmdRevoke(flags); break;
    case "gates":   cmdGates(); break;
    case "llm": {
      const sub = process.argv[3];
      const subFlags = parseArgs(process.argv.slice(3)).flags;
      if (sub === "switch") { cmdLlmSwitch(subFlags).catch(e => { console.error(e); process.exit(1); }); }
      else if (sub === "status") { cmdLlmStatus().catch(e => { console.error(e); process.exit(1); }); }
      else if (sub === "recommend") { cmdLlmRecommend(); }
      else { console.error("Usage: llm <switch|status|recommend>"); }
      break;
    }
    case "vault": {
      const sub = process.argv[3];
      const subFlags = parseArgs(process.argv.slice(3)).flags;
      if (sub === "list") { cmdVaultList(); }
      else if (sub === "set") { cmdVaultSet(subFlags); }
      else if (sub === "remove") { cmdVaultRemove(subFlags); }
      else { console.error("Usage: vault <list|set|remove>"); }
      break;
    }
    case "spend":   cmdSpend(); break;
    case "onboard": {
      runOnboard().catch(e => { console.error(e); process.exit(1); });
      break;
    }
    case "skill": {
      const sub = process.argv[3];
      const target = process.argv[4] ?? "";
      if (sub === "install") { cmdSkillInstall(target).catch(e => { console.error(e); process.exit(1); }); }
      else if (sub === "list") { cmdSkillList(); }
      else if (sub === "remove") { cmdSkillRemove(target); }
      else if (sub === "update") { cmdSkillUpdate(target).catch(e => { console.error(e); process.exit(1); }); }
      else { console.error("Usage: skill <install|list|remove|update> [name]"); }
      break;
    }
    case "help":
    default:        cmdHelp(); break;
  }
}
