/**
 * openclaw-spa — CLI Onboarding Wizard (`onboard` command)
 *
 * Equivalent to `openclaw onboard` in the broader ecosystem.
 * Walks the user through:
 *   1. Environment check (Node version, native addons, Windows long paths)
 *   2. Messaging platform selection + env var collection
 *   3. LLM provider selection + API key collection
 *   4. Key generation (ecdsa-p384, elevated)
 *   5. Optional Tailscale node linking prompt
 *   6. Summary of everything configured
 *
 * Uses only Node.js built-ins (readline) — no new dependencies.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { execSync } from "child_process";
import {
  generateKeyPair,
  registerPublicKey,
  savePrivateKey,
} from "../crypto/key-manager.js";

// ─── Constants ──────────────────────────────────────────────────────────

const SPA_DIR = path.join(os.homedir(), ".openclaw-spa");
const KEY_REGISTRY = process.env["SPA_KEY_REGISTRY"] ?? path.join(SPA_DIR, "keys.json");
const PRIVATE_KEY_DIR = path.join(SPA_DIR, "private");
const ENV_FILE = path.join(SPA_DIR, ".env");

const ADAPTERS = [
  { id: "whatsapp",    name: "WhatsApp",          vars: ["WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"] },
  { id: "signal",      name: "Signal",            vars: ["SIGNAL_API_URL", "SIGNAL_PHONE_NUMBER"] },
  { id: "telegram",    name: "Telegram",           vars: ["TELEGRAM_BOT_TOKEN"] },
  { id: "discord",     name: "Discord",            vars: ["DISCORD_BOT_TOKEN"] },
  { id: "imessage",    name: "iMessage (macOS)",   vars: ["IMESSAGE_POLL_INTERVAL"] },
  { id: "slack",       name: "Slack",              vars: ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"] },
  { id: "sms",         name: "SMS/MMS (Twilio)",   vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] },
  { id: "email",       name: "Email (IMAP/SMTP)",  vars: ["EMAIL_IMAP_HOST", "EMAIL_SMTP_HOST", "EMAIL_USERNAME", "EMAIL_PASSWORD"] },
  { id: "teams",       name: "Microsoft Teams",    vars: ["TEAMS_APP_ID", "TEAMS_APP_PASSWORD"] },
  { id: "matrix",      name: "Matrix",             vars: ["MATRIX_HOMESERVER_URL", "MATRIX_ACCESS_TOKEN", "MATRIX_USER_ID"] },
  { id: "irc",         name: "IRC",                vars: ["IRC_SERVER", "IRC_NICKNAME", "IRC_CHANNELS"] },
  { id: "messenger",   name: "Facebook Messenger", vars: ["MESSENGER_PAGE_ACCESS_TOKEN", "MESSENGER_APP_SECRET"] },
  { id: "googlechat",  name: "Google Chat",        vars: ["GOOGLE_CHAT_SA_PATH"] },
  { id: "x",           name: "X (Twitter) DMs",    vars: ["X_BEARER_TOKEN", "X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"] },
  { id: "line",        name: "LINE",               vars: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"] },
  { id: "wechat",      name: "WeChat",             vars: ["WECHAT_APP_ID", "WECHAT_APP_SECRET", "WECHAT_TOKEN"] },
  { id: "webhook",     name: "Generic Webhook",    vars: ["WEBHOOK_SHARED_SECRET", "WEBHOOK_REPLY_URL"] },
];

const LLM_PROVIDERS = [
  { id: "claude",  name: "Claude (Anthropic)", varName: "ANTHROPIC_API_KEY" },
  { id: "gpt4",    name: "GPT-4 (OpenAI)",     varName: "OPENAI_API_KEY" },
  { id: "gemini",  name: "Gemini (Google)",     varName: "GOOGLE_AI_API_KEY" },
];

// ─── Helpers ────────────────────────────────────────────────────────────

function print(msg: string): void { process.stdout.write(msg + "\n"); }
function header(msg: string): void { print(`\n\x1b[36m━━━ ${msg} ━━━\x1b[0m\n`); }
function ok(msg: string): void { print(`  \x1b[32m✔\x1b[0m ${msg}`); }
function warn(msg: string): void { print(`  \x1b[33m⚠\x1b[0m ${msg}`); }
function fail(msg: string): void { print(`  \x1b[31m✘\x1b[0m ${msg}`); }

function createRL(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`  ${question} `, (answer) => resolve(answer.trim()));
  });
}

function readExistingEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(ENV_FILE)) return env;
  const lines = fs.readFileSync(ENV_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function writeEnvVar(key: string, value: string): void {
  // Ensure SPA_DIR exists
  if (!fs.existsSync(SPA_DIR)) fs.mkdirSync(SPA_DIR, { recursive: true });

  const existing = readExistingEnv();
  // Never overwrite existing values
  if (existing[key]) return;

  fs.appendFileSync(ENV_FILE, `${key}="${value}"\n`);
}

// ─── Steps ──────────────────────────────────────────────────────────────

async function stepEnvironmentCheck(): Promise<boolean> {
  header("Step 1/5 — Environment Check");
  let allGood = true;

  // Node version
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0]!, 10);
  if (major >= 20) {
    ok(`Node.js v${nodeVersion} (>= 20 required)`);
  } else {
    fail(`Node.js v${nodeVersion} — version 20 or higher is required`);
    allGood = false;
  }

  // Native addons
  for (const mod of ["keytar", "better-sqlite3"]) {
    try {
      require(mod);
      ok(`${mod} loaded`);
    } catch {
      warn(`${mod} not loaded — run setup:win (Windows) or setup:unix (macOS/Linux) to rebuild`);
    }
  }

  // Windows: LongPathsEnabled
  if (os.platform() === "win32") {
    try {
      const result = execSync(
        'cmd /c reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" /v LongPathsEnabled',
        { encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }
      );
      if (result.includes("0x1")) {
        ok("Windows LongPathsEnabled is set");
      } else {
        warn("Windows LongPathsEnabled is NOT set — run setup:win as Administrator");
      }
    } catch {
      warn("Could not check LongPathsEnabled — run setup:win as Administrator");
    }
  }

  // SPA directory
  if (!fs.existsSync(SPA_DIR)) {
    fs.mkdirSync(SPA_DIR, { recursive: true });
    ok(`Created ${SPA_DIR}`);
  } else {
    ok(`${SPA_DIR} exists`);
  }

  return allGood;
}

async function stepMessagingPlatform(rl: readline.Interface): Promise<string | null> {
  header("Step 2/5 — Messaging Platform");
  print("  Which messaging platform would you like to configure?\n");

  for (let i = 0; i < ADAPTERS.length; i++) {
    print(`    ${String(i + 1).padStart(2)}. ${ADAPTERS[i]!.name}`);
  }
  print(`    ${String(0).padStart(2)}. Skip (configure later)\n`);

  const choice = await ask(rl, "Enter number:");
  const idx = parseInt(choice, 10);

  if (idx === 0 || isNaN(idx) || idx < 0 || idx > ADAPTERS.length) {
    print("  Skipping messaging platform configuration.");
    return null;
  }

  const adapter = ADAPTERS[idx - 1]!;
  print(`\n  Configuring ${adapter.name}...\n`);

  const existingEnv = readExistingEnv();

  for (const varName of adapter.vars) {
    if (existingEnv[varName]) {
      ok(`${varName} already set (keeping existing value)`);
    } else {
      const value = await ask(rl, `${varName}:`);
      if (value) {
        writeEnvVar(varName, value);
        ok(`${varName} saved`);
      } else {
        warn(`${varName} skipped (empty)`);
      }
    }
  }

  return adapter.id;
}

async function stepLLMSelection(rl: readline.Interface): Promise<string | null> {
  header("Step 3/5 — LLM Provider");
  print("  Which LLM provider would you like to use?\n");

  for (let i = 0; i < LLM_PROVIDERS.length; i++) {
    print(`    ${i + 1}. ${LLM_PROVIDERS[i]!.name}`);
  }
  print(`    0. Skip (configure later)\n`);

  const choice = await ask(rl, "Enter number:");
  const idx = parseInt(choice, 10);

  if (idx === 0 || isNaN(idx) || idx < 0 || idx > LLM_PROVIDERS.length) {
    print("  Skipping LLM configuration.");
    return null;
  }

  const provider = LLM_PROVIDERS[idx - 1]!;
  const existingEnv = readExistingEnv();

  if (existingEnv[provider.varName]) {
    ok(`${provider.varName} already set (keeping existing value)`);
  } else {
    const key = await ask(rl, `${provider.varName}:`);
    if (key) {
      writeEnvVar(provider.varName, key);
      ok(`${provider.varName} saved`);
    } else {
      warn(`${provider.varName} skipped (empty)`);
    }
  }

  return provider.id;
}

function stepKeyGeneration(): string | null {
  header("Step 4/5 — Key Generation");
  print("  Generating ECDSA P-384 signing key (elevated level)...\n");

  try {
    // Ensure directories
    if (!fs.existsSync(SPA_DIR)) fs.mkdirSync(SPA_DIR, { recursive: true });
    if (!fs.existsSync(PRIVATE_KEY_DIR)) fs.mkdirSync(PRIVATE_KEY_DIR, { recursive: true });

    const kp = generateKeyPair("ecdsa-p384");

    registerPublicKey(KEY_REGISTRY, {
      key_id: kp.key_id,
      public_key_pem: kp.public_key_pem,
      max_auth_level: "elevated",
      label: "onboard-default",
      algorithm: "ecdsa-p384",
    });

    savePrivateKey(PRIVATE_KEY_DIR, kp.key_id, kp.private_key_pem);

    ok(`Key ID:      ${kp.key_id}`);
    ok(`Algorithm:   ecdsa-p384`);
    ok(`Fingerprint: ${kp.fingerprint.slice(0, 16)}...`);
    ok(`Auth level:  elevated`);
    ok(`Registry:    ${KEY_REGISTRY}`);
    ok(`Private key: ${path.join(PRIVATE_KEY_DIR, kp.key_id + ".pem")}`);

    return kp.key_id;
  } catch (err: any) {
    fail(`Key generation failed: ${err.message}`);
    warn("You can generate a key later: npx tsx src/cli/main.ts keygen --label 'My Key' --level elevated");
    return null;
  }
}

async function stepTailscale(rl: readline.Interface): Promise<boolean> {
  header("Step 5/5 — Tailscale Node Linking (Optional)");
  print("  Tailscale lets you bridge local and remote OpenClaw instances");
  print("  over a secure WireGuard mesh. This is the community-standard");
  print("  method for multi-node setups.\n");

  const answer = await ask(rl, "Link a remote node via Tailscale? (y/N):");

  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    print("\n  To link your nodes, run on the remote machine:\n");
    print("    \x1b[33mtailscale up --authkey <YOUR_AUTH_KEY> --hostname openclaw-remote\x1b[0m\n");
    print("  Then on this machine:\n");
    print("    \x1b[33mtailscale up --authkey <YOUR_AUTH_KEY> --hostname openclaw-local\x1b[0m\n");
    print("  Generate auth keys at: https://login.tailscale.com/admin/settings/keys");
    print("  Docs: https://docs.openclaw.ai/gateway/tailscale\n");
    return true;
  }

  print("  Skipping Tailscale setup.");
  return false;
}

// ─── Main ───────────────────────────────────────────────────────────────

export async function runOnboard(): Promise<void> {
  print("\n\x1b[1m\x1b[36m🦞 OpenClaw SPA — Onboarding Wizard\x1b[0m");
  print("  This wizard will walk you through first-time setup.\n");

  const rl = createRL();

  try {
    // 1. Environment check
    await stepEnvironmentCheck();

    // 2. Messaging platform
    const platform = await stepMessagingPlatform(rl);

    // 3. LLM provider
    const llm = await stepLLMSelection(rl);

    // 4. Key generation
    const keyId = stepKeyGeneration();

    // 5. Tailscale
    await stepTailscale(rl);

    // ─── Summary ─────────────────────────────────────────────────────
    header("Setup Complete");
    print("  Here's what was configured:\n");

    if (platform) ok(`Messaging: ${ADAPTERS.find(a => a.id === platform)?.name ?? platform}`);
    else warn("Messaging: not configured (run onboard again or edit .env)");

    if (llm) ok(`LLM: ${LLM_PROVIDERS.find(p => p.id === llm)?.name ?? llm}`);
    else warn("LLM: not configured (run onboard again or edit .env)");

    if (keyId) ok(`Signing key: ${keyId}`);
    else warn("Signing key: not generated");

    if (fs.existsSync(ENV_FILE)) ok(`Env file: ${ENV_FILE}`);

    print("\n  \x1b[1mNext steps:\x1b[0m\n");
    print("    # Start the messaging bridge");
    print("    npx tsx src/messaging/server.ts\n");
    print("    # Or launch the desktop app");
    print("    npm run electron\n");
    print("    # Sign a prompt");
    if (keyId) {
      print(`    npx tsx src/cli/main.ts sign --text "hello world" --key-id ${keyId} --level elevated\n`);
    }
  } finally {
    rl.close();
  }
}
