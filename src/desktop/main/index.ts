/**
 * openclaw-spa — Electron Desktop App (Main Process)
 *
 * ⚠️  UNTESTED — included for ease of use. See README for details.
 *
 * Features:
 *   - Secure key storage via Electron safeStorage (OS keychain)
 *   - IPC handlers for SPA key management and messaging
 *   - WebSocket connection to OpenClaw gateway
 *   - System tray icon with quick actions
 *   - Auto-updater ready
 */

import { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, nativeImage } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
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

// ─── Paths ───────────────────────────────────────────────────────────────

const SPA_DIR = path.join(app.getPath("userData"), "spa");
const KEY_REGISTRY = path.join(SPA_DIR, "keys.json");
const ENCRYPTED_KEYS_PATH = path.join(SPA_DIR, "encrypted_keys.bin");

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
  if (!fs.existsSync(SPA_DIR)) fs.mkdirSync(SPA_DIR, { recursive: true });
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

// ─── Window ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: "OpenClaw SPA",
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
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
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
      // Auto-reconnect after 3s
      setTimeout(() => connectToGateway(url), 3000);
    };

    gatewayWs.onerror = () => {
      gatewayConnected = false;
    };
  } catch (err) {
    console.error("[Desktop] Gateway connection error:", err);
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────

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
  return revokeKey(KEY_REGISTRY, key_id);
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

  return serializeEnvelope(envelope);
});

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

// ─── App Lifecycle ───────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  // System tray
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("OpenClaw SPA");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show", click: () => mainWindow?.show() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );

  // Auto-connect to gateway if URL is set
  const gatewayUrl = process.env["OPENCLAW_GATEWAY_URL"] ?? "ws://localhost:3210/ws";
  connectToGateway(gatewayUrl);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
