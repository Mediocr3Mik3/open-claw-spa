/**
 * openclaw-spa — Electron Preload Script
 *
 * ⚠️  UNTESTED — included for ease of use. See README for details.
 *
 * Exposes a typed, sandboxed IPC API to the renderer process via contextBridge.
 * The renderer NEVER gets direct access to Node.js, filesystem, or Electron internals.
 */

import { contextBridge, ipcRenderer } from "electron";

export interface SPADesktopAPI {
  // Key management
  generateKey: (opts: { label: string; max_auth_level: string; algorithm?: string }) => Promise<{
    key_id: string;
    fingerprint: string;
    algorithm: string;
  }>;
  listKeys: () => Promise<Array<{
    key_id: string;
    label: string;
    max_auth_level: string;
    algorithm?: string;
    active: boolean;
    fingerprint?: string;
    created_at: string;
  }>>;
  revokeKey: (key_id: string) => Promise<boolean>;

  // Messaging
  signMessage: (opts: {
    text: string;
    key_id: string;
    auth_level: string;
    requested_tools?: string[];
  }) => Promise<string>;
  sendMessage: (opts: { text: string; token?: string }) => Promise<{ sent: boolean; error?: string }>;

  // Gateway
  gatewayStatus: () => Promise<{ connected: boolean }>;
  connectGateway: (url: string) => Promise<{ connecting: boolean }>;
  onGatewayStatus: (callback: (status: { connected: boolean }) => void) => void;
  onGatewayMessage: (callback: (data: unknown) => void) => void;

  // Utilities
  getVersion: () => string;
}

const api: SPADesktopAPI = {
  // Key management
  generateKey: (opts) => ipcRenderer.invoke("spa:generate-key", opts),
  listKeys: () => ipcRenderer.invoke("spa:list-keys"),
  revokeKey: (key_id) => ipcRenderer.invoke("spa:revoke-key", key_id),

  // Messaging
  signMessage: (opts) => ipcRenderer.invoke("spa:sign-message", opts),
  sendMessage: (opts) => ipcRenderer.invoke("spa:send-message", opts),

  // Gateway
  gatewayStatus: () => ipcRenderer.invoke("spa:gateway-status"),
  connectGateway: (url) => ipcRenderer.invoke("spa:connect-gateway", url),
  onGatewayStatus: (callback) => {
    ipcRenderer.on("gateway-status", (_event, status) => callback(status));
  },
  onGatewayMessage: (callback) => {
    ipcRenderer.on("gateway-message", (_event, data) => callback(data));
  },

  // Utilities
  getVersion: () => "1.0.0",
};

contextBridge.exposeInMainWorld("spa", api);
