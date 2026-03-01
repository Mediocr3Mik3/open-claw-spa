/**
 * openclaw-spa — Desktop Renderer (React)
 * Redesigned: Jobs-principle UI — minimal, intuitive, beautiful.
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
      hardware: { profile: () => Promise<unknown>; quickProfile: () => Promise<unknown>; recommendations: () => Promise<unknown>; };
      llm: {
        switch: (opts: { provider_id: string; model_id: string }) => Promise<unknown>;
        status: () => Promise<unknown>;
        listProviders: () => Promise<unknown[]>;
        listModels: (providerId: string) => Promise<string[]>;
        allStatuses: () => Promise<unknown[]>;
        complete: (opts: { messages: { role: string; content: string }[]; options?: Record<string, unknown> }) => Promise<unknown>;
        onProviderEvent: (callback: (event: unknown) => void) => void;
      };
      vault: {
        list: () => Promise<unknown[]>;
        setKey: (keyName: string, value: string) => Promise<{ saved: boolean; warning?: string }>;
        removeKey: (keyName: string) => Promise<boolean>;
        hasKey: (keyName: string) => Promise<boolean>;
        configuredProviders: () => Promise<string[]>;
      };
      spend: {
        summary: (since?: string, until?: string) => Promise<unknown>;
        daily: (days?: number) => Promise<unknown[]>;
        budget: () => Promise<unknown>;
        setBudget: (config: Record<string, unknown>) => Promise<unknown>;
        recent: (limit?: number) => Promise<unknown[]>;
        onUpdate: (callback: (data: { total_usd: number; budget_percent: number }) => void) => void;
      };
      gates: {
        list: (filterLevel?: string) => Promise<unknown[]>;
        check: (tool: string, grantedLevel: string) => Promise<boolean>;
        requiredLevel: (tool: string) => Promise<string>;
        partition: (tools: string[], grantedLevel: string) => Promise<{ approved: string[]; blocked: string[] }>;
        set: (tool: string, requiredLevel: string, description: string) => Promise<boolean>;
        remove: (tool: string) => Promise<boolean>;
      };
      keyRotation: {
        rotate: (oldKeyId: string, opts?: { grace_period_hours?: number; label?: string; algorithm?: string }) => Promise<unknown>;
        chain: (keyId: string) => Promise<unknown[]>;
        pending: () => Promise<unknown[]>;
        finalize: () => Promise<string[]>;
      };
      rateLimiter: { check: (sourceId: string) => Promise<boolean>; recordFailure: (sourceId: string) => Promise<boolean>; };
      org: {
        create: (name: string) => Promise<unknown>;
        get: (orgId: string) => Promise<unknown>;
        list: () => Promise<unknown[]>;
        addMember: (opts: { org_id: string; user_id: string; display_name: string; role: string; spa_key_id?: string }) => Promise<unknown>;
        listMembers: (orgId: string) => Promise<unknown[]>;
        updateRole: (memberId: string, newRole: string) => Promise<boolean>;
        removeMember: (memberId: string) => Promise<boolean>;
        bindKey: (memberId: string, spaKeyId: string) => Promise<boolean>;
      };
      models: {
        all: () => Promise<unknown[]>;
        local: () => Promise<unknown[]>;
        api: () => Promise<unknown[]>;
        find: (modelId: string) => Promise<unknown>;
        byProvider: (providerId: string) => Promise<unknown[]>;
        byStrength: (strength: string) => Promise<unknown[]>;
        estimateCost: (modelId: string, inputTokens: number, outputTokens: number) => Promise<number | null>;
      };
      runtime: {
        detect: () => Promise<unknown[]>;
        downloadUrl: (runtimeName: string) => Promise<string | null>;
        openDownload: (runtimeName: string) => Promise<{ opened: boolean; url?: string; error?: string }>;
        start: (runtimeName: string) => Promise<{ started: boolean; error?: string }>;
        stop: (runtimeName: string) => Promise<{ stopped: boolean; error?: string }>;
        health: (endpoint: string) => Promise<{ available: boolean; status?: number }>;
      };
      autoSetup: {
        detect: () => Promise<SetupDetection>;
        installRuntime: (runtimeName: string) => Promise<{ success: boolean; method?: string; url?: string; error?: string }>;
      };
      onIntrusionAlert: (callback: (alert: unknown) => void) => void;
    };
  }
}

// ─── Types ───────────────────────────────────────────────────────────────

interface Message { id: number; text: string; sender: "user" | "agent"; auth_level?: string; signed: boolean; timestamp: string; }
interface KeyInfo { key_id: string; label: string; max_auth_level: string; algorithm?: string; active: boolean; fingerprint?: string; created_at: string; }
interface AuditEntry { id: number; timestamp: string; event_type: string; key_id?: string; channel?: string; sender_id?: string; auth_level?: string; status?: string; detail?: string; hash?: string; }
interface BridgeLog { level: string; message: string; timestamp: string; }
interface ModelInfo { id: string; label: string; provider_id: string; parameter_count_b?: number; context_window?: number; strengths?: string[]; estimated_cost_per_1k_input?: number; estimated_cost_per_1k_output?: number; }
interface SetupDetection { hardware: { cpu: string; ram_gb: number; gpus: { name: string; vram_gb: number; vendor: string }[] }; runtimes: any[]; configured_providers: string[]; recommendations: { model: string; tier: string; reason: string; fits_in_memory: boolean }[]; summary: string; warnings: string[]; suggested_runtime: string; needs_runtime_install: boolean; }
type View = "home" | "chat" | "models" | "security" | "settings";

// ─── Design Tokens ───────────────────────────────────────────────────────

const C = {
  bg: "#06060e", surface: "#0c0d18", raised: "#111222", bright: "#181a2e",
  border: "rgba(255,255,255,0.05)", borderLight: "rgba(255,255,255,0.08)", borderAccent: "rgba(99,130,255,0.25)",
  text: "#eeeef5", dim: "#8b8da3", muted: "#4e5068",
  accent: "#6882ff", accentSoft: "rgba(104,130,255,0.12)",
  ok: "#34d399", okSoft: "rgba(52,211,153,0.1)",
  warn: "#fbbf24", warnSoft: "rgba(251,191,36,0.1)",
  err: "#f87171", errSoft: "rgba(248,113,113,0.1)",
  grad: "linear-gradient(135deg, #6882ff 0%, #a855f7 100%)",
  gradSoft: "linear-gradient(135deg, rgba(104,130,255,0.08) 0%, rgba(168,85,247,0.08) 100%)",
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', sans-serif",
  mono: "'SF Mono', 'JetBrains Mono', 'Cascadia Code', monospace",
  r: "14px", rs: "10px", rx: "6px",
};
const LEVEL: Record<string, string> = { standard: C.dim, elevated: C.warn, admin: C.err };
const EV_C: Record<string, string> = { envelope_verified: C.ok, envelope_rejected: C.err, key_generated: C.accent, key_revoked: C.err, intrusion_alert: C.err, rate_limit_hit: C.warn, app_started: C.accent, config_changed: C.accent };

const glass = (n = 0): React.CSSProperties => ({ background: [C.surface, C.raised, C.bright][n], border: `1px solid ${C.border}`, borderRadius: C.r });

// ─── CSS Injection ───────────────────────────────────────────────────────

const injectCSS = () => {
  if (document.getElementById("oc")) return;
  const s = document.createElement("style"); s.id = "oc";
  s.textContent = `
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @keyframes glow{0%,100%{box-shadow:0 0 8px rgba(104,130,255,0.15)}50%{box-shadow:0 0 20px rgba(104,130,255,0.3)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:${C.bg};overflow:hidden;font-family:${C.font}}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:3px}
    input,select,textarea{font-family:${C.font}}
    button{font-family:${C.font};cursor:pointer;transition:all .12s ease}
    button:hover{filter:brightness(1.12)}button:active{transform:scale(.97)}
  `;
  document.head.appendChild(s);
};

// ─── Micro-Components ────────────────────────────────────────────────────

const Dot = ({ color, pulse }: { color: string; pulse?: boolean }) => (
  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0, animation: pulse ? "pulse 2s ease-in-out infinite" : "none" }} />
);

const Pill = ({ children, color, bg }: { children: React.ReactNode; color?: string; bg?: string }) => (
  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, color: color ?? "#fff", background: bg ?? "rgba(255,255,255,0.06)", textTransform: "uppercase" as const, letterSpacing: .5, whiteSpace: "nowrap" as const }}>{children}</span>
);

const Card = ({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: boolean }) => (
  <div style={{ ...glass(1), padding: 20, animation: glow ? "glow 3s ease-in-out infinite" : undefined, ...style }}>{children}</div>
);

const Btn = ({ children, v, onClick, disabled, style }: { children: React.ReactNode; v?: "p" | "g" | "d"; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties }) => {
  const base: React.CSSProperties = { padding: "8px 18px", borderRadius: C.rx, fontWeight: 600, fontSize: 13, border: "none", ...style };
  const s = v === "d" ? { ...base, background: C.errSoft, color: C.err } : v === "g" ? { ...base, background: "rgba(255,255,255,0.04)", color: C.dim, border: `1px solid ${C.border}` } : { ...base, background: C.grad, color: "#fff" };
  return <button style={{ ...s, opacity: disabled ? .5 : 1 }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Input = ({ value, onChange, placeholder, type, style }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 14, outline: "none", ...style }}
    onFocus={e => { e.currentTarget.style.borderColor = C.accent; }} onBlur={e => { e.currentTarget.style.borderColor = C.border; }} />
);

const Sec = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontSize: 12, fontWeight: 600, color: C.dim, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 12 }}>{children}</h3>
);

const Empty = ({ icon, title, sub, action, onAction }: { icon: string; title: string; sub: string; action?: string; onAction?: () => void }) => (
  <div style={{ textAlign: "center" as const, padding: "48px 24px" }}>
    <div style={{ fontSize: 44, marginBottom: 14, opacity: .35 }}>{icon}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, color: C.dim, marginBottom: action ? 20 : 0, maxWidth: 340, margin: "0 auto" }}>{sub}</div>
    {action && <Btn onClick={onAction}>{action}</Btn>}
  </div>
);

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
  const labels = ["System", "Hardware", "Key", "Ready"];

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, fontFamily: C.font }}>
      <div style={{ width: 520, ...glass(1), padding: "44px 40px", color: C.text, animation: "fadeIn .5s ease" }}>
        {/* Logo */}
        <div style={{ textAlign: "center" as const, marginBottom: 6 }}>
          <div style={{ fontSize: 26, fontWeight: 700, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>OpenClaw</div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: "uppercase" as const }}>Secure Personal Agent</div>
        </div>
        {/* Steps */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4, margin: "24px 0 28px" }}>
          {labels.map((l, i) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, background: i <= step ? C.grad : "rgba(255,255,255,0.03)", color: i <= step ? "#fff" : C.muted, border: i > step ? `1px solid ${C.border}` : "none" }}>{i + 1}</div>
              {i < 3 && <div style={{ width: 28, height: 1, background: i < step ? C.accent : C.border }} />}
            </div>
          ))}
        </div>

        {/* Step 0: System */}
        {step === 0 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 19, fontWeight: 600, marginBottom: 6 }}>Welcome</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 20 }}>OpenClaw signs every prompt cryptographically. Let's set up your environment.</p>
            <div style={{ ...glass(0), padding: 14, marginBottom: 20 }}>
              {[
                { l: "Platform", v: `${platform.platform ?? "..."} (${platform.arch ?? "..."})`, ok: true },
                { l: "Electron", v: String(platform.electron_version ?? "..."), ok: true },
                { l: "Safe Storage", v: platform.safe_storage ? "Available" : "Unavailable", ok: !!platform.safe_storage },
              ].map(r => (
                <div key={r.l} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                  <Dot color={r.ok ? C.ok : C.err} /><span style={{ fontSize: 12, color: C.dim, width: 90 }}>{r.l}</span><span style={{ fontSize: 13, color: C.text }}>{r.v}</span>
                </div>
              ))}
            </div>
            <Btn onClick={() => setStep(1)} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>Continue</Btn>
          </div>
        )}

        {/* Step 1: Hardware */}
        {step === 1 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 19, fontWeight: 600, marginBottom: 6 }}>Your Hardware</h2>
            {scanning ? (
              <div style={{ textAlign: "center" as const, padding: "36px 0", color: C.dim }}>
                <div style={{ width: 22, height: 22, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 14px" }} />
                Scanning...
              </div>
            ) : detection ? (
              <>
                <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 14 }}>{detection.summary}</p>
                <div style={{ ...glass(0), padding: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>CPU</span><span style={{ fontSize: 13, color: C.text }}>{detection.hardware.cpu}</span></div>
                  <div style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>RAM</span><span style={{ fontSize: 13, color: C.text }}>{detection.hardware.ram_gb} GB</span></div>
                  {detection.hardware.gpus.map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>GPU</span><span style={{ fontSize: 13, color: C.text }}>{g.name} ({g.vram_gb}GB)</span></div>
                  ))}
                  <div style={{ display: "flex", gap: 10, padding: "5px 0" }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>Runtime</span><span style={{ fontSize: 13, color: detection.runtimes.length ? C.ok : C.warn }}>{detection.runtimes.length ? detection.runtimes.map((r: any) => r.name).join(", ") : "None"}</span></div>
                </div>
                {detection.needs_runtime_install && (
                  <div style={{ ...glass(0), padding: 12, marginBottom: 14, borderColor: "rgba(251,191,36,0.15)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <Dot color={C.warn} /><span style={{ color: C.warn, fontWeight: 600 }}>No local runtime found.</span>
                    </div>
                    <p style={{ fontSize: 11, color: C.dim, marginTop: 4, marginLeft: 16 }}>Install <strong style={{ color: C.text }}>Ollama</strong> later from the Models tab.</p>
                  </div>
                )}
                {detection.recommendations.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <Sec>Recommended Models</Sec>
                    {detection.recommendations.slice(0, 3).map((r, i) => (
                      <div key={i} style={{ ...glass(0), padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <Pill bg={r.fits_in_memory ? C.okSoft : C.warnSoft} color={r.fits_in_memory ? C.ok : C.warn}>{r.tier}</Pill>
                        <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{r.model}</span>
                        <span style={{ fontSize: 10, color: C.muted }}>{r.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Btn onClick={() => setStep(2)} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>Continue</Btn>
              </>
            ) : <div style={{ color: C.err, padding: 20 }}>Detection failed.</div>}
          </div>
        )}

        {/* Step 2: Key */}
        {step === 2 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 19, fontWeight: 600, marginBottom: 6 }}>Create Signing Key</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 18 }}>ECDSA P-384 key stored in your OS keychain. Signs elevated prompts.</p>
            <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Label</label>
            <Input value={keyLabel} onChange={setKeyLabel} style={{ marginBottom: 12 }} />
            <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Max Auth Level</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
              {(["standard", "elevated", "admin"] as const).map(l => (
                <button key={l} onClick={() => setKeyLevel(l)} style={{ flex: 1, padding: "9px 0", borderRadius: C.rs, border: keyLevel === l ? `1px solid ${C.accent}` : `1px solid ${C.border}`, background: keyLevel === l ? C.accentSoft : "transparent", color: keyLevel === l ? C.accent : C.dim, fontWeight: 600, fontSize: 12, textTransform: "capitalize" as const }}>{l}</button>
              ))}
            </div>
            <Btn onClick={genKey} disabled={loading} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>{loading ? "Generating..." : "Generate Key Pair"}</Btn>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div style={{ animation: "fadeIn .3s ease", textAlign: "center" as const }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.okSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 18px", color: C.ok }}>&#10003;</div>
            <h2 style={{ fontSize: 19, fontWeight: 600, marginBottom: 6 }}>You're all set</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 18 }}>Your signing key is stored securely.</p>
            {keyResult && (
              <div style={{ ...glass(0), padding: 12, marginBottom: 22, fontFamily: C.mono, fontSize: 10, color: C.muted, textAlign: "left" as const, wordBreak: "break-all" as const }}>
                ID: {keyResult.key_id}<br />FP: {keyResult.fingerprint}
              </div>
            )}
            <Btn onClick={finish} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>Open Dashboard</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Home View ───────────────────────────────────────────────────────────

function HomeView({ onNav, gwOn, brOn }: { onNav: (v: View) => void; gwOn: boolean; brOn: boolean }) {
  const [det, setDet] = useState<SetupDetection | null>(null);
  const [prov, setProv] = useState<any>(null);
  const [spend, setSpend] = useState<any>(null);

  useEffect(() => {
    window.spa.autoSetup.detect().then(setDet).catch(() => {});
    window.spa.llm.status().then(setProv).catch(() => {});
    window.spa.spend.budget().then(setSpend).catch(() => {});
  }, []);

  const hasLLM = prov?.provider_id;
  const hasRT = det && det.runtimes.length > 0;

  return (
    <div style={{ padding: 28, overflowY: "auto" as const, flex: 1, animation: "fadeIn .3s ease" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
      <p style={{ fontSize: 13, color: C.dim, marginBottom: 24 }}>Your AI command center.</p>

      {/* Onboarding CTA */}
      {(!hasLLM || !hasRT) && (
        <div style={{ ...glass(1), padding: 22, marginBottom: 22, background: C.gradSoft, borderColor: C.borderAccent, animation: "glow 3s ease-in-out infinite" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>&#9889;</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Get Started</div>
              <div style={{ fontSize: 12, color: C.dim }}>{!hasRT ? "Install a local runtime to run models." : "Connect an LLM provider to start chatting."}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!hasRT && <Btn onClick={() => onNav("models")}>Set Up Runtime</Btn>}
            {!hasLLM && <Btn onClick={() => onNav("models")} v={!hasRT ? "g" : "p"}>Configure Provider</Btn>}
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 22 }}>
        <Card><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Dot color={hasLLM ? C.ok : C.muted} pulse={!!hasLLM} /><span style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Model</span></div><div style={{ fontSize: 16, fontWeight: 600 }}>{prov?.model_id ?? "None"}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{prov?.provider_id ?? "No provider"}</div></Card>
        <Card><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Dot color={brOn ? C.ok : C.err} pulse={brOn} /><span style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Bridge</span></div><div style={{ fontSize: 16, fontWeight: 600 }}>{brOn ? "Running" : "Stopped"}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>Gateway: {gwOn ? "Connected" : "Off"}</div></Card>
        <Card><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Dot color={hasRT ? C.ok : C.warn} /><span style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Runtimes</span></div><div style={{ fontSize: 16, fontWeight: 600 }}>{det?.runtimes.length ?? 0} found</div><div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{det?.runtimes.map((r: any) => r.name).join(", ") || "None"}</div></Card>
        <Card><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Dot color={C.accent} /><span style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Spend</span></div><div style={{ fontSize: 16, fontWeight: 600 }}>${(spend?.monthly_limit_usd ?? 0).toFixed(2)}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>Monthly budget</div></Card>
      </div>

      {/* Hardware */}
      {det && (
        <div style={{ marginBottom: 22 }}>
          <Sec>Hardware</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            <div style={{ ...glass(1), padding: 14 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>CPU</div><div style={{ fontSize: 13 }}>{det.hardware.cpu}</div></div>
            <div style={{ ...glass(1), padding: 14 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>Memory</div><div style={{ fontSize: 13 }}>{det.hardware.ram_gb} GB</div></div>
            {det.hardware.gpus.map((g, i) => (
              <div key={i} style={{ ...glass(1), padding: 14 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>GPU</div><div style={{ fontSize: 13 }}>{g.name}</div><div style={{ fontSize: 11, color: C.dim }}>{g.vram_gb} GB VRAM</div></div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <button onClick={() => onNav("chat")} style={{ ...glass(1), padding: 18, textAlign: "left" as const, cursor: "pointer" }}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>Start Chatting</div><div style={{ fontSize: 11, color: C.dim }}>Send signed messages to your agent</div></button>
        <button onClick={() => onNav("security")} style={{ ...glass(1), padding: 18, textAlign: "left" as const, cursor: "pointer" }}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>Security</div><div style={{ fontSize: 11, color: C.dim }}>Keys, gates, and audit trail</div></button>
      </div>
    </div>
  );
}

// ─── Chat View ───────────────────────────────────────────────────────────

function ChatView({ msgs, input, setInput, auth, setAuth, keyId, onSend, hasLLM, onNav }: {
  msgs: Message[]; input: string; setInput: (v: string) => void; auth: string; setAuth: (v: string) => void;
  keyId: string | null; onSend: () => void; hasLLM: boolean; onNav: (v: View) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  if (!hasLLM) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Empty icon="&#129302;" title="No LLM Connected" sub="Connect a provider or start a local runtime to begin." action="Set Up Provider" onAction={() => onNav("models")} /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, flex: 1, animation: "fadeIn .2s ease" }}>
      <div style={{ flex: 1, overflowY: "auto" as const, padding: 20, display: "flex", flexDirection: "column" as const, gap: 8 }}>
        {msgs.length === 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: .3 }}><div style={{ textAlign: "center" as const }}><div style={{ fontSize: 36, marginBottom: 10 }}>&#128172;</div><div style={{ fontSize: 13, color: C.dim }}>Send your first message</div></div></div>}
        {msgs.map(m => (
          <div key={m.id} style={{ alignSelf: m.sender === "user" ? "flex-end" : "flex-start", maxWidth: "70%", padding: "10px 16px", borderRadius: m.sender === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: m.sender === "user" ? "rgba(104,130,255,0.12)" : C.raised, border: `1px solid ${m.sender === "user" ? C.borderAccent : C.border}` }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 3, alignItems: "center" }}>
              {m.auth_level && m.auth_level !== "standard" && <Pill bg={m.auth_level === "admin" ? C.errSoft : C.warnSoft} color={LEVEL[m.auth_level]}>{m.auth_level}</Pill>}
              {m.signed && <Pill bg={C.okSoft} color={C.ok}>signed</Pill>}
              <span style={{ fontSize: 9, color: C.muted, marginLeft: "auto" }}>{new Date(m.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{m.text}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: C.rx, padding: 2, border: `1px solid ${C.border}` }}>
          {(["standard", "elevated", "admin"] as const).map(l => (
            <button key={l} onClick={() => setAuth(l)} style={{ padding: "5px 9px", borderRadius: 4, border: "none", background: auth === l ? (l === "admin" ? C.errSoft : l === "elevated" ? C.warnSoft : C.accentSoft) : "transparent", color: auth === l ? LEVEL[l] : C.muted, fontSize: 10, fontWeight: 600, textTransform: "capitalize" as const }}>{l}</button>
          ))}
        </div>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onSend()} placeholder="Type a message..." style={{ flex: 1, padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 14, outline: "none" }} />
        <Btn onClick={onSend} style={{ padding: "10px 22px" }}>Send</Btn>
      </div>
    </div>
  );
}

// ─── Models & Providers View ─────────────────────────────────────────────

function ModelsView() {
  const [sub, setSub] = useState<"models" | "providers" | "runtime">("models");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [filter, setFilter] = useState<"all" | "local" | "api">("all");
  const [search, setSearch] = useState("");
  const [runtimes, setRuntimes] = useState<any[]>([]);
  const [vaultKeys, setVaultKeys] = useState<string[]>([]);
  const [nkName, setNkName] = useState(""); const [nkVal, setNkVal] = useState("");
  const [prov, setProv] = useState<any>(null);

  useEffect(() => {
    window.spa.models.all().then((m: any) => setModels(m));
    window.spa.runtime.detect().then((r: any) => setRuntimes(r));
    window.spa.vault.configuredProviders().then(setVaultKeys);
    window.spa.llm.status().then(setProv).catch(() => {});
  }, []);

  const filtered = models.filter(m => {
    const local = ["ollama", "llama.cpp", "lm-studio"].includes(m.provider_id);
    if (filter === "local" && !local) return false;
    if (filter === "api" && local) return false;
    if (search && !m.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const switchModel = async (m: ModelInfo) => {
    try { await window.spa.llm.switch({ provider_id: m.provider_id, model_id: m.id }); setProv(await window.spa.llm.status()); } catch (e) { alert(`Failed: ${e}`); }
  };

  const saveKey = async () => {
    if (!nkName.trim() || !nkVal.trim()) return;
    await window.spa.vault.setKey(nkName.trim(), nkVal.trim()); setNkName(""); setNkVal("");
    setVaultKeys(await window.spa.vault.configuredProviders());
  };

  return (
    <div style={{ padding: 28, overflowY: "auto" as const, flex: 1, animation: "fadeIn .2s ease" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Models & Providers</h1>
      <p style={{ fontSize: 13, color: C.dim, marginBottom: 22 }}>Browse models, configure API keys, manage runtimes.</p>

      <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: C.rs, padding: 3, border: `1px solid ${C.border}`, marginBottom: 22, width: "fit-content" }}>
        {(["models", "providers", "runtime"] as const).map(t => (
          <button key={t} onClick={() => setSub(t)} style={{ padding: "7px 18px", borderRadius: C.rx, border: "none", background: sub === t ? C.accentSoft : "transparent", color: sub === t ? C.accent : C.dim, fontSize: 12, fontWeight: 600, textTransform: "capitalize" as const }}>{t}</button>
        ))}
      </div>

      {sub === "models" && (<>
        {prov?.model_id && (
          <Card style={{ marginBottom: 18, borderColor: C.borderAccent }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.ok} pulse /><span style={{ fontSize: 12, color: C.dim }}>Active:</span><span style={{ fontSize: 14, fontWeight: 600 }}>{prov.model_id}</span><Pill bg={C.accentSoft} color={C.accent}>{prov.provider_id}</Pill></div>
          </Card>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <Input value={search} onChange={setSearch} placeholder="Search models..." style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: C.rs, padding: 3, border: `1px solid ${C.border}` }}>
            {(["all", "local", "api"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 12px", borderRadius: C.rx, border: "none", background: filter === f ? C.accentSoft : "transparent", color: filter === f ? C.accent : C.dim, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const }}>{f}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {filtered.map(m => {
            const local = ["ollama", "llama.cpp", "lm-studio"].includes(m.provider_id);
            return (
              <div key={m.id} style={{ ...glass(1), padding: 14, cursor: "pointer" }} onClick={() => switchModel(m)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: prov?.model_id === m.id ? C.accent : C.text }}>{m.label}</span>
                  <Pill bg={local ? C.okSoft : C.accentSoft} color={local ? C.ok : C.accent}>{m.provider_id}</Pill>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 10, color: C.dim }}>
                  {m.parameter_count_b && <span>{m.parameter_count_b}B</span>}
                  {m.context_window && <span>{(m.context_window / 1000).toFixed(0)}k ctx</span>}
                  {m.estimated_cost_per_1k_input != null && <span>${m.estimated_cost_per_1k_input}/1k</span>}
                </div>
                {m.strengths && m.strengths.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" as const }}>{m.strengths.slice(0, 3).map(s => <Pill key={s}>{s}</Pill>)}</div>}
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && <Empty icon="&#128269;" title="No models" sub="Try different search or filter." />}
      </>)}

      {sub === "providers" && (<>
        <Sec>API Key Vault</Sec>
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>Encrypted with AES-256-GCM in your OS keychain.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Input value={nkName} onChange={setNkName} placeholder="Key name (e.g. OPENAI_API_KEY)" style={{ flex: 1 }} />
          <Input value={nkVal} onChange={setNkVal} placeholder="Value" type="password" style={{ flex: 1 }} />
          <Btn onClick={saveKey}>Save</Btn>
        </div>
        <div style={{ ...glass(0), overflow: "hidden" }}>
          {vaultKeys.length === 0 && <div style={{ padding: 18, textAlign: "center" as const, color: C.muted, fontSize: 12 }}>No API keys yet.</div>}
          {vaultKeys.map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.ok} /><span style={{ fontFamily: C.mono, fontSize: 12 }}>{k}</span></div>
              <Btn v="d" onClick={async () => { await window.spa.vault.removeKey(k); setVaultKeys(await window.spa.vault.configuredProviders()); }} style={{ padding: "3px 10px", fontSize: 10 }}>Remove</Btn>
            </div>
          ))}
        </div>
      </>)}

      {sub === "runtime" && (<>
        <Sec>Detected Runtimes</Sec>
        {runtimes.length === 0 ? (
          <Card style={{ marginBottom: 18 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.warn} /><span style={{ fontSize: 13 }}>No local runtimes detected.</span></div><p style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>Install one below to run models locally.</p></Card>
        ) : runtimes.map((r: any) => (
          <Card key={r.name} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.ok} pulse /><div><div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: C.dim }}>{r.version ?? "detected"}</div></div></div>
              <div style={{ display: "flex", gap: 6 }}><Btn v="g" onClick={() => window.spa.runtime.start(r.name)} style={{ padding: "5px 12px", fontSize: 11 }}>Start</Btn><Btn v="d" onClick={() => window.spa.runtime.stop(r.name)} style={{ padding: "5px 12px", fontSize: 11 }}>Stop</Btn></div>
            </div>
          </Card>
        ))}
        <Sec>Install</Sec>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[{ n: "Ollama", id: "ollama", d: "Easy local inference" }, { n: "LM Studio", id: "lm-studio", d: "GUI model manager" }, { n: "llama.cpp", id: "llama.cpp", d: "Raw performance" }].map(rt => (
            <div key={rt.id} style={{ ...glass(1), padding: 18, cursor: "pointer" }} onClick={() => window.spa.runtime.openDownload(rt.id)}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{rt.n}</div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>{rt.d}</div>
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>Download &#8594;</span>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// ─── Security View ───────────────────────────────────────────────────────

function SecurityView({ keys, keyId, setKeyId, refresh }: { keys: KeyInfo[]; keyId: string | null; setKeyId: (id: string) => void; refresh: () => void; }) {
  const [sub, setSub] = useState<"keys" | "gates" | "audit">("keys");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [chain, setChain] = useState<boolean | null>(null);
  const [gates, setGates] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);

  useEffect(() => {
    if (sub === "audit") { window.spa.audit.query({ limit: 50 }).then(setEntries); window.spa.audit.stats().then(setStats); window.spa.audit.verifyChain().then(r => setChain(r === null)); }
    if (sub === "gates") { window.spa.gates.list().then(setGates); window.spa.keyRotation.pending().then(setPending); }
  }, [sub]);

  const genKey = async () => {
    const label = prompt("Key label:") ?? "Key";
    const level = prompt("Auth level (standard/elevated/admin):") ?? "elevated";
    try { await window.spa.generateKey({ label, max_auth_level: level }); refresh(); } catch (e) { alert(`Failed: ${e}`); }
  };

  return (
    <div style={{ padding: 28, overflowY: "auto" as const, flex: 1, animation: "fadeIn .2s ease" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Security</h1>
      <p style={{ fontSize: 13, color: C.dim, marginBottom: 22 }}>Keys, action gates, and tamper-evident audit log.</p>

      <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: C.rs, padding: 3, border: `1px solid ${C.border}`, marginBottom: 22, width: "fit-content" }}>
        {(["keys", "gates", "audit"] as const).map(t => (
          <button key={t} onClick={() => setSub(t)} style={{ padding: "7px 18px", borderRadius: C.rx, border: "none", background: sub === t ? C.accentSoft : "transparent", color: sub === t ? C.accent : C.dim, fontSize: 12, fontWeight: 600, textTransform: "capitalize" as const }}>{t}</button>
        ))}
      </div>

      {sub === "keys" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><Sec>Signing Keys</Sec><Btn onClick={genKey} style={{ padding: "5px 14px", fontSize: 11 }}>+ New Key</Btn></div>
        {keys.length === 0 ? <Empty icon="&#128273;" title="No keys" sub="Generate a key to sign elevated prompts." action="Generate Key" onAction={genKey} /> : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {keys.map(k => (
              <Card key={k.key_id} style={{ borderColor: k.key_id === keyId ? C.borderAccent : C.border, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{k.label}</span>
                  <div style={{ display: "flex", gap: 4 }}>{k.key_id === keyId && <Pill bg={C.accentSoft} color={C.accent}>Active</Pill>}<Pill bg={k.active ? C.okSoft : C.errSoft} color={k.active ? C.ok : C.err}>{k.active ? "Valid" : "Revoked"}</Pill></div>
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, marginBottom: 6, wordBreak: "break-all" as const }}>{k.fingerprint ? `fp: ${k.fingerprint.slice(0, 20)}...` : `id: ${k.key_id.slice(0, 10)}...`}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 10, color: C.dim, marginBottom: 8 }}><span>{k.algorithm ?? "ecdsa-p384"}</span><span style={{ color: LEVEL[k.max_auth_level] ?? C.dim }}>{k.max_auth_level}</span><span>{new Date(k.created_at).toLocaleDateString()}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  {k.active && k.key_id !== keyId && <Btn v="g" onClick={() => setKeyId(k.key_id)} style={{ padding: "3px 10px", fontSize: 10 }}>Use</Btn>}
                  {k.active && <Btn v="d" onClick={async () => { if (confirm("Revoke?")) { await window.spa.revokeKey(k.key_id); refresh(); } }} style={{ padding: "3px 10px", fontSize: 10 }}>Revoke</Btn>}
                </div>
              </Card>
            ))}
          </div>
        )}
        {pending.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <Sec>Pending Key Rotations</Sec>
            <Card><p style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>{pending.length} rotation(s) with active grace periods.</p><Btn onClick={async () => { await window.spa.keyRotation.finalize(); setPending(await window.spa.keyRotation.pending()); refresh(); }} style={{ padding: "5px 14px", fontSize: 11 }}>Finalize Expired</Btn></Card>
          </div>
        )}
      </>)}

      {sub === "gates" && (<>
        <Sec>Action Gates</Sec>
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>Gates control which tools require signed authorization.</p>
        {gates.length === 0 ? <Empty icon="&#128737;" title="No gates defined" sub="Action gates will appear here once configured." /> : (
          <div style={{ ...glass(0), overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 600, color: C.dim }}><span style={{ flex: 2 }}>Tool</span><span style={{ flex: 1 }}>Required Level</span><span style={{ flex: 2 }}>Description</span><span style={{ width: 60 }}></span></div>
            {gates.map((g: any) => (
              <div key={g.tool} style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <span style={{ flex: 2, fontFamily: C.mono, fontSize: 11 }}>{g.tool}</span>
                <span style={{ flex: 1 }}><Pill bg={g.required_level === "admin" ? C.errSoft : g.required_level === "elevated" ? C.warnSoft : C.accentSoft} color={LEVEL[g.required_level] ?? C.dim}>{g.required_level}</Pill></span>
                <span style={{ flex: 2, color: C.dim }}>{g.description ?? "-"}</span>
                <span style={{ width: 60 }}><Btn v="d" onClick={async () => { await window.spa.gates.remove(g.tool); setGates(await window.spa.gates.list()); }} style={{ padding: "2px 8px", fontSize: 9 }}>Remove</Btn></span>
              </div>
            ))}
          </div>
        )}
      </>)}

      {sub === "audit" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Sec>Audit Log</Sec>
          <Pill bg={chain === true ? C.okSoft : chain === false ? C.errSoft : undefined} color={chain === true ? C.ok : chain === false ? C.err : C.dim}>{chain === true ? "Chain Intact" : chain === false ? "CHAIN BROKEN" : "..."}</Pill>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 14 }}>
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} style={{ ...glass(1), padding: "8px 12px", minWidth: 90 }}><div style={{ fontSize: 18, fontWeight: 700, color: EV_C[k] ?? C.dim }}>{v}</div><div style={{ fontSize: 9, color: C.dim, textTransform: "capitalize" as const }}>{k.replace(/_/g, " ")}</div></div>
          ))}
        </div>
        <div style={{ ...glass(0), overflow: "hidden" }}>
          <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 600, color: C.dim }}><span style={{ width: 140 }}>Time</span><span style={{ width: 140 }}>Event</span><span style={{ width: 80 }}>Auth</span><span style={{ flex: 1 }}>Detail</span></div>
          {entries.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", padding: "7px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
              <span style={{ width: 140, color: C.dim, fontSize: 10 }}>{new Date(e.timestamp).toLocaleString()}</span>
              <span style={{ width: 140 }}><Pill bg={(EV_C[e.event_type] ?? C.dim) + "18"} color={EV_C[e.event_type] ?? C.dim}>{e.event_type.replace(/_/g, " ")}</Pill></span>
              <span style={{ width: 80, color: LEVEL[e.auth_level ?? ""] ?? C.dim }}>{e.auth_level ?? "-"}</span>
              <span style={{ flex: 1, color: C.dim, fontSize: 11 }}>{e.detail ?? "-"}</span>
            </div>
          ))}
          {entries.length === 0 && <div style={{ padding: 20, textAlign: "center" as const, color: C.muted, fontSize: 12 }}>No entries yet.</div>}
        </div>
      </>)}
    </div>
  );
}

// ─── Settings View ───────────────────────────────────────────────────────

function SettingsView({ gwOn, brOn, gwUrl, setGwUrl, configKeys, setConfigKeys }: {
  gwOn: boolean; brOn: boolean; gwUrl: string; setGwUrl: (v: string) => void;
  configKeys: string[]; setConfigKeys: (k: string[]) => void;
}) {
  const [sub, setSub] = useState<"general" | "adapters" | "org">("general");
  const [nk, setNk] = useState(""); const [nv, setNv] = useState("");
  const [orgs, setOrgs] = useState<any[]>([]);
  const [logs, setLogs] = useState<BridgeLog[]>([]);

  useEffect(() => {
    if (sub === "org") window.spa.org.list().then(setOrgs).catch(() => {});
    window.spa.bridge.onLog((l: any) => setLogs(p => [...p.slice(-99), { ...l, timestamp: new Date().toISOString() }]));
  }, [sub]);

  const saveConfig = async () => {
    if (!nk.trim()) return;
    await window.spa.config.set(nk.trim(), nv); setNk(""); setNv("");
    setConfigKeys(await window.spa.config.keys());
  };

  const ADAPTERS = [
    { name: "WhatsApp", key: "WHATSAPP_API_TOKEN" }, { name: "Signal", key: "SIGNAL_API_URL" }, { name: "Telegram", key: "TELEGRAM_BOT_TOKEN" },
    { name: "Discord", key: "DISCORD_BOT_TOKEN" }, { name: "iMessage", key: "IMESSAGE_ENABLED" }, { name: "Slack", key: "SLACK_BOT_TOKEN" },
    { name: "SMS/Twilio", key: "TWILIO_ACCOUNT_SID" }, { name: "Email", key: "EMAIL_IMAP_HOST" }, { name: "Teams", key: "TEAMS_APP_ID" },
    { name: "Matrix", key: "MATRIX_HOMESERVER_URL" }, { name: "IRC", key: "IRC_SERVER" }, { name: "Messenger", key: "MESSENGER_PAGE_ACCESS_TOKEN" },
    { name: "Google Chat", key: "GOOGLE_CHAT_SA_PATH" }, { name: "X (Twitter)", key: "X_BEARER_TOKEN" }, { name: "LINE", key: "LINE_CHANNEL_ACCESS_TOKEN" },
    { name: "WeChat", key: "WECHAT_APP_ID" }, { name: "Webhook", key: "WEBHOOK_REPLY_URL" },
  ];

  return (
    <div style={{ padding: 28, overflowY: "auto" as const, flex: 1, animation: "fadeIn .2s ease" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 13, color: C.dim, marginBottom: 22 }}>Configuration, adapters, and organization.</p>

      <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: C.rs, padding: 3, border: `1px solid ${C.border}`, marginBottom: 22, width: "fit-content" }}>
        {(["general", "adapters", "org"] as const).map(t => (
          <button key={t} onClick={() => setSub(t)} style={{ padding: "7px 18px", borderRadius: C.rx, border: "none", background: sub === t ? C.accentSoft : "transparent", color: sub === t ? C.accent : C.dim, fontSize: 12, fontWeight: 600, textTransform: "capitalize" as const }}>{t === "org" ? "Organization" : t}</button>
        ))}
      </div>

      {sub === "general" && (<>
        <Sec>Gateway</Sec>
        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          <Input value={gwUrl} onChange={setGwUrl} placeholder="ws://localhost:3210/ws" style={{ flex: 1 }} />
          <Btn onClick={() => window.spa.connectGateway(gwUrl)}>Connect</Btn>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", ...glass(0) }}><Dot color={gwOn ? C.ok : C.err} /><span style={{ fontSize: 11, color: C.dim }}>{gwOn ? "Connected" : "Off"}</span></div>
        </div>

        <Sec>Bridge</Sec>
        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", ...glass(0) }}><Dot color={brOn ? C.ok : C.err} pulse={brOn} /><span style={{ fontSize: 12 }}>{brOn ? "Running" : "Stopped"}</span></div>
          <Btn v="g" onClick={() => brOn ? window.spa.bridge.stop() : window.spa.bridge.start()}>{brOn ? "Stop" : "Start"}</Btn>
        </div>
        {logs.length > 0 && (
          <div style={{ ...glass(0), padding: 10, maxHeight: 140, overflowY: "auto" as const, fontFamily: C.mono, fontSize: 11, marginBottom: 22 }}>
            {logs.slice(-20).map((l, i) => <div key={i} style={{ padding: "2px 0", color: l.level === "error" ? C.err : C.dim }}><span style={{ color: C.muted, fontSize: 9 }}>{new Date(l.timestamp).toLocaleTimeString()}</span> {l.message}</div>)}
          </div>
        )}

        <Sec>Encrypted Config</Sec>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>AES-256-GCM encrypted, OS keychain backed.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Input value={nk} onChange={setNk} placeholder="Key name" style={{ flex: 1 }} />
          <Input value={nv} onChange={setNv} placeholder="Value" type="password" style={{ flex: 1 }} />
          <Btn onClick={saveConfig}>Save</Btn>
        </div>
        <div style={{ ...glass(0), overflow: "hidden" }}>
          {configKeys.length === 0 && <div style={{ padding: 16, textAlign: "center" as const, color: C.muted, fontSize: 11 }}>No entries.</div>}
          {configKeys.map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: C.mono, fontSize: 11 }}>{k}</span>
              <Btn v="d" onClick={async () => { await window.spa.config.delete(k); setConfigKeys(await window.spa.config.keys()); }} style={{ padding: "2px 8px", fontSize: 9 }}>Delete</Btn>
            </div>
          ))}
        </div>
      </>)}

      {sub === "adapters" && (<>
        <Sec>Messaging Adapters</Sec>
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>Configure tokens in Encrypted Config above. Bridge auto-enables adapters with tokens.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Dot color={brOn ? C.ok : C.err} /><span style={{ fontSize: 12, color: C.dim }}>Bridge {brOn ? "Running" : "Stopped"}</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
          {ADAPTERS.map(a => <AdapterCard key={a.name} name={a.name} cfgKey={a.key} />)}
        </div>
      </>)}

      {sub === "org" && (<>
        <Sec>Organizations</Sec>
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>Manage teams, roles, and SPA key bindings.</p>
        <Btn onClick={async () => { const n = prompt("Organization name:"); if (n) { await window.spa.org.create(n); setOrgs(await window.spa.org.list()); } }} style={{ marginBottom: 14, padding: "6px 16px", fontSize: 12 }}>+ Create Org</Btn>
        {orgs.length === 0 ? <Empty icon="&#127970;" title="No organizations" sub="Create one to manage team access." /> : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {orgs.map((o: any) => (
              <Card key={o.org_id} style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{o.name}</div>
                <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>{o.org_id}</div>
              </Card>
            ))}
          </div>
        )}
      </>)}
    </div>
  );
}

function AdapterCard({ name, cfgKey }: { name: string; cfgKey: string }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { window.spa.config.has(cfgKey).then(setOk); }, [cfgKey]);
  return (
    <div style={{ ...glass(1), padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderLeftWidth: 3, borderLeftStyle: "solid" as const, borderLeftColor: ok ? C.ok : C.border }}>
      <div><div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div><div style={{ fontSize: 10, color: ok ? C.ok : C.muted }}>{ok == null ? "..." : ok ? "Configured" : "Not set"}</div></div>
    </div>
  );
}

// ─── Nav Items ───────────────────────────────────────────────────────────

const NAV: { view: View; label: string; icon: string }[] = [
  { view: "home", label: "Home", icon: "&#9670;" },
  { view: "chat", label: "Chat", icon: "&#9673;" },
  { view: "models", label: "Models", icon: "&#9043;" },
  { view: "security", label: "Security", icon: "&#9672;" },
  { view: "settings", label: "Settings", icon: "&#9881;" },
];

// ─── Main App ────────────────────────────────────────────────────────────

export default function App() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("home");
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
  const mc = useRef(0);

  useEffect(() => { injectCSS(); window.spa.setup.isComplete().then(setReady); }, []);

  useEffect(() => {
    if (!ready) return;
    window.spa.listKeys().then((k: KeyInfo[]) => { setKeys(k); const a = k.find(x => x.active); if (a) setKeyId(a.key_id); });
    window.spa.gatewayStatus().then(s => setGwOn(s.connected));
    window.spa.bridge.status().then(s => setBrOn(s.running));
    window.spa.config.keys().then(setCfgKeys);
    window.spa.llm.status().then(setProvStat).catch(() => {});
    window.spa.onGatewayStatus(s => setGwOn(s.connected));
    window.spa.bridge.onStatus(s => setBrOn(s.running));
    window.spa.onGatewayMessage((d: any) => {
      if (d?.text) { mc.current++; setMsgs(p => [...p, { id: mc.current, text: d.text, sender: "agent", signed: false, timestamp: new Date().toISOString() }]); }
    });
    window.spa.onIntrusionAlert((a: any) => { console.warn("[Intrusion Alert]", a); });
  }, [ready]);

  const refreshKeys = async () => { const k = await window.spa.listKeys(); setKeys(k); };

  const send = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim(); setInput("");
    let token: string | undefined; let signed = false;
    if (auth !== "standard" && keyId) {
      try { token = await window.spa.signMessage({ text, key_id: keyId, auth_level: auth }); signed = true; } catch {}
    }
    mc.current++; setMsgs(p => [...p, { id: mc.current, text, sender: "user", auth_level: auth, signed, timestamp: new Date().toISOString() }]);
    await window.spa.sendMessage({ text, token });
  }, [input, auth, keyId]);

  if (ready === null) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.dim, fontFamily: C.font }}>Loading...</div>;
  if (!ready) return <SetupWizard onComplete={() => setReady(true)} />;

  const hasLLM = !!provStat?.provider_id;

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, fontFamily: C.font }}>
      {/* Sidebar */}
      <div style={{ width: 68, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" as const, alignItems: "center", paddingTop: 20, gap: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 700, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 20, userSelect: "none" as const }}>OC</div>
        {NAV.map(n => (
          <button key={n.view} onClick={() => setView(n.view)} title={n.label}
            style={{ width: 44, height: 44, borderRadius: C.rs, border: "none", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 2,
              background: view === n.view ? C.accentSoft : "transparent", color: view === n.view ? C.accent : C.dim, fontSize: 16, transition: "all .12s" }}>
            <span dangerouslySetInnerHTML={{ __html: n.icon }} />
            <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: .3 }}>{n.label}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6 }}>
          <Dot color={brOn ? C.ok : C.err} pulse={brOn} />
          <Dot color={gwOn ? C.ok : C.err} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" }}>
        {view === "home" && <HomeView onNav={setView} gwOn={gwOn} brOn={brOn} />}
        {view === "chat" && <ChatView msgs={msgs} input={input} setInput={setInput} auth={auth} setAuth={setAuth} keyId={keyId} onSend={send} hasLLM={hasLLM} onNav={setView} />}
        {view === "models" && <ModelsView />}
        {view === "security" && <SecurityView keys={keys} keyId={keyId} setKeyId={setKeyId} refresh={refreshKeys} />}
        {view === "settings" && <SettingsView gwOn={gwOn} brOn={brOn} gwUrl={gwUrl} setGwUrl={setGwUrl} configKeys={cfgKeys} setConfigKeys={setCfgKeys} />}
      </div>
    </div>
  );
}
