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
import { fork, ChildProcess, execSync } from "child_process";
import WebSocket from "ws";
import { AuditLog } from "../../enterprise/audit.js";
import { EncryptedConfig } from "../../enterprise/encrypted-config.js";
import { generateKeyPair,
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
import { generateRecommendations, ALL_MODELS, LOCAL_MODELS, API_MODELS, findModel, findModelsByProvider, findModelsByStrength, estimateCost } from "../../providers/model-database.js";
import { activeProvider } from "../../providers/active-provider.js";
import { APIKeyVault, type VaultBackend } from "../../providers/vault.js";
import { SpendTracker } from "../../providers/spend-tracker.js";
import { PROVIDER_REGISTRY, getProviderDef } from "../../providers/registry.js";
import type { BudgetConfig } from "../../providers/types.js";
import { ActionGateRegistry } from "../../gates/registry.js";
import { KeyRotationManager } from "../../enterprise/key-rotation.js";
import { RateLimiter } from "../../enterprise/rate-limiter.js";
import { OrgManager } from "../../enterprise/org.js";
import { OpenClawInstaller } from "./installer.js";
import type { InstallConfig } from "./installer.js";

// ─── Paths ───────────────────────────────────────────────────────────────
// Initialized inside app.whenReady() — app.getPath() requires Electron ready.
let SPA_DIR = "";
let KEY_REGISTRY = "";
let ENCRYPTED_KEYS_PATH = "";
let CONFIG_PATH = "";
let AUDIT_DB_PATH = "";
let ORG_DB_PATH = "";
let SETUP_FLAG = "";

function initPaths(): void {
  SPA_DIR = path.join(app.getPath("userData"), "spa");
  KEY_REGISTRY = path.join(SPA_DIR, "keys.json");
  ENCRYPTED_KEYS_PATH = path.join(SPA_DIR, "encrypted_keys.bin");
  CONFIG_PATH = path.join(SPA_DIR, "config.encrypted.json");
  AUDIT_DB_PATH = path.join(SPA_DIR, "audit.db");
  ORG_DB_PATH = path.join(SPA_DIR, "org.db");
  SETUP_FLAG = path.join(SPA_DIR, ".setup-complete");
  if (!fs.existsSync(SPA_DIR)) fs.mkdirSync(SPA_DIR, { recursive: true });
}

// ─── Lazy-initialized enterprise modules ─────────────────────────────────
// Instances created on first call (after initPaths() has been called).

let _audit: AuditLog | null = null;
function getAudit(): AuditLog {
  if (!_audit) _audit = new AuditLog(AUDIT_DB_PATH);
  return _audit;
}

let _encConfig: EncryptedConfig | null = null;
function getConfig(): EncryptedConfig {
  if (!_encConfig) {
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
  return _encConfig;
}

// ─── Lazy-initialized new enterprise modules ─────────────────────────────

let _gateRegistry: ActionGateRegistry | null = null;
function getGateRegistry(): ActionGateRegistry {
  if (!_gateRegistry) {
    const gatesPath = path.join(SPA_DIR, "gates.json");
    _gateRegistry = ActionGateRegistry.fromFile(gatesPath);
  }
  return _gateRegistry;
}

let _keyRotation: KeyRotationManager | null = null;
function getKeyRotation(): KeyRotationManager {
  if (!_keyRotation) {
    _keyRotation = new KeyRotationManager(KEY_REGISTRY);
  }
  return _keyRotation;
}

let _rateLimiter: RateLimiter | null = null;
function getRateLimiter(): RateLimiter {
  if (!_rateLimiter) {
    _rateLimiter = new RateLimiter();
    _rateLimiter.onAlert((alert) => {
      getAudit().log({
        event_type: "intrusion_alert",
        detail: `${alert.type}: ${alert.detail}`,
        metadata: { source_id: alert.source_id },
      });
      mainWindow?.webContents.send("intrusion-alert", alert);
    });
  }
  return _rateLimiter;
}

let _orgManager: OrgManager | null = null;
function getOrgManager(): OrgManager {
  if (!_orgManager) {
    _orgManager = new OrgManager(ORG_DB_PATH);
  }
  return _orgManager;
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
  const rendererPath = path.join(__dirname, "..", "..", "..", "dist-renderer", "index.html");
  console.log("[Main] __dirname:", __dirname);
  console.log("[Main] Renderer path:", rendererPath);
  console.log("[Main] Renderer exists:", fs.existsSync(rendererPath));

  // Capture renderer console messages in main process output
  mainWindow.webContents.on("console-message", (_ev, level, message, line, sourceId) => {
    console.log(`[Renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  // Capture load failures
  mainWindow.webContents.on("did-fail-load", (_ev, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main] LOAD FAILED: ${errorCode} ${errorDescription} URL: ${validatedURL}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[Main] Renderer finished loading");
  });

  if (process.env["ELECTRON_DEV"]) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(rendererPath);
  }

  // Open DevTools for debugging (remove in production)
  mainWindow.webContents.openDevTools({ mode: "detach" });

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

    (gatewayWs as any).on("message", (raw: Buffer | string) => {
      try {
        const data = JSON.parse(String(raw));
        mainWindow?.webContents.send("gateway-message", data);
      } catch { /* ignore parse errors */ }
    });

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

// ─── IPC Handlers: Mobile Pairing ────────────────────────────────────────

let _pairCode: string | null = null;
let _pairExpiry: number = 0;

ipcMain.handle("pairing:generate", async () => {
  _pairCode = String(Math.floor(100000 + Math.random() * 900000));
  _pairExpiry = Date.now() + 5 * 60 * 1000; // 5 min expiry
  getAudit().log({ event_type: "config_changed", detail: "Mobile pair code generated" });
  return { code: _pairCode, expires_at: _pairExpiry };
});

ipcMain.handle("pairing:active", async () => {
  if (!_pairCode || Date.now() > _pairExpiry) return null;
  return { code: _pairCode, expires_at: _pairExpiry, remaining_seconds: Math.round((_pairExpiry - Date.now()) / 1000) };
});

ipcMain.handle("pairing:validate", async (_event, code: string) => {
  if (!_pairCode || Date.now() > _pairExpiry) return { valid: false, reason: "expired" };
  if (code !== _pairCode) return { valid: false, reason: "invalid" };
  // Pair succeeded — return gateway connection info
  const gwUrl = getConfig().get("gateway_url") ?? `ws://localhost:${getConfig().get("gateway_port") ?? 18789}`;
  const token = getConfig().get("gateway_token") ?? "";
  _pairCode = null; // one-time use
  getAudit().log({ event_type: "config_changed", detail: "Mobile device paired successfully" });
  return { valid: true, gateway_url: gwUrl, gateway_token: token };
});

ipcMain.handle("pairing:revoke", async () => {
  _pairCode = null;
  _pairExpiry = 0;
  return true;
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

// Spend tracker: initialized in app.whenReady() after initPaths() sets SPA_DIR
let spendTracker!: SpendTracker;

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

// ─── IPC Handlers: Action Gate Registry ──────────────────────────────────

ipcMain.handle("gates:list", async (_event, filterLevel?: AuthLevel) => {
  return getGateRegistry().list(filterLevel);
});

ipcMain.handle("gates:check", async (_event, tool: string, grantedLevel: AuthLevel) => {
  return getGateRegistry().isAllowed(tool, grantedLevel);
});

ipcMain.handle("gates:required-level", async (_event, tool: string) => {
  return getGateRegistry().getRequiredLevel(tool);
});

ipcMain.handle("gates:partition", async (_event, tools: string[], grantedLevel: AuthLevel) => {
  return getGateRegistry().partition(tools, grantedLevel);
});

ipcMain.handle("gates:set", async (_event, tool: string, requiredLevel: AuthLevel, description: string) => {
  getGateRegistry().set(tool, requiredLevel, description);
  getGateRegistry().save(path.join(SPA_DIR, "gates.json"));
  getAudit().log({ event_type: "config_changed", detail: `Gate set: ${tool} → ${requiredLevel}` });
  return true;
});

ipcMain.handle("gates:remove", async (_event, tool: string) => {
  const result = getGateRegistry().remove(tool);
  if (result) {
    getGateRegistry().save(path.join(SPA_DIR, "gates.json"));
    getAudit().log({ event_type: "config_changed", detail: `Gate removed: ${tool}` });
  }
  return result;
});

// ─── IPC Handlers: Key Rotation ──────────────────────────────────────────

ipcMain.handle("key-rotation:rotate", async (_event, oldKeyId: string, opts?: {
  grace_period_hours?: number;
  label?: string;
  algorithm?: SigningAlgorithm;
}) => {
  const result = getKeyRotation().rotate(oldKeyId, opts ?? {});
  // Store the new private key securely
  storePrivateKey(result.new_key_id, result.new_private_key_pem);
  getAudit().log({
    event_type: "key_generated",
    key_id: result.new_key_id,
    detail: `Key rotated: ${oldKeyId} → ${result.new_key_id} (grace until ${result.grace_period_until})`,
  });
  return {
    old_key_id: result.old_key_id,
    new_key_id: result.new_key_id,
    new_fingerprint: result.new_fingerprint,
    grace_period_until: result.grace_period_until,
    algorithm: result.algorithm,
  };
});

ipcMain.handle("key-rotation:chain", async (_event, keyId: string) => {
  return getKeyRotation().getChain(keyId);
});

ipcMain.handle("key-rotation:pending", async () => {
  return getKeyRotation().pendingRotations();
});

ipcMain.handle("key-rotation:finalize", async () => {
  const revoked = getKeyRotation().finalizeExpired();
  for (const keyId of revoked) {
    getAudit().log({ event_type: "key_revoked", key_id: keyId, detail: "Revoked after rotation grace period expired" });
  }
  return revoked;
});

// ─── IPC Handlers: Rate Limiter ──────────────────────────────────────────

ipcMain.handle("rate-limiter:check", async (_event, sourceId: string) => {
  return getRateLimiter().check(sourceId);
});

ipcMain.handle("rate-limiter:record-failure", async (_event, sourceId: string) => {
  getRateLimiter().recordFailure(sourceId);
  return true;
});

// ─── IPC Handlers: Organization Management ──────────────────────────────

ipcMain.handle("org:create", async (_event, name: string) => {
  const org = getOrgManager().createOrg(name);
  getAudit().log({ event_type: "config_changed", detail: `Organization created: ${name} (${org.org_id})` });
  return org;
});

ipcMain.handle("org:get", async (_event, orgId: string) => {
  return getOrgManager().getOrg(orgId);
});

ipcMain.handle("org:list", async () => {
  return getOrgManager().listOrgs();
});

ipcMain.handle("org:add-member", async (_event, opts: {
  org_id: string;
  user_id: string;
  display_name: string;
  role: string;
  spa_key_id?: string;
}) => {
  const member = getOrgManager().addMember(
    opts.org_id, opts.user_id, opts.display_name, opts.role as any, opts.spa_key_id
  );
  getAudit().log({ event_type: "config_changed", detail: `Member added: ${opts.display_name} as ${opts.role} in ${opts.org_id}` });
  return member;
});

ipcMain.handle("org:list-members", async (_event, orgId: string) => {
  return getOrgManager().listMembers(orgId);
});

ipcMain.handle("org:update-role", async (_event, memberId: string, newRole: string) => {
  const result = getOrgManager().updateMemberRole(memberId, newRole as any);
  if (result) {
    getAudit().log({ event_type: "config_changed", detail: `Member ${memberId} role changed to ${newRole}` });
  }
  return result;
});

ipcMain.handle("org:remove-member", async (_event, memberId: string) => {
  const result = getOrgManager().deactivateMember(memberId);
  if (result) {
    getAudit().log({ event_type: "config_changed", detail: `Member ${memberId} deactivated` });
  }
  return result;
});

ipcMain.handle("org:bind-key", async (_event, memberId: string, spaKeyId: string) => {
  return getOrgManager().bindKeyToMember(memberId, spaKeyId);
});

// ─── IPC Handlers: Model Database ────────────────────────────────────────

ipcMain.handle("models:all", async () => {
  return ALL_MODELS.map(m => ({
    id: m.id, label: m.label, provider_id: m.provider_id,
    parameter_count_b: m.parameter_count_b, context_window: m.context_window,
    strengths: m.strengths, quantizations: m.quantizations,
    estimated_cost_per_1k_input: m.estimated_cost_per_1k_input,
    estimated_cost_per_1k_output: m.estimated_cost_per_1k_output,
  }));
});

ipcMain.handle("models:local", async () => {
  return LOCAL_MODELS.map(m => ({ id: m.id, label: m.label, provider_id: m.provider_id, context_window: m.context_window, strengths: m.strengths }));
});

ipcMain.handle("models:api", async () => {
  return API_MODELS.map(m => ({ id: m.id, label: m.label, provider_id: m.provider_id, context_window: m.context_window, strengths: m.strengths }));
});

ipcMain.handle("models:find", async (_event, modelId: string) => {
  return findModel(modelId) ?? null;
});

ipcMain.handle("models:by-provider", async (_event, providerId: string) => {
  return findModelsByProvider(providerId);
});

ipcMain.handle("models:by-strength", async (_event, strength: string) => {
  return findModelsByStrength(strength as any);
});

ipcMain.handle("models:estimate-cost", async (_event, modelId: string, inputTokens: number, outputTokens: number) => {
  const model = findModel(modelId);
  if (!model) return null;
  return estimateCost(model, inputTokens, outputTokens);
});

// ─── IPC Handlers: Runtime Management ────────────────────────────────────

const RUNTIME_DOWNLOAD_URLS: Record<string, Record<string, string>> = {
  ollama: {
    win32: "https://ollama.com/download/OllamaSetup.exe",
    darwin: "https://ollama.com/download/Ollama-darwin.zip",
    linux: "https://ollama.com/install.sh",
  },
  "llama.cpp": {
    win32: "https://github.com/ggerganov/llama.cpp/releases",
    darwin: "https://github.com/ggerganov/llama.cpp/releases",
    linux: "https://github.com/ggerganov/llama.cpp/releases",
  },
  "lm-studio": {
    win32: "https://lmstudio.ai/",
    darwin: "https://lmstudio.ai/",
    linux: "https://lmstudio.ai/",
  },
};

ipcMain.handle("runtime:detect", async () => {
  const profile = profileHardware();
  return profile.runtimes;
});

ipcMain.handle("runtime:download-url", async (_event, runtimeName: string) => {
  const platform = process.platform;
  const urls = RUNTIME_DOWNLOAD_URLS[runtimeName];
  return urls?.[platform] ?? null;
});

ipcMain.handle("runtime:open-download", async (_event, runtimeName: string) => {
  const platform = process.platform;
  const url = RUNTIME_DOWNLOAD_URLS[runtimeName]?.[platform];
  if (url) {
    await shell.openExternal(url);
    return { opened: true, url };
  }
  return { opened: false, error: `No download URL for ${runtimeName} on ${platform}` };
});

ipcMain.handle("runtime:start", async (_event, runtimeName: string) => {
  try {
    if (runtimeName === "ollama") {
      if (process.platform === "win32") {
        execSync("start /B ollama serve", { encoding: "utf-8", windowsHide: true });
      } else {
        execSync("ollama serve &", { encoding: "utf-8" });
      }
      return { started: true };
    }
    return { started: false, error: `Auto-start not supported for ${runtimeName}. Please start it manually.` };
  } catch (err) {
    return { started: false, error: String(err) };
  }
});

ipcMain.handle("runtime:stop", async (_event, runtimeName: string) => {
  try {
    if (runtimeName === "ollama") {
      if (process.platform === "win32") {
        execSync("taskkill /F /IM ollama.exe", { encoding: "utf-8" });
      } else {
        execSync("pkill ollama", { encoding: "utf-8" });
      }
      return { stopped: true };
    }
    return { stopped: false, error: `Auto-stop not supported for ${runtimeName}` };
  } catch (err) {
    return { stopped: false, error: String(err) };
  }
});

ipcMain.handle("runtime:health", async (_event, endpoint: string) => {
  try {
    const http = await import("http");
    return new Promise((resolve) => {
      const req = http.get(endpoint, { timeout: 3000 }, (res) => {
        resolve({ available: res.statusCode === 200, status: res.statusCode });
      });
      req.on("error", () => resolve({ available: false }));
      req.on("timeout", () => { req.destroy(); resolve({ available: false }); });
    });
  } catch {
    return { available: false };
  }
});

// ─── IPC Handlers: OpenClaw Auto-Setup ───────────────────────────────────

ipcMain.handle("setup:auto-detect", async () => {
  const profile = profileHardware();
  const recommendations = generateRecommendations(profile);
  const runtimes = profile.runtimes;
  const configuredProviders = vault.getConfiguredProviders();

  return {
    hardware: {
      cpu: profile.cpu.model,
      ram_gb: profile.ram.total_gb,
      gpus: profile.gpus.map(g => ({ name: g.name, vram_gb: g.vram_gb, vendor: g.vendor })),
    },
    runtimes,
    configured_providers: configuredProviders,
    recommendations: recommendations.recommendations.slice(0, 5).map(r => ({
      model: r.model.label,
      tier: r.tier,
      reason: r.reason,
      fits_in_memory: r.fits_in_memory,
    })),
    summary: recommendations.summary,
    warnings: recommendations.warnings,
    suggested_runtime: runtimes.length > 0 ? runtimes[0].name : "ollama",
    needs_runtime_install: runtimes.length === 0,
  };
});

ipcMain.handle("setup:install-runtime", async (_event, runtimeName: string) => {
  const url = RUNTIME_DOWNLOAD_URLS[runtimeName]?.[process.platform];
  if (!url) return { success: false, error: `No installer for ${runtimeName} on ${process.platform}` };

  if (process.platform === "linux" && runtimeName === "ollama") {
    // On Linux, Ollama can be installed via curl script
    try {
      execSync("curl -fsSL https://ollama.com/install.sh | sh", { encoding: "utf-8", timeout: 120_000 });
      return { success: true, method: "script" };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // For Windows/macOS, open the download page
  await shell.openExternal(url);
  return { success: true, method: "browser", url };
});

// ─── IPC Handlers: OpenClaw Installer ─────────────────────────────────────

let _installer: OpenClawInstaller | null = null;
function getInstaller(): OpenClawInstaller {
  if (!_installer) {
    _installer = new OpenClawInstaller(SPA_DIR);
    _installer.onProgress((progress) => {
      mainWindow?.webContents.send("installer-progress", progress);
    });
  }
  return _installer;
}

ipcMain.handle("installer:detect", async (_event, gatewayUrl?: string) => {
  return getInstaller().detect(gatewayUrl);
});

ipcMain.handle("installer:download", async () => {
  return getInstaller().downloadBinary();
});

ipcMain.handle("installer:generate-config", async (_event, config: InstallConfig) => {
  return getInstaller().generateConfig(config);
});

ipcMain.handle("installer:write-config", async (_event, opts: {
  gateway_config: Record<string, unknown>;
  agent_name: string;
  agent_personality: string;
}) => {
  return getInstaller().writeConfig(opts.gateway_config, opts.agent_name, opts.agent_personality);
});

ipcMain.handle("installer:start-gateway", async (_event, binaryPath: string) => {
  try {
    await getInstaller().startGateway(binaryPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("installer:stop-gateway", async () => {
  getInstaller().stopGateway();
  return { stopped: true };
});

ipcMain.handle("installer:verify", async (_event, gatewayUrl: string, token: string) => {
  return getInstaller().verify(gatewayUrl, token);
});

ipcMain.handle("installer:full-install", async (_event, config: InstallConfig) => {
  const result = await getInstaller().install(config);

  if (result.success) {
    // Store gateway URL and token in encrypted config
    const cfg = getConfig();
    cfg.set("OPENCLAW_GATEWAY_URL", result.gateway_url);
    cfg.set("OPENCLAW_GATEWAY_TOKEN", result.gateway_token);
    cfg.set("OPENCLAW_BINARY_PATH", result.binary_path);
    cfg.set("OPENCLAW_AGENT_NAME", result.agent_name);

    getAudit().log({
      event_type: "app_started",
      detail: `OpenClaw installed: gateway=${result.gateway_url} agent=${result.agent_name} score=${result.security_score}`,
    });

    // Auto-connect to the new gateway
    connectToGateway(result.gateway_url);
  }

  return result;
});

ipcMain.handle("installer:gateway-running", async () => {
  return getInstaller().isGatewayRunning();
});

// ─── App Lifecycle ───────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Initialize paths first (requires Electron app to be ready)
  initPaths();

  // Initialize spend tracker now that SPA_DIR is known
  spendTracker = new SpendTracker({
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

  createWindow();

  // System tray (macOS requires a non-empty icon)
  try {
    const trayIcon = nativeImage.createFromBuffer(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4jWNgGAWjYBSMglEwCkbBKBgFo2AUDCQAAB6AAAGTfLhNAAAAAElFTkSuQmCC",
        "base64"
      )
    );
    trayIcon.setTemplateImage(true); // macOS menu bar styling
    tray = new Tray(trayIcon);
    tray.setToolTip("OpenClaw SPA");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Dashboard", click: () => mainWindow?.show() },
        { type: "separator" },
        { label: "Start Bridge", click: () => startBridge() },
        { label: "Stop Bridge", click: () => stopBridge() },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ])
    );
  } catch (err) {
    console.warn("[Main] Could not create tray:", err);
  }

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
