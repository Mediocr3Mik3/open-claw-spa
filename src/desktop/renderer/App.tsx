/**
 * openclaw-spa — Desktop Renderer (React)
 * Redesigned: 7-tab modular architecture with command palette,
 * keyboard shortcuts, and exec approval flow.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

import { C, glass, Dot, Pill, Btn, injectCSS, Spinner } from "./components/shared";
import type { View, KeyInfo, Message, AuditEntry, SetupDetection } from "./components/shared";
import DashboardView from "./components/DashboardView";
import AgentsView from "./components/AgentsView";
import ChatView from "./components/ChatView";
import KeysView from "./components/KeysView";
import GatesView from "./components/GatesView";
import AuditView from "./components/AuditView";
import SettingsView from "./components/SettingsView";
import { CommandPalette, ExecApprovalModal, useKeyboardShortcuts } from "./components/Modals";
import type { ExecApproval } from "./components/Modals";
import SkillsBrowser from "./components/SkillsBrowser";
import GlobalPersonality from "./components/GlobalPersonality";

// ─── Setup Wizard ────────────────────────────────────────────────────────

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<Record<string, unknown>>({});
  const [detection, setDetection] = useState<SetupDetection | null>(null);
  const [keyLabel, setKeyLabel] = useState("My Signing Key");
  const [keyLevel, setKeyLevel] = useState("elevated");
  const [keyResult, setKeyResult] = useState<{ key_id: string; fingerprint: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    injectCSS();
    Promise.all([
      window.spa.setup.getPlatform().then(setPlatform),
      window.spa.autoSetup.detect().then(setDetection),
    ]).finally(() => setScanning(false));
  }, []);

  const genKey = async () => {
    setLoading(true);
    try { const r = await window.spa.generateKey({ label: keyLabel, max_auth_level: keyLevel }); setKeyResult(r); setStep(3); }
    catch (e) { alert(`Key generation failed: ${e}`); }
    setLoading(false);
  };

  const finish = async () => { await window.spa.setup.complete(); onComplete(); };
  const labels = ["System", "Hardware", "Key", "Secure"];
  const LEVEL: Record<string, string> = { standard: C.dim, elevated: C.warn, admin: C.err };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, fontFamily: C.font }}>
      <div style={{ width: 540, ...glass(1), padding: "48px 44px", color: C.text, animation: "fadeIn .5s ease" }}>
        <div style={{ textAlign: "center" as const, marginBottom: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: -0.5 }}>OpenClaw</div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 3, textTransform: "uppercase" as const, marginTop: 4 }}>Signed Prompt Architecture</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 4, margin: "28px 0 32px" }}>
          {labels.map((l, i) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, background: i <= step ? C.grad : "rgba(255,255,255,0.03)", color: i <= step ? "#fff" : C.muted, border: i > step ? `1px solid ${C.border}` : "none", transition: "all .3s" }}>{i + 1}</div>
              {i < 3 && <div style={{ width: 32, height: 1, background: i < step ? C.accent : C.border, transition: "background .3s" }} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Welcome</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 20 }}>OpenClaw signs every prompt with your cryptographic key. No unsigned message reaches your AI agent.</p>
            <div style={{ ...glass(0), padding: 16, marginBottom: 22, borderRadius: C.r }}>
              {[
                { l: "Platform", v: `${platform.platform ?? "..."} (${platform.arch ?? "..."})`, ok: true },
                { l: "Electron", v: String(platform.electron_version ?? "..."), ok: true },
                { l: "Keychain", v: platform.safe_storage ? "Available" : "Unavailable", ok: !!platform.safe_storage },
              ].map(r => (
                <div key={r.l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <Dot color={r.ok ? C.ok : C.err} /><span style={{ fontSize: 12, color: C.dim, width: 80 }}>{r.l}</span><span style={{ fontSize: 13, color: C.text }}>{r.v}</span>
                </div>
              ))}
            </div>
            <Btn onClick={() => setStep(1)} style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>Continue</Btn>
          </div>
        )}

        {step === 1 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Your Hardware</h2>
            {scanning ? (
              <div style={{ textAlign: "center" as const, padding: "40px 0", color: C.dim }}>
                <Spinner /><div style={{ marginTop: 14 }}>Scanning system...</div>
              </div>
            ) : detection ? (
              <>
                <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 16 }}>{detection.summary}</p>
                <div style={{ ...glass(0), padding: 16, marginBottom: 16, borderRadius: C.r }}>
                  <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>CPU</span><span style={{ fontSize: 13, color: C.text }}>{detection.hardware.cpu}</span></div>
                  <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>RAM</span><span style={{ fontSize: 13, color: C.text }}>{detection.hardware.ram_gb} GB</span></div>
                  {detection.hardware.gpus.map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>GPU</span><span style={{ fontSize: 13, color: C.text }}>{g.name} ({g.vram_gb}GB)</span></div>
                  ))}
                  <div style={{ display: "flex", gap: 12, padding: "6px 0" }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>Runtime</span><span style={{ fontSize: 13, color: detection.runtimes.length ? C.ok : C.warn }}>{detection.runtimes.length ? detection.runtimes.map((r: any) => r.name).join(", ") : "None detected"}</span></div>
                </div>
                {detection.needs_runtime_install && (
                  <div style={{ ...glass(0), padding: 14, marginBottom: 16, borderLeft: `3px solid ${C.warn}` }}>
                    <div style={{ fontSize: 12, color: C.warn, fontWeight: 600, marginBottom: 2 }}>No local runtime</div>
                    <p style={{ fontSize: 11, color: C.dim }}>You can install <strong style={{ color: C.text }}>Ollama</strong> from Settings after setup.</p>
                  </div>
                )}
                {detection.recommendations.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 10 }}>Recommended Models</h3>
                    {detection.recommendations.slice(0, 3).map((r, i) => (
                      <div key={i} style={{ ...glass(0), padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 6, borderRadius: C.rs }}>
                        <Pill bg={r.fits_in_memory ? C.okSoft : C.warnSoft} color={r.fits_in_memory ? C.ok : C.warn}>{r.tier}</Pill>
                        <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{r.model}</span>
                        <span style={{ fontSize: 10, color: C.muted }}>{r.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Btn onClick={() => setStep(2)} style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>Continue</Btn>
              </>
            ) : <div style={{ color: C.err, padding: 20 }}>Detection failed.</div>}
          </div>
        )}

        {step === 2 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Create Signing Key</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 20 }}>This ECDSA P-384 key is stored in your OS keychain. It signs every elevated prompt so your agent knows it came from you.</p>
            <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 6 }}>Key Label</label>
            <input value={keyLabel} onChange={e => setKeyLabel(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 14, outline: "none", marginBottom: 14 }} />
            <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 6 }}>Max Authorization Level</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
              {(["standard", "elevated", "admin"] as const).map(l => (
                <button key={l} onClick={() => setKeyLevel(l)} style={{ flex: 1, padding: "10px 0", borderRadius: C.rs, border: keyLevel === l ? `1px solid ${C.accent}` : `1px solid ${C.border}`, background: keyLevel === l ? C.accentSoft : "transparent", color: keyLevel === l ? C.accent : C.dim, fontWeight: 600, fontSize: 12, textTransform: "capitalize" as const, transition: "all .15s" }}>{l}</button>
              ))}
            </div>
            <Btn onClick={genKey} disabled={loading} style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>{loading ? "Generating..." : "Generate Key Pair"}</Btn>
          </div>
        )}

        {step === 3 && (
          <div style={{ animation: "fadeIn .3s ease", textAlign: "center" as const }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: C.okSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px", color: C.ok, border: `2px solid ${C.ok}` }}>&#10003;</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>OpenClaw is Secure</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 12 }}>Your signing key is encrypted in the OS keychain. Every prompt you send will be cryptographically signed.</p>
            {keyResult && (
              <div style={{ ...glass(0), padding: 16, marginBottom: 14, textAlign: "left" as const, borderRadius: C.r }}>
                {[
                  { l: "Key ID", v: keyResult.key_id },
                  { l: "Fingerprint", v: keyResult.fingerprint },
                  { l: "Encryption", v: "AES-256-GCM" },
                  { l: "Storage", v: "OS Keychain (safeStorage)" },
                  { l: "Algorithm", v: "ECDSA P-384" },
                ].map(r => (
                  <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <span style={{ color: C.dim }}>{r.l}</span>
                    <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...glass(0), padding: 12, marginBottom: 24, borderLeft: `3px solid ${C.ok}`, textAlign: "left" as const }}>
              <div style={{ fontSize: 11, color: C.ok, fontWeight: 600, marginBottom: 2 }}>Security Summary</div>
              <ul style={{ fontSize: 11, color: C.dim, lineHeight: 1.7, paddingLeft: 16 }}>
                <li>Private key encrypted in OS keychain</li>
                <li>Config encrypted with AES-256-GCM</li>
                <li>Tamper-evident audit chain active</li>
                <li>All prompts require signature verification</li>
              </ul>
            </div>
            <Btn onClick={finish} style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>Open Dashboard</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nav Items ───────────────────────────────────────────────────────────

const NAV: { view: View; label: string; icon: string; shortcut: string }[] = [
  { view: "dashboard", label: "Dashboard", icon: "&#9670;", shortcut: "1" },
  { view: "agents", label: "Agents", icon: "&#129302;", shortcut: "2" },
  { view: "chat", label: "Chat", icon: "&#9673;", shortcut: "3" },
  { view: "keys", label: "Keys", icon: "&#128273;", shortcut: "4" },
  { view: "gates", label: "Gates", icon: "&#128737;", shortcut: "5" },
  { view: "audit", label: "Audit", icon: "&#128203;", shortcut: "6" },
  { view: "skills", label: "Skills", icon: "&#129513;", shortcut: "7" },
  { view: "personality", label: "You", icon: "&#10024;", shortcut: "8" },
  { view: "settings", label: "Settings", icon: "&#9881;", shortcut: "9" },
];

// ─── Main App ────────────────────────────────────────────────────────────

export default function App() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [settingsSub, setSettingsSub] = useState("general");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [auth, setAuth] = useState("standard");
  const [gwOn, setGwOn] = useState(false);
  const [brOn, setBrOn] = useState(false);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [cfgKeys, setCfgKeys] = useState<string[]>([]);
  const [gwUrl, setGwUrl] = useState("ws://localhost:3210/ws");
  const [provStat, setProvStat] = useState<any>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [approval, setApproval] = useState<ExecApproval | null>(null);
  const [version, setVersion] = useState("");
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<{id:string;name:string;status:string}[]>([]);
  const mc = useRef(0);

  const navTo = useCallback((v: View, sub?: string) => {
    setView(v);
    if (v === "settings" && sub) setSettingsSub(sub);
  }, []);

  useEffect(() => { injectCSS(); window.spa.setup.isComplete().then(setReady); }, []);

  useEffect(() => {
    if (!ready) return;
    window.spa.listKeys().then((k: KeyInfo[]) => { setKeys(k); const a = k.find(x => x.active); if (a) setKeyId(a.key_id); });
    window.spa.gatewayStatus().then(s => setGwOn(s.connected));
    window.spa.bridge.status().then(s => setBrOn(s.running));
    window.spa.config.keys().then(setCfgKeys);
    window.spa.llm.status().then(setProvStat).catch(() => {});
    window.spa.getVersion().then(setVersion).catch(() => {});
    window.spa.onGatewayStatus(s => setGwOn(s.connected));
    window.spa.bridge.onStatus(s => setBrOn(s.running));
    window.spa.onGatewayMessage((d: any) => {
      if (d?.text) { mc.current++; setMsgs(p => [...p, { id: mc.current, text: d.text, sender: "agent", signed: !!d.signed, timestamp: new Date().toISOString(), key_id: d.key_id, tool_calls: d.tool_calls, thinking: d.thinking }]); }
    });
    window.spa.onIntrusionAlert((a: any) => { console.warn("[Intrusion Alert]", a); });
    window.spa.config.get("agents").then((raw: string | null) => { if (raw) try { setAgents(JSON.parse(raw)); } catch {} }).catch(() => {});
  }, [ready]);

  const refreshKeys = async () => { const k = await window.spa.listKeys(); setKeys(k); };

  const send = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim(); setInput("");
    let token: string | undefined; let signed = false;
    if (auth !== "standard" && keyId) {
      try { token = await window.spa.signMessage({ text, key_id: keyId, auth_level: auth }); signed = true; } catch {}
    }
    mc.current++; setMsgs(p => [...p, { id: mc.current, text, sender: "user", auth_level: auth, signed, timestamp: new Date().toISOString(), key_id: keyId ?? undefined }]);
    await window.spa.sendMessage({ text, token });
  }, [input, auth, keyId]);

  useKeyboardShortcuts({
    onNav: setView,
    onPalette: () => setPaletteOpen(true),
    onNewItem: () => {},
  });

  const paletteActions = [
    ...NAV.map(n => ({ id: `nav-${n.view}`, label: `Go to ${n.label}`, sub: `Press ${n.shortcut}`, icon: n.icon, action: () => setView(n.view) })),
    { id: "gen-key", label: "Generate Signing Key", sub: "Create a new ECDSA key pair", icon: "&#128273;", action: () => setView("keys") },
    { id: "add-gate", label: "Add Action Gate", sub: "Configure authorization gate", icon: "&#128737;", action: () => setView("gates") },
    { id: "view-audit", label: "View Audit Log", sub: "Check security events", icon: "&#128203;", action: () => setView("audit") },
    { id: "cfg-adapters", label: "Configure Messaging", sub: "Set up messaging adapters", icon: "&#9673;", action: () => navTo("settings", "adapters") },
    { id: "cfg-llm", label: "Configure LLM", sub: "Set up AI providers & models", icon: "&#129302;", action: () => navTo("settings", "llm") },
    { id: "toggle-bridge", label: brOn ? "Stop Bridge" : "Start Bridge", sub: `Bridge is ${brOn ? "running" : "stopped"}`, icon: "&#9673;", action: () => brOn ? window.spa.bridge.stop() : window.spa.bridge.start() },
  ];

  if (ready === null) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.dim, fontFamily: C.font }}><Spinner size={28} /></div>;
  if (!ready) return <SetupWizard onComplete={() => setReady(true)} />;

  const hasLLM = !!provStat?.provider_id;
  const isDarwin = navigator.userAgent.includes("Mac");

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, fontFamily: C.font }}>
      {/* ─── Sidebar ─── */}
      <div style={{ width: 62, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" as const, alignItems: "center", paddingTop: isDarwin ? C.safePadTop : 12, gap: 0, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8, userSelect: "none" as const, letterSpacing: -0.5 }}>OC</div>
        {NAV.map(n => {
          const active = view === n.view;
          return (
            <button key={n.view} onClick={() => setView(n.view)}
              className="oc-tooltip" data-tip={n.label}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              style={{ width: 44, height: 36, borderRadius: C.rs, border: "none", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 1,
                background: active ? C.accentSoft : "transparent", color: active ? C.accent : C.muted, fontSize: 13, transition: "all .15s",
                borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent" }}>
              <span dangerouslySetInnerHTML={{ __html: n.icon }} />
              <span style={{ fontSize: 7, fontWeight: 600, letterSpacing: .2, opacity: active ? 1 : .6 }}>{n.label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button onClick={() => setPaletteOpen(true)}
          style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, fontWeight: 600 }}>
          {isDarwin ? "\u2318K" : "^K"}
        </button>
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5 }}>
          <Dot color={brOn ? C.ok : C.muted} pulse={brOn} size={6} />
          <Dot color={gwOn ? C.ok : C.muted} size={6} />
        </div>
        {version && <div style={{ fontSize: 7, color: C.muted, marginBottom: 8, userSelect: "none" as const }}>v{version}</div>}
      </div>

      {/* ─── Content ─── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden", paddingTop: isDarwin ? C.safePadTop - 10 : 0 }}>
        {view === "dashboard" && <DashboardView onNav={navTo} gwOn={gwOn} brOn={brOn} keys={keys} />}
        {view === "agents" && <AgentsView onNav={navTo} onOpenChat={(id: string) => { setChatAgent(id); setView("chat"); }} />}
        {view === "chat" && <ChatView msgs={msgs} input={input} setInput={setInput} auth={auth} setAuth={setAuth} keyId={keyId} keys={keys} onSend={send} hasLLM={hasLLM} onNav={navTo} agentId={chatAgent} agents={agents} onAgentChange={setChatAgent} />}
        {view === "keys" && <KeysView keys={keys} keyId={keyId} setKeyId={setKeyId} refresh={refreshKeys} />}
        {view === "gates" && <GatesView />}
        {view === "audit" && <AuditView />}
        {view === "skills" && <SkillsBrowser />}
        {view === "personality" && <GlobalPersonality />}
        {view === "settings" && <SettingsView gwOn={gwOn} brOn={brOn} gwUrl={gwUrl} setGwUrl={setGwUrl} configKeys={cfgKeys} setConfigKeys={setCfgKeys} initialSub={settingsSub} />}
      </div>

      {/* ─── Overlays ─── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <ExecApprovalModal
        approval={approval}
        keys={keys}
        onApprove={async () => { setApproval(null); }}
        onDeny={() => setApproval(null)}
        onClose={() => setApproval(null)}
      />
    </div>
  );
}
