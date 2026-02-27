/**
 * openclaw-spa — Electron Desktop App (Main Process)
 *
 * Enterprise-grade desktop application with:
 *   - First-run setup wizard (key generation, adapter config, OpenClaw install)
 *   - Secure key storage via Electron safeStorage (OS keychain)
 *   - SQLite-backed audit log with tamper-evident hash chaining
 *   - Encrypted configuration store (replaces plaintext .env)
 *   - Managed bridge subprocess with auto-restart
 *   - JWT-based admin authentication
 *   - IPC handlers for all SPA operations
 *   - System tray with status indicators
 *   - Auto-updater integration
 */

import { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, nativeImage, shell, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { fork, ChildProcess } from "child_process";
import {
  generateKeyPair,
  registerPublicKey,
  listKeys,
  revokeKey,
} from "../../crypto/key-manager.js";
import {
  signEnvelope,
  serializeEnvelope,
} from "../../crypto/envelope.js";
import type { AuthLevel, SigningAlgorithm } from "../../types.js";
import { profileHardware, quickProfile } from "../../providers/hardware-profiler.js";
import { generateRecommendations } from "../../providers/model-database.js";
import { activeProvider } from "../../providers/active-provider.js";
import { APIKeyVault, type VaultBackend } from "../../providers/vault.js";
import { SpendTracker } from "../../providers/spend-tracker.js";
import { PROVIDER_REGISTRY, getProviderDef } from "../../providers/registry.js";
import type { BudgetConfig } from "../../providers/types.js";

// ─── Paths ───────────────────────────────────────────────────────────────

const SPA_DIR = path.join(app.getPath("userData"), "spa");
const KEY_REGISTRY = path.join(SPA_DIR, "keys.json");
const ENCRYPTED_KEYS_PATH = path.join(SPA_DIR, "encrypted_keys.bin");
const CONFIG_PATH = path.join(SPA_DIR, "config.encrypted.json");
const AUDIT_DB_PATH = path.join(SPA_DIR, "audit.db");
const ORG_DB_PATH = path.join(SPA_DIR, "org.db");
const SETUP_FLAG = path.join(SPA_DIR, ".setup-complete");

// Ensure SPA directory exists
if (!fs.existsSync(SPA_DIR)) fs.mkdirSync(SPA_DIR, { recursive: true });

// ─── Lazy-loaded enterprise modules ──────────────────────────────────────
// We lazy-load these so the app starts fast even if SQLite isn't needed yet.

let _audit: import("../../enterprise/audit.js").AuditLog | null = null;
function getAudit(): import("../../enterprise/audit.js").AuditLog {
  if (!_audit) {
    const { AuditLog } = require("../../enterprise/audit.js");
    _audit = new AuditLog(AUDIT_DB_PATH);
  }
  return _audit!;
}

let _encConfig: import("../../enterprise/encrypted-config.js").EncryptedConfig | null = null;
function getConfig(): import("../../enterprise/encrypted-config.js").EncryptedConfig {
  if (!_encConfig) {
    const { EncryptedConfig } = require("../../enterprise/encrypted-config.js");
    let masterKey: Buffer | undefined;
    if (safeStorage.isEncryptionAvailable()) {
      // Derive master key from a secret stored in OS keychain
      const secretPath = path.join(SPA_DIR, ".config-key");
      let secret: string;
      if (fs.existsSync(secretPath)) {
        const encrypted = fs.readFileSync(secretPath);
        secret = safeStorage.decryptString(encrypted);
      } else {
        secret = crypto.randomBytes(64).toString("hex");
        fs.writeFileSync(secretPath, safeStorage.encryptString(secret), { mode: 0o600 });
      }
      masterKey = crypto.createHash("sha256").update(secret).digest();
    }
    _encConfig = new EncryptedConfig({ config_path: CONFIG_PATH, master_key: masterKey });
  }
  return _encConfig!;
}

// ─── Encrypted private key storage ───────────────────────────────────────

interface EncryptedKeyStore {
  keys: Record<string, string>; // key_id → base64 encrypted PEM
}

function loadEncryptedStore(): EncryptedKeyStore {
  if (!fs.existsSync(ENCRYPTED_KEYS_PATH)) return { keys: {} };
  const raw = fs.readFileSync(ENCRYPTED_KEYS_PATH, "utf-8");
  return JSON.parse(raw) as EncryptedKeyStore;
}

function saveEncryptedStore(store: EncryptedKeyStore): void {
  fs.writeFileSync(ENCRYPTED_KEYS_PATH, JSON.stringify(store), { mode: 0o600 });
}

function storePrivateKey(key_id: string, pem: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS encryption not available — cannot store private key securely");
  }
  const encrypted = safeStorage.encryptString(pem).toString("base64");
  const store = loadEncryptedStore();
  store.keys[key_id] = encrypted;
  saveEncryptedStore(store);
}

function retrievePrivateKey(key_id: string): string | null {
  const store = loadEncryptedStore();
  const encrypted = store.keys[key_id];
  if (!encrypted) return null;
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
}

// ─── Managed Bridge Subprocess ───────────────────────────────────────────

let bridgeProcess: ChildProcess | null = null;
let bridgeRunning = false;
let bridgeRestartCount = 0;
const MAX_RESTART_ATTEMPTS = 5;

function startBridge(): void {
  if (bridgeProcess) return;

  // Inject encrypted config values as env vars for the bridge
  const config = getConfig();
  const envOverrides: Record<string, string> = {};
  for (const key of config.keys()) {
    const val = config.get(key);
    if (val) envOverrides[key] = val;
  }

  const bridgePath = path.join(__dirname, "..", "..", "messaging", "server.js");
  if (!fs.existsSync(bridgePath)) {
    console.error("[Desktop] Bridge script not found:", bridgePath);
    mainWindow?.webContents.send("bridge-status", { running: false, error: "Bridge script not found" });
    return;
  }

  bridgeProcess = fork(bridgePath, [], {
    env: { ...process.env, ...envOverrides },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    silent: true,
  });

  bridgeProcess.stdout?.on("data", (data: Buffer) => {
    const text = data.toString().trim();
    if (text) {
      console.log("[Bridge]", text);
      mainWindow?.webContents.send("bridge-log", { level: "info", message: text });
    }
  });

  bridgeProcess.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trim();
    if (text) {
      console.error("[Bridge]", text);
      mainWindow?.webContents.send("bridge-log", { level: "error", message: text });
    }
  });

  bridgeProcess.on("exit", (code) => {
    bridgeRunning = false;
    bridgeProcess = null;
    mainWindow?.webContents.send("bridge-status", { running: false });

    getAudit().log({
      event_type: "adapter_disconnected",
      detail: `Bridge exited with code ${code}`,
    });

    // Auto-restart with backoff
    if (bridgeRestartCount < MAX_RESTART_ATTEMPTS) {
      bridgeRestartCount++;
      const delay = Math.min(1000 * Math.pow(2, bridgeRestartCount), 30000);
      console.log(`[Desktop] Bridge exited (code ${code}), restarting in ${delay}ms...`);
      setTimeout(startBridge, delay);
    } else {
      console.error("[Desktop] Bridge exceeded max restart attempts");
      mainWindow?.webContents.send("bridge-log", {
        level: "error",
        message: "Bridge exceeded max restart attempts. Please restart manually.",
      });
    }
  });

  bridgeRunning = true;
  bridgeRestartCount = 0;
  mainWindow?.webContents.send("bridge-status", { running: true });

  getAudit().log({
    event_type: "adapter_connected",
    detail: "Bridge subprocess started",
  });
}

function stopBridge(): void {
  if (bridgeProcess) {
    bridgeProcess.kill("SIGTERM");
    bridgeProcess = null;
    bridgeRunning = false;
    bridgeRestartCount = MAX_RESTART_ATTEMPTS; // Prevent auto-restart
    mainWindow?.webContents.send("bridge-status", { running: false });
  }
}

// ─── Window ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    title: "OpenClaw SPA",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f0f1a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the renderer
  if (process.env["ELECTRON_DEV"]) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist-renderer", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── WebSocket Gateway Connection ────────────────────────────────────────

let gatewayWs: WebSocket | null = null;
let gatewayConnected = false;

function connectToGateway(url: string): void {
  try {
    gatewayWs = new WebSocket(url);

    gatewayWs.onopen = () => {
      gatewayConnected = true;
      mainWindow?.webContents.send("gateway-status", { connected: true });
      console.log("[Desktop] Gateway connected");
    };

    gatewayWs.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        mainWindow?.webContents.send("gateway-message", data);
      } catch { /* ignore parse errors */ }
    };

    gatewayWs.onclose = () => {
      gatewayConnected = false;
      mainWindow?.webContents.send("gateway-status", { connected: false });
      setTimeout(() => connectToGateway(url), 3000);
    };

    gatewayWs.onerror = () => {
      gatewayConnected = false;
    };
  } catch (err) {
    console.error("[Desktop] Gateway connection error:", err);
  }
}

// ─── IPC Handlers: Setup Wizard ──────────────────────────────────────────

ipcMain.handle("setup:is-complete", async () => {
  return fs.existsSync(SETUP_FLAG);
});

ipcMain.handle("setup:complete", async () => {
  fs.writeFileSync(SETUP_FLAG, new Date().toISOString(), "utf-8");
  getAudit().log({ event_type: "app_started", detail: "Setup wizard completed" });
  return true;
});

ipcMain.handle("setup:check-node", async () => {
  try {
    const { execSync } = require("child_process");
    const version = execSync("node --version", { encoding: "utf-8" }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
});

ipcMain.handle("setup:get-platform", async () => {
  return {
    platform: process.platform,
    arch: process.arch,
    electron_version: process.versions.electron,
    node_version: process.versions.node,
    safe_storage: safeStorage.isEncryptionAvailable(),
    spa_dir: SPA_DIR,
  };
});

// ─── IPC Handlers: Encrypted Config ──────────────────────────────────────

ipcMain.handle("config:get", async (_event, key: string) => {
  return getConfig().get(key) ?? null;
});

ipcMain.handle("config:set", async (_event, key: string, value: string) => {
  getConfig().set(key, value);
  getAudit().log({ event_type: "config_changed", detail: `Config key set: ${key}` });
  return true;
});

ipcMain.handle("config:delete", async (_event, key: string) => {
  return getConfig().delete(key);
});

ipcMain.handle("config:keys", async () => {
  return getConfig().keys();
});

ipcMain.handle("config:get-all", async () => {
  // Return keys list only (values are sensitive)
  return getConfig().keys();
});

ipcMain.handle("config:has", async (_event, key: string) => {
  return getConfig().has(key);
});

// ─── IPC Handlers: Key Management ────────────────────────────────────────

ipcMain.handle("spa:generate-key", async (_event, opts: {
  label: string;
  max_auth_level: AuthLevel;
  algorithm?: SigningAlgorithm;
}) => {
  const kp = generateKeyPair(opts.algorithm ?? "ecdsa-p384");

  registerPublicKey(KEY_REGISTRY, {
    key_id: kp.key_id,
    public_key_pem: kp.public_key_pem,
    max_auth_level: opts.max_auth_level,
    label: opts.label,
    algorithm: kp.algorithm,
  });

  storePrivateKey(kp.key_id, kp.private_key_pem);

  getAudit().log({
    event_type: "key_generated",
    key_id: kp.key_id,
    detail: `Generated ${kp.algorithm} key: ${opts.label}`,
    metadata: { fingerprint: kp.fingerprint.slice(0, 16), max_auth_level: opts.max_auth_level },
  });

  return {
    key_id: kp.key_id,
    fingerprint: kp.fingerprint.slice(0, 16),
    algorithm: kp.algorithm,
  };
});

ipcMain.handle("spa:list-keys", async () => {
  return listKeys(KEY_REGISTRY);
});

ipcMain.handle("spa:revoke-key", async (_event, key_id: string) => {
  const result = revokeKey(KEY_REGISTRY, key_id);
  if (result) {
    getAudit().log({ event_type: "key_revoked", key_id, detail: "Key revoked via desktop app" });
  }
  return result;
});

ipcMain.handle("spa:sign-message", async (_event, opts: {
  text: string;
  key_id: string;
  auth_level: AuthLevel;
  requested_tools?: string[];
}) => {
  const pem = retrievePrivateKey(opts.key_id);
  if (!pem) throw new Error(`Private key not found for ${opts.key_id}`);

  const envelope = signEnvelope({
    text: opts.text,
    auth_level: opts.auth_level,
    key_id: opts.key_id,
    private_key_pem: pem,
    requested_tools: opts.requested_tools,
  });

  getAudit().log({
    event_type: "envelope_verified",
    key_id: opts.key_id,
    auth_level: opts.auth_level,
    detail: `Signed message: ${opts.text.slice(0, 50)}...`,
  });

  return serializeEnvelope(envelope);
});

// ─── IPC Handlers: Messaging ─────────────────────────────────────────────

ipcMain.handle("spa:send-message", async (_event, opts: {
  text: string;
  token?: string;
}) => {
  if (gatewayWs && gatewayConnected) {
    gatewayWs.send(JSON.stringify({
      type: "message",
      text: opts.token ? `${opts.token} ${opts.text}` : opts.text,
    }));
    return { sent: true };
  }
  return { sent: false, error: "Not connected to gateway" };
});

ipcMain.handle("spa:gateway-status", async () => {
  return { connected: gatewayConnected };
});

ipcMain.handle("spa:connect-gateway", async (_event, url: string) => {
  connectToGateway(url);
  return { connecting: true };
});

// ─── IPC Handlers: Bridge Management ─────────────────────────────────────

ipcMain.handle("bridge:start", async () => {
  startBridge();
  return { started: true };
});

ipcMain.handle("bridge:stop", async () => {
  stopBridge();
  return { stopped: true };
});

ipcMain.handle("bridge:status", async () => {
  return { running: bridgeRunning };
});

// ─── IPC Handlers: Audit Log ─────────────────────────────────────────────

ipcMain.handle("audit:query", async (_event, opts: {
  event_type?: string;
  key_id?: string;
  channel?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}) => {
  return getAudit().query(opts as any);
});

ipcMain.handle("audit:stats", async (_event, since?: string) => {
  return getAudit().stats(since);
});

ipcMain.handle("audit:verify-chain", async () => {
  return getAudit().verifyChain();
});

ipcMain.handle("audit:count", async () => {
  return getAudit().count();
});

ipcMain.handle("audit:export-ndjson", async (_event, opts?: { since?: string; limit?: number }) => {
  return getAudit().exportNDJSON(opts ?? {});
});

// ─── IPC Handlers: Utilities ─────────────────────────────────────────────

ipcMain.handle("app:get-version", async () => {
  return app.getVersion();
});

ipcMain.handle("app:open-external", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("app:get-paths", async () => {
  return {
    spa_dir: SPA_DIR,
    key_registry: KEY_REGISTRY,
    audit_db: AUDIT_DB_PATH,
    config: CONFIG_PATH,
    logs: app.getPath("logs"),
  };
});

// ─── LLM Provider System ────────────────────────────────────────────────

// Vault: wraps EncryptedConfig as a VaultBackend for the APIKeyVault
const vaultBackend: VaultBackend = {
  get: (key: string) => getConfig().get(key),
  set: (key: string, value: string) => getConfig().set(key, value),
  delete: (key: string) => getConfig().delete(key),
  has: (key: string) => getConfig().has(key),
  keys: () => getConfig().keys(),
};
const vault = new APIKeyVault(vaultBackend);

// Spend tracker: persists to SPA_DIR/spend-log.ndjson
const spendTracker = new SpendTracker({
  data_dir: SPA_DIR,
  onBudgetUpdate: (totalUsd) => {
    activeProvider.updateSpend(totalUsd);
    mainWindow?.webContents.send("spend-update", {
      total_usd: totalUsd,
      budget_percent: spendTracker.getBudgetUsagePercent(),
    });
  },
});

// Wire vault into the active provider manager
activeProvider.setVault({
  get: (key: string) => vault.getKey(key),
});

// Forward provider events to the renderer
activeProvider.subscribe((event) => {
  mainWindow?.webContents.send("provider-event", event);
  getAudit().log({
    event_type: event.type === "provider_switched" ? "config_changed" : "app_started",
    detail: event.detail,
    metadata: { provider_id: event.provider_id, model_id: event.model_id },
  });
});

// ─── IPC Handlers: Hardware & Recommendations ───────────────────────────

ipcMain.handle("hardware:profile", async () => {
  return profileHardware();
});

ipcMain.handle("hardware:quick-profile", async () => {
  return quickProfile();
});

ipcMain.handle("hardware:recommendations", async () => {
  const profile = profileHardware();
  return generateRecommendations(profile);
});

// ─── IPC Handlers: LLM Provider Management ──────────────────────────────

ipcMain.handle("llm:switch", async (_event, opts: { provider_id: string; model_id: string }) => {
  const result = await activeProvider.switchTo(opts.provider_id, opts.model_id);
  if (result.success) {
    getAudit().log({
      event_type: "config_changed",
      detail: `LLM switched to ${opts.provider_id}/${opts.model_id}`,
    });
  }
  return result;
});

ipcMain.handle("llm:status", async () => {
  const current = activeProvider.get();
  if (!current) return { active: false };
  const health = await current.ping();
  return {
    active: true,
    provider_id: current.id,
    provider_name: current.name,
    model_id: current.getActiveModel(),
    type: current.type,
    health,
  };
});

ipcMain.handle("llm:list-providers", async () => {
  return PROVIDER_REGISTRY.map(p => ({
    ...p,
    configured: p.requires_vault_key
      ? p.vault_key_names.every(k => vault.hasKey(k))
      : true,
    models: p.models.map(m => ({ id: m.id, label: m.label, context_window: m.context_window })),
  }));
});

ipcMain.handle("llm:list-models", async (_event, providerId: string) => {
  const adapter = activeProvider.get();
  if (adapter && adapter.id === providerId) {
    return adapter.listAvailableModels();
  }
  // For non-active providers, return static list from registry
  const def = getProviderDef(providerId);
  return def?.models.map(m => m.id) ?? [];
});

ipcMain.handle("llm:all-statuses", async () => {
  return activeProvider.getAllStatuses();
});

ipcMain.handle("llm:complete", async (_event, opts: {
  messages: { role: string; content: string }[];
  options?: Record<string, unknown>;
}) => {
  const adapter = activeProvider.get();
  if (!adapter) throw new Error("No active LLM provider. Configure one in Settings.");

  // Secret leak detection on outgoing messages
  for (const msg of opts.messages) {
    const scan = APIKeyVault.scanForSecrets(msg.content);
    if (scan.leaked) {
      getAudit().log({
        event_type: "intrusion_alert",
        detail: `Secret leak blocked: ${scan.matches.join(", ")} detected in outgoing prompt`,
      });
      throw new Error(`Blocked: potential API key detected in message (${scan.matches.join(", ")}). Remove secrets before sending.`);
    }
  }

  const result = await adapter.complete(opts.messages as any, opts.options as any);

  // Track spend
  if (result.usage) {
    spendTracker.record({
      provider_id: adapter.id,
      model_id: adapter.getActiveModel(),
      usage: result.usage,
    });
  }

  return result;
});

// ─── IPC Handlers: API Key Vault ────────────────────────────────────────

ipcMain.handle("vault:list", async () => {
  return vault.listEntries();
});

ipcMain.handle("vault:set-key", async (_event, keyName: string, value: string) => {
  const result = vault.setKey(keyName, value);
  getAudit().log({
    event_type: "config_changed",
    detail: `Vault key set: ${keyName}${result.warning ? ` (warning: ${result.warning})` : ""}`,
  });
  return result;
});

ipcMain.handle("vault:remove-key", async (_event, keyName: string) => {
  const result = vault.removeKey(keyName);
  if (result) {
    getAudit().log({
      event_type: "config_changed",
      detail: `Vault key removed: ${keyName}`,
    });
  }
  return result;
});

ipcMain.handle("vault:has-key", async (_event, keyName: string) => {
  return vault.hasKey(keyName);
});

ipcMain.handle("vault:configured-providers", async () => {
  return vault.getConfiguredProviders();
});

// ─── IPC Handlers: Spend Tracking ───────────────────────────────────────

ipcMain.handle("spend:summary", async (_event, since?: string, until?: string) => {
  return spendTracker.getSummary(since, until);
});

ipcMain.handle("spend:daily", async (_event, days?: number) => {
  return spendTracker.getDailySpend(days);
});

ipcMain.handle("spend:budget", async () => {
  return {
    ...spendTracker.getBudget(),
    current_spend: spendTracker.getCurrentMonthSpend(),
    usage_percent: spendTracker.getBudgetUsagePercent(),
  };
});

ipcMain.handle("spend:set-budget", async (_event, config: Partial<BudgetConfig>) => {
  spendTracker.setBudget(config);
  activeProvider.setBudget(spendTracker.getBudget(), spendTracker.getCurrentMonthSpend());
  return spendTracker.getBudget();
});

ipcMain.handle("spend:recent", async (_event, limit?: number) => {
  return spendTracker.getRecent(limit);
});

// ─── App Lifecycle ───────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  // System tray
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("OpenClaw SPA");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Dashboard", click: () => mainWindow?.show() },
      { type: "separator" },
      {
        label: "Start Bridge",
        click: () => startBridge(),
      },
      {
        label: "Stop Bridge",
        click: () => stopBridge(),
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );

  // Log app start
  getAudit().log({ event_type: "app_started", detail: `Version ${app.getVersion()}` });

  // Auto-connect to gateway if URL is set
  const config = getConfig();
  const gatewayUrl = config.get("OPENCLAW_GATEWAY_URL") ?? process.env["OPENCLAW_GATEWAY_URL"] ?? "ws://localhost:3210/ws";
  connectToGateway(gatewayUrl);

  // Auto-start bridge if setup is complete
  if (fs.existsSync(SETUP_FLAG)) {
    startBridge();
  }

  // Start LLM provider health polling (every 30 seconds)
  activeProvider.startHealthPolling(30_000);

  // Wire budget config into provider manager
  activeProvider.setBudget(spendTracker.getBudget(), spendTracker.getCurrentMonthSpend());
});

app.on("before-quit", () => {
  getAudit().log({ event_type: "app_stopped", detail: "Application closing" });
  stopBridge();
  activeProvider.dispose();
  _audit?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
