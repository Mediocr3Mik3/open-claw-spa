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

    help      Show this help message

  Environment:
    SPA_KEY_REGISTRY   Path to key registry (default: ~/.openclaw-spa/keys.json)
    SPA_GATE_REGISTRY  Path to gate registry (default: ~/.openclaw-spa/gates.json)
`);
}

// ─── Main ────────────────────────────────────────────────────────────────

const { command, flags } = parseArgs(process.argv.slice(2));

switch (command) {
  case "keygen":  cmdKeygen(flags); break;
  case "sign":    cmdSign(flags); break;
  case "verify":  cmdVerify(flags); break;
  case "list":    cmdList(); break;
  case "revoke":  cmdRevoke(flags); break;
  case "gates":   cmdGates(); break;
  case "help":
  default:        cmdHelp(); break;
}
