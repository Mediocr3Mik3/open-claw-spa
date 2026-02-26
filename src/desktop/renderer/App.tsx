/**
 * openclaw-spa — Desktop Renderer (React)
 *
 * ⚠️  UNTESTED — included for ease of use. See README for details.
 *
 * Chat-style UI with:
 *   - Live gateway connection indicator
 *   - Per-message auth level selector
 *   - Signed message badges
 *   - Key management panel
 *   - Settings drawer
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

// Access the preload API
declare global {
  interface Window {
    spa: {
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
      signMessage: (opts: {
        text: string;
        key_id: string;
        auth_level: string;
        requested_tools?: string[];
      }) => Promise<string>;
      sendMessage: (opts: { text: string; token?: string }) => Promise<{ sent: boolean; error?: string }>;
      gatewayStatus: () => Promise<{ connected: boolean }>;
      connectGateway: (url: string) => Promise<{ connecting: boolean }>;
      onGatewayStatus: (callback: (status: { connected: boolean }) => void) => void;
      onGatewayMessage: (callback: (data: unknown) => void) => void;
      getVersion: () => string;
    };
  }
}

interface Message {
  id: number;
  text: string;
  sender: "user" | "agent";
  auth_level?: string;
  signed: boolean;
  timestamp: string;
}

interface KeyInfo {
  key_id: string;
  label: string;
  max_auth_level: string;
  algorithm?: string;
  active: boolean;
  fingerprint?: string;
  created_at: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [authLevel, setAuthLevel] = useState<string>("standard");
  const [connected, setConnected] = useState(false);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("ws://localhost:3210/ws");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(0);

  // Load keys and gateway status on mount
  useEffect(() => {
    window.spa.listKeys().then((k) => {
      setKeys(k);
      const active = k.find((key) => key.active);
      if (active) setActiveKeyId(active.key_id);
    });
    window.spa.gatewayStatus().then((s) => setConnected(s.connected));
    window.spa.onGatewayStatus((s) => setConnected(s.connected));
    window.spa.onGatewayMessage((data) => {
      const d = data as { text?: string; type?: string };
      if (d.text) {
        msgCounter.current++;
        setMessages((prev) => [
          ...prev,
          {
            id: msgCounter.current,
            text: d.text!,
            sender: "agent",
            signed: false,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");

    let token: string | undefined;
    let signed = false;

    // Sign if elevated/admin and we have a key
    if (authLevel !== "standard" && activeKeyId) {
      try {
        token = await window.spa.signMessage({
          text,
          key_id: activeKeyId,
          auth_level: authLevel,
        });
        signed = true;
      } catch (err) {
        console.error("Signing failed:", err);
      }
    }

    msgCounter.current++;
    setMessages((prev) => [
      ...prev,
      {
        id: msgCounter.current,
        text,
        sender: "user",
        auth_level: authLevel,
        signed,
        timestamp: new Date().toISOString(),
      },
    ]);

    await window.spa.sendMessage({ text, token });
  }, [input, authLevel, activeKeyId]);

  const handleGenerateKey = useCallback(async () => {
    const label = prompt("Key label:") ?? "Desktop Key";
    const level = prompt("Max auth level (standard/elevated/admin):") ?? "elevated";
    try {
      const result = await window.spa.generateKey({ label, max_auth_level: level });
      alert(`Key generated!\nID: ${result.key_id}\nFingerprint: ${result.fingerprint}`);
      const updatedKeys = await window.spa.listKeys();
      setKeys(updatedKeys);
      if (!activeKeyId) setActiveKeyId(result.key_id);
    } catch (err) {
      alert(`Key generation failed: ${err}`);
    }
  }, [activeKeyId]);

  const levelColors: Record<string, string> = {
    standard: "#6b7280",
    elevated: "#f59e0b",
    admin: "#ef4444",
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>OpenClaw SPA</span>
          <span style={{
            ...styles.statusDot,
            backgroundColor: connected ? "#22c55e" : "#ef4444",
          }} />
          <span style={styles.statusText}>{connected ? "Connected" : "Disconnected"}</span>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} onClick={() => setShowKeys(!showKeys)}>Keys</button>
          <button style={styles.headerBtn} onClick={() => setShowSettings(!showSettings)}>Settings</button>
        </div>
      </div>

      {/* Key Panel */}
      {showKeys && (
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Signing Keys</h3>
          {keys.map((k) => (
            <div key={k.key_id} style={{
              ...styles.keyItem,
              borderLeft: k.key_id === activeKeyId ? "3px solid #3b82f6" : "3px solid transparent",
            }}>
              <div onClick={() => setActiveKeyId(k.key_id)} style={{ cursor: "pointer", flex: 1 }}>
                <strong>{k.label}</strong>
                <div style={styles.keyMeta}>
                  {k.algorithm} · {k.max_auth_level} · {k.active ? "active" : "revoked"}
                </div>
              </div>
            </div>
          ))}
          <button style={styles.addKeyBtn} onClick={handleGenerateKey}>+ Generate Key</button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Settings</h3>
          <label style={styles.settingLabel}>Gateway URL</label>
          <input
            style={styles.settingInput}
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
          />
          <button
            style={styles.addKeyBtn}
            onClick={() => window.spa.connectGateway(gatewayUrl)}
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.message,
              alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
              backgroundColor: msg.sender === "user" ? "#1e3a5f" : "#1e1e2e",
            }}
          >
            <div style={styles.messageHeader}>
              {msg.auth_level && (
                <span style={{
                  ...styles.levelBadge,
                  backgroundColor: levelColors[msg.auth_level] ?? "#6b7280",
                }}>
                  {msg.auth_level}
                </span>
              )}
              {msg.signed && <span style={styles.signedBadge}>signed</span>}
            </div>
            <div style={styles.messageText}>{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputBar}>
        <select
          style={{
            ...styles.levelSelect,
            color: levelColors[authLevel],
          }}
          value={authLevel}
          onChange={(e) => setAuthLevel(e.target.value)}
        >
          <option value="standard">Standard</option>
          <option value="elevated">Elevated</option>
          <option value="admin">Admin</option>
        </select>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
        />
        <button style={styles.sendBtn} onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0f0f1a", color: "#e0e0e0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #2a2a3a" },
  headerLeft: { display: "flex", alignItems: "center", gap: "8px" },
  headerRight: { display: "flex", gap: "8px" },
  title: { fontWeight: 700, fontSize: "16px" },
  statusDot: { width: "8px", height: "8px", borderRadius: "50%" },
  statusText: { fontSize: "12px", color: "#888" },
  headerBtn: { background: "none", border: "1px solid #3a3a4a", color: "#aaa", padding: "4px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" },
  panel: { padding: "12px 16px", borderBottom: "1px solid #2a2a3a", backgroundColor: "#14141f" },
  panelTitle: { margin: "0 0 8px", fontSize: "14px", color: "#aaa" },
  keyItem: { display: "flex", padding: "6px 8px", marginBottom: "4px", borderRadius: "4px", backgroundColor: "#1a1a2a" },
  keyMeta: { fontSize: "11px", color: "#666", marginTop: "2px" },
  addKeyBtn: { marginTop: "8px", background: "none", border: "1px dashed #3a3a4a", color: "#888", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", width: "100%", fontSize: "12px" },
  settingLabel: { fontSize: "12px", color: "#888", display: "block", marginBottom: "4px" },
  settingInput: { width: "100%", padding: "6px 8px", backgroundColor: "#1a1a2a", border: "1px solid #3a3a4a", color: "#e0e0e0", borderRadius: "4px", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box" },
  messages: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" },
  message: { maxWidth: "75%", padding: "8px 12px", borderRadius: "8px" },
  messageHeader: { display: "flex", gap: "6px", marginBottom: "4px" },
  levelBadge: { fontSize: "10px", padding: "1px 6px", borderRadius: "3px", color: "#fff", fontWeight: 600, textTransform: "uppercase" as const },
  signedBadge: { fontSize: "10px", padding: "1px 6px", borderRadius: "3px", backgroundColor: "#22c55e", color: "#fff", fontWeight: 600 },
  messageText: { fontSize: "14px", lineHeight: "1.4" },
  inputBar: { display: "flex", gap: "8px", padding: "12px 16px", borderTop: "1px solid #2a2a3a" },
  levelSelect: { backgroundColor: "#1a1a2a", border: "1px solid #3a3a4a", borderRadius: "4px", padding: "6px", fontSize: "12px", fontWeight: 600 },
  input: { flex: 1, padding: "8px 12px", backgroundColor: "#1a1a2a", border: "1px solid #3a3a4a", color: "#e0e0e0", borderRadius: "4px", fontSize: "14px", outline: "none" },
  sendBtn: { padding: "8px 20px", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600 },
};
