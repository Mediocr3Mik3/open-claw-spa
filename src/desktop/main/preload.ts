/**
 * openclaw-spa — Electron Preload Script
 *
 * Exposes a typed, sandboxed IPC API to the renderer process via contextBridge.
 * The renderer NEVER gets direct access to Node.js, filesystem, or Electron internals.
 *
 * All IPC channels:
 *   - setup:*    — First-run wizard
 *   - config:*   — Encrypted config store
 *   - spa:*      — Key management + signing + messaging
 *   - bridge:*   — Managed bridge subprocess
 *   - audit:*    — Tamper-evident audit log
 *   - app:*      — Utilities
 */

import { contextBridge, ipcRenderer } from "electron";

const api = {
  // ─── Setup Wizard ────────────────────────────────────────────────────
  setup: {
    isComplete: () => ipcRenderer.invoke("setup:is-complete"),
    complete: () => ipcRenderer.invoke("setup:complete"),
    checkNode: () => ipcRenderer.invoke("setup:check-node"),
    getPlatform: () => ipcRenderer.invoke("setup:get-platform"),
  },

  // ─── Encrypted Config ────────────────────────────────────────────────
  config: {
    get: (key: string) => ipcRenderer.invoke("config:get", key),
    set: (key: string, value: string) => ipcRenderer.invoke("config:set", key, value),
    delete: (key: string) => ipcRenderer.invoke("config:delete", key),
    keys: () => ipcRenderer.invoke("config:keys"),
    has: (key: string) => ipcRenderer.invoke("config:has", key),
  },

  // ─── Key Management ──────────────────────────────────────────────────
  generateKey: (opts: { label: string; max_auth_level: string; algorithm?: string }) =>
    ipcRenderer.invoke("spa:generate-key", opts),
  listKeys: () => ipcRenderer.invoke("spa:list-keys"),
  revokeKey: (key_id: string) => ipcRenderer.invoke("spa:revoke-key", key_id),

  // ─── Signing & Messaging ─────────────────────────────────────────────
  signMessage: (opts: { text: string; key_id: string; auth_level: string; requested_tools?: string[] }) =>
    ipcRenderer.invoke("spa:sign-message", opts),
  sendMessage: (opts: { text: string; token?: string }) =>
    ipcRenderer.invoke("spa:send-message", opts),

  // ─── Gateway ─────────────────────────────────────────────────────────
  gatewayStatus: () => ipcRenderer.invoke("spa:gateway-status"),
  connectGateway: (url: string) => ipcRenderer.invoke("spa:connect-gateway", url),
  onGatewayStatus: (callback: (status: { connected: boolean }) => void) => {
    ipcRenderer.on("gateway-status", (_event, status) => callback(status));
  },
  onGatewayMessage: (callback: (data: unknown) => void) => {
    ipcRenderer.on("gateway-message", (_event, data) => callback(data));
  },

  // ─── Bridge Management ───────────────────────────────────────────────
  bridge: {
    start: () => ipcRenderer.invoke("bridge:start"),
    stop: () => ipcRenderer.invoke("bridge:stop"),
    status: () => ipcRenderer.invoke("bridge:status"),
    onStatus: (callback: (status: { running: boolean; error?: string }) => void) => {
      ipcRenderer.on("bridge-status", (_event, status) => callback(status));
    },
    onLog: (callback: (log: { level: string; message: string }) => void) => {
      ipcRenderer.on("bridge-log", (_event, log) => callback(log));
    },
  },

  // ─── Audit Log ───────────────────────────────────────────────────────
  audit: {
    query: (opts: Record<string, unknown>) => ipcRenderer.invoke("audit:query", opts),
    stats: (since?: string) => ipcRenderer.invoke("audit:stats", since),
    verifyChain: () => ipcRenderer.invoke("audit:verify-chain"),
    count: () => ipcRenderer.invoke("audit:count"),
    exportNDJSON: (opts?: Record<string, unknown>) => ipcRenderer.invoke("audit:export-ndjson", opts),
  },

  // ─── Utilities ───────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  getPaths: () => ipcRenderer.invoke("app:get-paths"),
};

export type SPADesktopAPI = typeof api;

contextBridge.exposeInMainWorld("spa", api);
