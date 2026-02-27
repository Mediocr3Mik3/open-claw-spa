/**
 * openclaw-spa — Desktop Renderer (React)
 *
 * Enterprise dashboard with:
 *   - First-run setup wizard
 *   - Tabbed navigation: Chat, Keys, Audit Log, Adapters, Settings
 *   - Live gateway + bridge status indicators
 *   - Per-message auth level selector with signed message badges
 *   - Key management with rotation support
 *   - Tamper-evident audit log viewer
 *   - Adapter health monitoring
 *   - Encrypted config management
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Window.spa API type ─────────────────────────────────────────────────

declare global {
  interface Window {
    spa: {
      setup: {
        isComplete: () => Promise<boolean>;
        complete: () => Promise<boolean>;
        checkNode: () => Promise<{ installed: boolean; version: string | null }>;
        getPlatform: () => Promise<{
          platform: string; arch: string; electron_version: string;
          node_version: string; safe_storage: boolean; spa_dir: string;
        }>;
      };
      config: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        keys: () => Promise<string[]>;
        has: (key: string) => Promise<boolean>;
      };
      generateKey: (opts: { label: string; max_auth_level: string; algorithm?: string }) => Promise<{
        key_id: string; fingerprint: string; algorithm: string;
      }>;
      listKeys: () => Promise<KeyInfo[]>;
      revokeKey: (key_id: string) => Promise<boolean>;
      signMessage: (opts: { text: string; key_id: string; auth_level: string; requested_tools?: string[] }) => Promise<string>;
      sendMessage: (opts: { text: string; token?: string }) => Promise<{ sent: boolean; error?: string }>;
      gatewayStatus: () => Promise<{ connected: boolean }>;
      connectGateway: (url: string) => Promise<{ connecting: boolean }>;
      onGatewayStatus: (callback: (status: { connected: boolean }) => void) => void;
      onGatewayMessage: (callback: (data: unknown) => void) => void;
      bridge: {
        start: () => Promise<{ started: boolean }>;
        stop: () => Promise<{ stopped: boolean }>;
        status: () => Promise<{ running: boolean }>;
        onStatus: (callback: (status: { running: boolean; error?: string }) => void) => void;
        onLog: (callback: (log: { level: string; message: string }) => void) => void;
      };
      audit: {
        query: (opts: Record<string, unknown>) => Promise<AuditEntry[]>;
        stats: (since?: string) => Promise<Record<string, number>>;
        verifyChain: () => Promise<{ broken_at_id: number } | null>;
        count: () => Promise<number>;
        exportNDJSON: (opts?: Record<string, unknown>) => Promise<string>;
      };
      getVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      getPaths: () => Promise<Record<string, string>>;
    };
  }
}

// ─── Types ───────────────────────────────────────────────────────────────

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

interface AuditEntry {
  id: number;
  timestamp: string;
  event_type: string;
  key_id?: string;
  channel?: string;
  sender_id?: string;
  auth_level?: string;
  status?: string;
  detail?: string;
  hash?: string;
}

interface BridgeLog {
  level: string;
  message: string;
  timestamp: string;
}

type Tab = "chat" | "keys" | "audit" | "adapters" | "settings";

// ─── Colour helpers ──────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  standard: "#6b7280",
  elevated: "#f59e0b",
  admin: "#ef4444",
};

const EVENT_COLORS: Record<string, string> = {
  envelope_verified: "#22c55e",
  envelope_rejected: "#ef4444",
  key_generated: "#3b82f6",
  key_revoked: "#ef4444",
  adapter_connected: "#22c55e",
  adapter_disconnected: "#f59e0b",
  intrusion_alert: "#ef4444",
  rate_limit_hit: "#f59e0b",
  app_started: "#3b82f6",
  app_stopped: "#6b7280",
};

// ─── Setup Wizard Component ──────────────────────────────────────────────

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<Record<string, unknown>>({});
  const [nodeInfo, setNodeInfo] = useState<{ installed: boolean; version: string | null }>({ installed: false, version: null });
  const [keyLabel, setKeyLabel] = useState("My Desktop Key");
  const [keyLevel, setKeyLevel] = useState("elevated");
  const [keyResult, setKeyResult] = useState<{ key_id: string; fingerprint: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.spa.setup.getPlatform().then(setPlatform);
    window.spa.setup.checkNode().then(setNodeInfo);
  }, []);

  const generateInitialKey = async () => {
    setLoading(true);
    try {
      const result = await window.spa.generateKey({ label: keyLabel, max_auth_level: keyLevel });
      setKeyResult(result);
      setStep(2);
    } catch (err) {
      alert(`Key generation failed: ${err}`);
    }
    setLoading(false);
  };

  const finishSetup = async () => {
    await window.spa.setup.complete();
    onComplete();
  };

  return (
    <div style={S.wizardContainer}>
      <div style={S.wizardCard}>
        <div style={S.wizardLogo}>OpenClaw SPA</div>
        <div style={S.wizardSubtitle}>Enterprise Setup Wizard</div>

        {/* Step 0: Welcome / System Check */}
        {step === 0 && (
          <div style={S.wizardStep}>
            <h2 style={S.wizardH2}>Welcome</h2>
            <p style={S.wizardP}>Let's configure your secure signing environment.</p>
            <div style={S.wizardChecklist}>
              <div style={S.checkItem}>
                <span style={{ color: "#22c55e" }}>&#10003;</span> Platform: {String(platform.platform)} ({String(platform.arch)})
              </div>
              <div style={S.checkItem}>
                <span style={{ color: "#22c55e" }}>&#10003;</span> Electron: {String(platform.electron_version)}
              </div>
              <div style={S.checkItem}>
                <span style={{ color: nodeInfo.installed ? "#22c55e" : "#ef4444" }}>
                  {nodeInfo.installed ? "✓" : "✗"}
                </span> Node.js: {nodeInfo.version ?? "Not found"}
              </div>
              <div style={S.checkItem}>
                <span style={{ color: platform.safe_storage ? "#22c55e" : "#ef4444" }}>
                  {platform.safe_storage ? "✓" : "✗"}
                </span> OS Keychain: {platform.safe_storage ? "Available" : "Unavailable"}
              </div>
            </div>
            <button style={S.wizardBtn} onClick={() => setStep(1)}>Continue</button>
          </div>
        )}

        {/* Step 1: Generate Key */}
        {step === 1 && (
          <div style={S.wizardStep}>
            <h2 style={S.wizardH2}>Generate Signing Key</h2>
            <p style={S.wizardP}>
              This ECDSA P-384 key will be stored in your OS keychain
              and used to sign elevated/admin prompts.
            </p>
            <label style={S.label}>Key Label</label>
            <input style={S.input} value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} />
            <label style={S.label}>Max Auth Level</label>
            <select style={S.select} value={keyLevel} onChange={(e) => setKeyLevel(e.target.value)}>
              <option value="standard">Standard</option>
              <option value="elevated">Elevated</option>
              <option value="admin">Admin</option>
            </select>
            <button style={S.wizardBtn} onClick={generateInitialKey} disabled={loading}>
              {loading ? "Generating..." : "Generate Key Pair"}
            </button>
          </div>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <div style={S.wizardStep}>
            <h2 style={S.wizardH2}>Setup Complete</h2>
            <div style={{ ...S.wizardChecklist, textAlign: "center" as const }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>&#128274;</div>
              <p style={S.wizardP}>Key generated and stored securely.</p>
              {keyResult && (
                <div style={{ ...S.codeBlock, fontSize: "11px", wordBreak: "break-all" as const }}>
                  ID: {keyResult.key_id}<br />
                  Fingerprint: {keyResult.fingerprint}
                </div>
              )}
              <p style={{ ...S.wizardP, marginTop: "16px" }}>
                The messaging bridge will start automatically.
                You can configure adapters in Settings.
              </p>
            </div>
            <button style={S.wizardBtn} onClick={finishSetup}>Launch Dashboard</button>
          </div>
        )}

        {/* Progress dots */}
        <div style={S.wizardDots}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ ...S.dot, backgroundColor: i <= step ? "#3b82f6" : "#3a3a4a" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────

export default function App() {
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [authLevel, setAuthLevel] = useState<string>("standard");
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [bridgeRunning, setBridgeRunning] = useState(false);
  const [bridgeLogs, setBridgeLogs] = useState<BridgeLog[]>([]);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditStats, setAuditStats] = useState<Record<string, number>>({});
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [configKeys, setConfigKeys] = useState<string[]>([]);
  const [newConfigKey, setNewConfigKey] = useState("");
  const [newConfigVal, setNewConfigVal] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState("ws://localhost:3210/ws");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(0);

  // Check setup state
  useEffect(() => {
    window.spa.setup.isComplete().then(setSetupDone);
  }, []);

  // Initialize after setup
  useEffect(() => {
    if (!setupDone) return;

    window.spa.listKeys().then((k: KeyInfo[]) => {
      setKeys(k);
      const active = k.find((key: KeyInfo) => key.active);
      if (active) setActiveKeyId(active.key_id);
    });
    window.spa.gatewayStatus().then((s: { connected: boolean }) => setGatewayConnected(s.connected));
    window.spa.bridge.status().then((s: { running: boolean }) => setBridgeRunning(s.running));
    window.spa.config.keys().then(setConfigKeys);

    window.spa.onGatewayStatus((s: { connected: boolean }) => setGatewayConnected(s.connected));
    window.spa.bridge.onStatus((s: { running: boolean }) => setBridgeRunning(s.running));
    window.spa.bridge.onLog((log: { level: string; message: string }) => {
      setBridgeLogs((prev: BridgeLog[]) => [...prev.slice(-199), { ...log, timestamp: new Date().toISOString() }]);
    });
    window.spa.onGatewayMessage((data: unknown) => {
      const d = data as { text?: string };
      if (d.text) {
        msgCounter.current++;
        setMessages((prev: Message[]) => [...prev, {
          id: msgCounter.current, text: d.text!, sender: "agent", signed: false, timestamp: new Date().toISOString(),
        }]);
      }
    });
  }, [setupDone]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load audit data when tab switches
  useEffect(() => {
    if (tab === "audit" && setupDone) {
      window.spa.audit.query({ limit: 50 }).then(setAuditEntries);
      window.spa.audit.stats().then(setAuditStats);
      window.spa.audit.verifyChain().then((result: { broken_at_id: number } | null) => setChainValid(result === null));
    }
  }, [tab, setupDone]);

  const refreshKeys = async () => {
    const k = await window.spa.listKeys();
    setKeys(k);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    let token: string | undefined;
    let signed = false;
    if (authLevel !== "standard" && activeKeyId) {
      try {
        token = await window.spa.signMessage({ text, key_id: activeKeyId, auth_level: authLevel });
        signed = true;
      } catch (err) { console.error("Signing failed:", err); }
    }
    msgCounter.current++;
    setMessages((prev: Message[]) => [...prev, {
      id: msgCounter.current, text, sender: "user", auth_level: authLevel, signed, timestamp: new Date().toISOString(),
    }]);
    await window.spa.sendMessage({ text, token });
  }, [input, authLevel, activeKeyId]);

  const handleGenerateKey = async () => {
    const label = prompt("Key label:") ?? "Desktop Key";
    const level = prompt("Max auth level (standard/elevated/admin):") ?? "elevated";
    try {
      const result = await window.spa.generateKey({ label, max_auth_level: level });
      alert(`Key generated!\nID: ${result.key_id}\nFingerprint: ${result.fingerprint}`);
      await refreshKeys();
      if (!activeKeyId) setActiveKeyId(result.key_id);
    } catch (err) { alert(`Failed: ${err}`); }
  };

  const handleRevokeKey = async (key_id: string) => {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    await window.spa.revokeKey(key_id);
    await refreshKeys();
  };

  const handleSaveConfig = async () => {
    if (!newConfigKey.trim()) return;
    await window.spa.config.set(newConfigKey.trim(), newConfigVal);
    setNewConfigKey("");
    setNewConfigVal("");
    setConfigKeys(await window.spa.config.keys());
  };

  // ─── Render ────────────────────────────────────────────────────────────

  if (setupDone === null) {
    return <div style={S.loading}>Loading...</div>;
  }

  if (!setupDone) {
    return <SetupWizard onComplete={() => setSetupDone(true)} />;
  }

  return (
    <div style={S.app}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.sidebarLogo}>OpenClaw</div>
        <div style={S.sidebarSubtitle}>SPA Enterprise</div>

        {/* Status indicators */}
        <div style={S.statusBlock}>
          <div style={S.statusRow}>
            <span style={{ ...S.dot, backgroundColor: gatewayConnected ? "#22c55e" : "#ef4444" }} />
            <span style={S.statusLabel}>Gateway</span>
          </div>
          <div style={S.statusRow}>
            <span style={{ ...S.dot, backgroundColor: bridgeRunning ? "#22c55e" : "#ef4444" }} />
            <span style={S.statusLabel}>Bridge</span>
            <button
              style={S.tinyBtn}
              onClick={() => bridgeRunning ? window.spa.bridge.stop() : window.spa.bridge.start()}
            >
              {bridgeRunning ? "Stop" : "Start"}
            </button>
          </div>
        </div>

        {/* Nav tabs */}
        <nav style={S.nav}>
          {(["chat", "keys", "audit", "adapters", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              style={{ ...S.navBtn, backgroundColor: tab === t ? "#1e293b" : "transparent" }}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div style={S.main}>
        {/* ─── Chat Tab ──────────────────────────────────────────── */}
        {tab === "chat" && (
          <div style={S.chatContainer}>
            <div style={S.chatMessages}>
              {messages.map((msg) => (
                <div key={msg.id} style={{
                  ...S.chatBubble,
                  alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                  backgroundColor: msg.sender === "user" ? "#1e3a5f" : "#1e1e2e",
                }}>
                  <div style={S.bubbleHeader}>
                    {msg.auth_level && (
                      <span style={{ ...S.badge, backgroundColor: LEVEL_COLORS[msg.auth_level] ?? "#6b7280" }}>
                        {msg.auth_level}
                      </span>
                    )}
                    {msg.signed && <span style={{ ...S.badge, backgroundColor: "#22c55e" }}>signed</span>}
                    <span style={S.bubbleTime}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div style={S.bubbleText}>{msg.text}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div style={S.chatInput}>
              <select style={{ ...S.levelSelect, color: LEVEL_COLORS[authLevel] }} value={authLevel} onChange={(e) => setAuthLevel(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="elevated">Elevated</option>
                <option value="admin">Admin</option>
              </select>
              <input style={S.textInput} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Type a message..." />
              <button style={S.sendBtn} onClick={handleSend}>Send</button>
            </div>
          </div>
        )}

        {/* ─── Keys Tab ──────────────────────────────────────────── */}
        {tab === "keys" && (
          <div style={S.tabContent}>
            <div style={S.tabHeader}>
              <h2 style={S.tabTitle}>Signing Keys</h2>
              <button style={S.primaryBtn} onClick={handleGenerateKey}>+ Generate Key</button>
            </div>
            <div style={S.keyGrid}>
              {keys.map((k) => (
                <div key={k.key_id} style={{
                  ...S.keyCard,
                  borderLeft: `4px solid ${k.active ? "#3b82f6" : "#ef4444"}`,
                }}>
                  <div style={S.keyCardHeader}>
                    <strong>{k.label}</strong>
                    {k.key_id === activeKeyId && <span style={{ ...S.badge, backgroundColor: "#3b82f6" }}>active</span>}
                  </div>
                  <div style={S.keyCardMeta}>
                    <span>{k.algorithm ?? "ecdsa-p384"}</span>
                    <span style={{ color: LEVEL_COLORS[k.max_auth_level] }}>{k.max_auth_level}</span>
                    <span>{k.active ? "Active" : "Revoked"}</span>
                  </div>
                  <div style={S.keyCardId}>
                    {k.fingerprint ? `fp: ${k.fingerprint.slice(0, 16)}...` : `id: ${k.key_id.slice(0, 8)}...`}
                  </div>
                  <div style={S.keyCardMeta}>
                    Created: {new Date(k.created_at).toLocaleDateString()}
                  </div>
                  <div style={S.keyCardActions}>
                    {k.active && k.key_id !== activeKeyId && (
                      <button style={S.tinyBtn} onClick={() => setActiveKeyId(k.key_id)}>Use</button>
                    )}
                    {k.active && (
                      <button style={{ ...S.tinyBtn, color: "#ef4444" }} onClick={() => handleRevokeKey(k.key_id)}>Revoke</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Audit Tab ─────────────────────────────────────────── */}
        {tab === "audit" && (
          <div style={S.tabContent}>
            <div style={S.tabHeader}>
              <h2 style={S.tabTitle}>Audit Log</h2>
              <div style={S.auditMeta}>
                <span style={{ ...S.badge, backgroundColor: chainValid ? "#22c55e" : chainValid === false ? "#ef4444" : "#6b7280" }}>
                  Chain: {chainValid ? "Intact" : chainValid === false ? "BROKEN" : "..."}
                </span>
              </div>
            </div>
            {/* Stats row */}
            <div style={S.statsRow}>
              {Object.entries(auditStats).map(([key, count]) => (
                <div key={key} style={S.statCard}>
                  <div style={{ ...S.statCount, color: EVENT_COLORS[key] ?? "#888" }}>{count}</div>
                  <div style={S.statLabel}>{key.replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>
            {/* Entries */}
            <div style={S.auditTable}>
              <div style={S.auditHeaderRow}>
                <span style={{ width: "160px" }}>Timestamp</span>
                <span style={{ width: "160px" }}>Event</span>
                <span style={{ width: "100px" }}>Auth Level</span>
                <span style={{ flex: 1 }}>Detail</span>
              </div>
              {auditEntries.map((e) => (
                <div key={e.id} style={S.auditRow}>
                  <span style={{ width: "160px", fontSize: "11px" }}>{new Date(e.timestamp).toLocaleString()}</span>
                  <span style={{ width: "160px" }}>
                    <span style={{ ...S.badge, backgroundColor: EVENT_COLORS[e.event_type] ?? "#6b7280", fontSize: "10px" }}>
                      {e.event_type.replace(/_/g, " ")}
                    </span>
                  </span>
                  <span style={{ width: "100px", color: LEVEL_COLORS[e.auth_level ?? ""] ?? "#888" }}>
                    {e.auth_level ?? "-"}
                  </span>
                  <span style={{ flex: 1, fontSize: "12px", color: "#aaa" }}>{e.detail ?? "-"}</span>
                </div>
              ))}
              {auditEntries.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center" as const, color: "#666" }}>No audit entries yet.</div>
              )}
            </div>
          </div>
        )}

        {/* ─── Adapters Tab ──────────────────────────────────────── */}
        {tab === "adapters" && (
          <div style={S.tabContent}>
            <div style={S.tabHeader}>
              <h2 style={S.tabTitle}>Messaging Adapters</h2>
              <span style={{ ...S.badge, backgroundColor: bridgeRunning ? "#22c55e" : "#ef4444" }}>
                Bridge: {bridgeRunning ? "Running" : "Stopped"}
              </span>
            </div>
            <p style={{ color: "#888", marginBottom: "16px", fontSize: "13px" }}>
              Configure adapter tokens in Settings. The bridge auto-enables adapters whose tokens are present.
            </p>
            <div style={S.adapterGrid}>
              {[
                { name: "WhatsApp", key: "WHATSAPP_API_TOKEN", emoji: "💬" },
                { name: "Signal", key: "SIGNAL_API_URL", emoji: "🔒" },
                { name: "Telegram", key: "TELEGRAM_BOT_TOKEN", emoji: "✈️" },
                { name: "Discord", key: "DISCORD_BOT_TOKEN", emoji: "🎮" },
                { name: "iMessage", key: "IMESSAGE_ENABLED", emoji: "🍎" },
                { name: "Slack", key: "SLACK_BOT_TOKEN", emoji: "💼" },
                { name: "SMS/Twilio", key: "TWILIO_ACCOUNT_SID", emoji: "📱" },
                { name: "Email", key: "EMAIL_IMAP_HOST", emoji: "📧" },
                { name: "Teams", key: "TEAMS_APP_ID", emoji: "🏢" },
                { name: "Matrix", key: "MATRIX_HOMESERVER_URL", emoji: "🔗" },
                { name: "IRC", key: "IRC_SERVER", emoji: "📡" },
                { name: "Messenger", key: "MESSENGER_PAGE_ACCESS_TOKEN", emoji: "💙" },
                { name: "Google Chat", key: "GOOGLE_CHAT_SA_PATH", emoji: "🟢" },
                { name: "X (Twitter)", key: "X_BEARER_TOKEN", emoji: "🐦" },
                { name: "LINE", key: "LINE_CHANNEL_ACCESS_TOKEN", emoji: "🟩" },
                { name: "WeChat", key: "WECHAT_APP_ID", emoji: "🟡" },
                { name: "Webhook", key: "WEBHOOK_REPLY_URL", emoji: "🔗" },
              ].map((a) => (
                <AdapterCard key={a.name} name={a.name} configKey={a.key} emoji={a.emoji} />
              ))}
            </div>
            {/* Bridge logs */}
            <h3 style={{ ...S.tabTitle, marginTop: "24px", fontSize: "14px" }}>Bridge Logs</h3>
            <div style={S.logBox}>
              {bridgeLogs.length === 0 && <div style={{ color: "#666", padding: "12px" }}>No logs yet. Start the bridge to see output.</div>}
              {bridgeLogs.slice(-30).map((log, i) => (
                <div key={i} style={{ ...S.logLine, color: log.level === "error" ? "#ef4444" : "#aaa" }}>
                  <span style={{ color: "#555", fontSize: "10px" }}>{new Date(log.timestamp).toLocaleTimeString()}</span>{" "}
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Settings Tab ──────────────────────────────────────── */}
        {tab === "settings" && (
          <div style={S.tabContent}>
            <h2 style={S.tabTitle}>Settings</h2>

            {/* Gateway URL */}
            <div style={S.settingSection}>
              <h3 style={S.settingSectionTitle}>Gateway Connection</h3>
              <label style={S.label}>Gateway WebSocket URL</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input style={{ ...S.textInput, flex: 1 }} value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} />
                <button style={S.primaryBtn} onClick={() => window.spa.connectGateway(gatewayUrl)}>Connect</button>
              </div>
            </div>

            {/* Encrypted Config */}
            <div style={S.settingSection}>
              <h3 style={S.settingSectionTitle}>Encrypted Configuration</h3>
              <p style={{ color: "#888", fontSize: "12px", marginBottom: "12px" }}>
                Secrets are encrypted with AES-256-GCM and stored in your OS keychain. Never in plaintext.
              </p>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <input style={{ ...S.textInput, flex: 1 }} placeholder="Key (e.g. TELEGRAM_BOT_TOKEN)" value={newConfigKey} onChange={(e) => setNewConfigKey(e.target.value)} />
                <input style={{ ...S.textInput, flex: 1 }} placeholder="Value" type="password" value={newConfigVal} onChange={(e) => setNewConfigVal(e.target.value)} />
                <button style={S.primaryBtn} onClick={handleSaveConfig}>Save</button>
              </div>
              <div style={S.configList}>
                {configKeys.map((k) => (
                  <div key={k} style={S.configItem}>
                    <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{k}</span>
                    <button style={{ ...S.tinyBtn, color: "#ef4444" }} onClick={async () => {
                      await window.spa.config.delete(k);
                      setConfigKeys(await window.spa.config.keys());
                    }}>Delete</button>
                  </div>
                ))}
                {configKeys.length === 0 && <div style={{ color: "#666", padding: "8px" }}>No config entries yet.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Adapter Card Sub-component ──────────────────────────────────────────

function AdapterCard({ name, configKey, emoji }: { name: string; configKey: string; emoji: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    window.spa.config.has(configKey).then(setConfigured);
  }, [configKey]);

  return (
    <div style={{
      ...S.adapterCard,
      borderLeft: `3px solid ${configured ? "#22c55e" : "#3a3a4a"}`,
    }}>
      <div style={{ fontSize: "24px" }}>{emoji}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: "13px" }}>{name}</div>
        <div style={{ fontSize: "10px", color: configured ? "#22c55e" : "#666" }}>
          {configured === null ? "..." : configured ? "Configured" : "Not configured"}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  // Loading / wizard
  loading: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "#0f0f1a", color: "#888", fontFamily: "-apple-system, sans-serif" },
  wizardContainer: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "#0f0f1a", fontFamily: "-apple-system, sans-serif" },
  wizardCard: { width: "480px", padding: "40px", backgroundColor: "#14141f", borderRadius: "12px", border: "1px solid #2a2a3a", color: "#e0e0e0" },
  wizardLogo: { fontSize: "24px", fontWeight: 700, textAlign: "center" as const, color: "#3b82f6", marginBottom: "4px" },
  wizardSubtitle: { fontSize: "12px", textAlign: "center" as const, color: "#888", marginBottom: "32px" },
  wizardStep: { minHeight: "240px" },
  wizardH2: { fontSize: "18px", fontWeight: 600, marginBottom: "12px" },
  wizardP: { fontSize: "13px", color: "#aaa", lineHeight: "1.5", marginBottom: "16px" },
  wizardChecklist: { marginBottom: "24px" },
  checkItem: { padding: "6px 0", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" },
  wizardBtn: { width: "100%", padding: "10px", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "14px" },
  wizardDots: { display: "flex", justifyContent: "center", gap: "8px", marginTop: "24px" },
  codeBlock: { backgroundColor: "#0f0f1a", padding: "12px", borderRadius: "6px", fontFamily: "monospace", color: "#888", textAlign: "left" as const },

  // App layout
  app: { display: "flex", height: "100vh", backgroundColor: "#0f0f1a", color: "#e0e0e0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  sidebar: { width: "200px", backgroundColor: "#0a0a14", borderRight: "1px solid #1a1a2a", display: "flex", flexDirection: "column" as const, padding: "16px 0" },
  sidebarLogo: { fontSize: "18px", fontWeight: 700, color: "#3b82f6", padding: "0 16px", marginBottom: "2px" },
  sidebarSubtitle: { fontSize: "10px", color: "#555", padding: "0 16px", marginBottom: "20px", textTransform: "uppercase" as const, letterSpacing: "1px" },
  statusBlock: { padding: "0 16px", marginBottom: "20px" },
  statusRow: { display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", fontSize: "12px" },
  statusLabel: { flex: 1, color: "#888" },
  nav: { display: "flex", flexDirection: "column" as const, gap: "2px", padding: "0 8px" },
  navBtn: { background: "none", border: "none", color: "#ccc", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", textAlign: "left" as const },
  main: { flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" },

  // Common
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  badge: { fontSize: "10px", padding: "2px 8px", borderRadius: "4px", color: "#fff", fontWeight: 600, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const },
  label: { fontSize: "12px", color: "#888", display: "block", marginBottom: "4px", marginTop: "12px" },
  input: { width: "100%", padding: "8px 12px", backgroundColor: "#0f0f1a", border: "1px solid #3a3a4a", color: "#e0e0e0", borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" as const },
  select: { width: "100%", padding: "8px 12px", backgroundColor: "#0f0f1a", border: "1px solid #3a3a4a", color: "#e0e0e0", borderRadius: "6px", fontSize: "14px", marginBottom: "16px" },
  tinyBtn: { background: "none", border: "1px solid #3a3a4a", color: "#aaa", padding: "2px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "11px" },
  primaryBtn: { padding: "8px 16px", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap" as const },

  // Chat
  chatContainer: { display: "flex", flexDirection: "column" as const, flex: 1 },
  chatMessages: { flex: 1, overflowY: "auto" as const, padding: "16px", display: "flex", flexDirection: "column" as const, gap: "8px" },
  chatBubble: { maxWidth: "75%", padding: "8px 12px", borderRadius: "8px" },
  bubbleHeader: { display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" },
  bubbleTime: { fontSize: "10px", color: "#555" },
  bubbleText: { fontSize: "14px", lineHeight: "1.4" },
  chatInput: { display: "flex", gap: "8px", padding: "12px 16px", borderTop: "1px solid #2a2a3a" },
  levelSelect: { backgroundColor: "#1a1a2a", border: "1px solid #3a3a4a", borderRadius: "4px", padding: "6px", fontSize: "12px", fontWeight: 600 },
  textInput: { padding: "8px 12px", backgroundColor: "#1a1a2a", border: "1px solid #3a3a4a", color: "#e0e0e0", borderRadius: "6px", fontSize: "14px", outline: "none" },
  sendBtn: { padding: "8px 20px", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 },

  // Tab content
  tabContent: { flex: 1, overflowY: "auto" as const, padding: "24px" },
  tabHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
  tabTitle: { fontSize: "20px", fontWeight: 700, margin: 0 },

  // Keys
  keyGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  keyCard: { backgroundColor: "#14141f", borderRadius: "8px", padding: "16px" },
  keyCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  keyCardMeta: { fontSize: "11px", color: "#888", display: "flex", gap: "12px", marginBottom: "4px" },
  keyCardId: { fontSize: "11px", color: "#555", fontFamily: "monospace", marginBottom: "8px" },
  keyCardActions: { display: "flex", gap: "6px", marginTop: "8px" },

  // Audit
  auditMeta: { display: "flex", gap: "8px" },
  statsRow: { display: "flex", gap: "8px", flexWrap: "wrap" as const, marginBottom: "16px" },
  statCard: { backgroundColor: "#14141f", borderRadius: "6px", padding: "10px 14px", minWidth: "100px" },
  statCount: { fontSize: "20px", fontWeight: 700 },
  statLabel: { fontSize: "10px", color: "#888", textTransform: "capitalize" as const },
  auditTable: { backgroundColor: "#14141f", borderRadius: "8px", overflow: "hidden" },
  auditHeaderRow: { display: "flex", padding: "10px 16px", borderBottom: "1px solid #2a2a3a", fontSize: "11px", fontWeight: 600, color: "#888" },
  auditRow: { display: "flex", padding: "8px 16px", borderBottom: "1px solid #1a1a2a", alignItems: "center", fontSize: "12px" },

  // Adapters
  adapterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" },
  adapterCard: { display: "flex", alignItems: "center", gap: "12px", backgroundColor: "#14141f", borderRadius: "6px", padding: "12px 16px" },
  logBox: { backgroundColor: "#0a0a14", borderRadius: "6px", padding: "8px", maxHeight: "200px", overflowY: "auto" as const, fontSize: "12px", fontFamily: "monospace" },
  logLine: { padding: "2px 0" },

  // Settings
  settingSection: { marginBottom: "28px" },
  settingSectionTitle: { fontSize: "14px", fontWeight: 600, color: "#ccc", marginBottom: "8px" },
  configList: { backgroundColor: "#14141f", borderRadius: "6px", overflow: "hidden" },
  configItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #1a1a2a" },
};
