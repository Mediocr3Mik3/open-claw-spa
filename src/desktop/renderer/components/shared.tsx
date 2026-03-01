/**
 * openclaw-spa — Design System & Shared Components
 *
 * Marble-textured, theme-aware design system. Classical proportions meet
 * futuristic minimalism. Every pixel serves a purpose.
 *
 * Palette: Sky blue primary · Emerald trust · Autumnal amber · Ruby red
 * Backgrounds: Polished marble with subtle veining (dark/light modes)
 *
 * Philosophies: Steve Jobs (simplicity), Edwin Land (magic through
 * immediacy), Akio Morita (elegant function).
 */

import React, { useState, useEffect } from "react";

// ─── Theme System ────────────────────────────────────────────────────────

export type Theme = "light" | "dark";
let _theme: Theme = "dark";

const DARK = {
  bg: "#0b0b12", surface: "rgba(17,17,28,0.8)", raised: "rgba(26,26,48,0.85)", bright: "#1f1f38",
  border: "rgba(255,255,255,0.06)", borderLight: "rgba(255,255,255,0.04)", borderAccent: "rgba(107,163,232,0.18)",
  text: "#ede8e2", dim: "#8b8da3", muted: "#4e5068",
  accent: "#6ba3e8", accentSoft: "rgba(107,163,232,0.1)",
  ok: "#3ec989", okSoft: "rgba(62,201,137,0.08)",
  warn: "#d4943a", warnSoft: "rgba(212,148,58,0.08)",
  err: "#c94a4a", errSoft: "rgba(201,74,74,0.08)",
  grad: "linear-gradient(135deg, #6ba3e8 0%, #a87bde 100%)",
  gradSoft: "linear-gradient(135deg, rgba(107,163,232,0.06) 0%, rgba(168,123,222,0.06) 100%)",
  marbleOpacity: 0.035,
};

const LIGHT = {
  bg: "#f7f3ee", surface: "rgba(255,253,248,0.85)", raised: "rgba(255,255,255,0.92)", bright: "#ffffff",
  border: "rgba(30,20,10,0.08)", borderLight: "rgba(30,20,10,0.05)", borderAccent: "rgba(74,143,212,0.18)",
  text: "#1a1a2e", dim: "#5d5d73", muted: "#9b9baf",
  accent: "#4a8fd4", accentSoft: "rgba(74,143,212,0.08)",
  ok: "#2d8f63", okSoft: "rgba(45,143,99,0.06)",
  warn: "#c47830", warnSoft: "rgba(196,120,48,0.06)",
  err: "#b83a3a", errSoft: "rgba(184,58,58,0.06)",
  grad: "linear-gradient(135deg, #4a8fd4 0%, #7b6cc7 100%)",
  gradSoft: "linear-gradient(135deg, rgba(74,143,212,0.06) 0%, rgba(123,108,199,0.06) 100%)",
  marbleOpacity: 0.05,
};

export const C: Record<string, any> = {
  ...DARK,
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
  mono: "'SF Mono', 'JetBrains Mono', 'Cascadia Code', monospace",
  r: "12px", rs: "8px", rx: "6px",
  safePadTop: 38,
};

export function getTheme(): Theme { return _theme; }
export function setTheme(t: Theme) {
  _theme = t;
  const v = t === "light" ? LIGHT : DARK;
  Object.keys(v).forEach(k => { (C as any)[k] = (v as any)[k]; });
  document.getElementById("oc")?.remove();
  document.getElementById("oc-marble")?.remove();
  injectCSS();
}

export const LEVEL: Record<string, string> = { standard: C.dim, elevated: C.warn, admin: C.err };
export const EV_C: Record<string, string> = {
  envelope_verified: C.ok, envelope_rejected: C.err, key_generated: C.accent, key_revoked: C.err,
  intrusion_alert: C.err, rate_limit_hit: C.warn, app_started: C.accent, config_changed: C.accent,
  provider_switched: C.accent, budget_warning: C.warn, budget_exceeded: C.err,
};

export const glass = (n = 0): React.CSSProperties => ({
  background: [C.surface, C.raised, C.bright][n],
  backdropFilter: "blur(12px)",
  border: `1px solid ${C.border}`,
  borderRadius: C.r,
});

// ─── Marble Background ──────────────────────────────────────────────────

function injectMarble() {
  if (document.getElementById("oc-marble")) return;
  const isDark = _theme === "dark";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "oc-marble";
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none";
  svg.innerHTML = `
    <defs>
      <filter id="oc-vein" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.055" numOctaves="5" seed="7" stitchTiles="stitch" result="n"/>
        <feColorMatrix type="saturate" values="0" in="n" result="g"/>
        <feComponentTransfer in="g" result="v">
          <feFuncA type="table" tableValues="0 0.15 0.02 0.2 0.05 0.18 0.03 0.12 0"/>
        </feComponentTransfer>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="${C.bg}"/>
    <rect width="100%" height="100%" filter="url(#oc-vein)" fill="${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}" opacity="${C.marbleOpacity}"/>
  `;
  document.body.prepend(svg);
}

// ─── CSS Injection ───────────────────────────────────────────────────────

export const injectCSS = () => {
  if (document.getElementById("oc")) return;
  const isDark = _theme === "dark";
  const s = document.createElement("style"); s.id = "oc";
  s.textContent = `
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @keyframes glow{0%,100%{box-shadow:0 0 8px ${isDark ? "rgba(107,163,232,0.12)" : "rgba(74,143,212,0.12)"}}50%{box-shadow:0 0 20px ${isDark ? "rgba(107,163,232,0.25)" : "rgba(74,143,212,0.25)"}}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes slideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
    @keyframes slideInRight{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}
    @keyframes scaleIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
    @keyframes recordPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,74,74,0.4)}50%{box-shadow:0 0 0 6px rgba(201,74,74,0)}}
    @keyframes breathe{0%,100%{opacity:.7}50%{opacity:1}}
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:${C.bg};overflow:hidden;font-family:${C.font};color:${C.text};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.1)"};border-radius:3px}
    ::-webkit-scrollbar-thumb:hover{background:${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)"}}
    input,select,textarea{font-family:${C.font};color:${C.text}}
    button{font-family:${C.font};cursor:pointer;transition:all .15s ease}
    button:hover{filter:brightness(1.12)}button:active{transform:scale(.97)}
    .oc-tooltip{position:relative}.oc-tooltip:hover::after{content:attr(data-tip);position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);background:${isDark ? "#1a1c34" : "#faf8f5"};color:${C.text};padding:5px 12px;border-radius:8px;font-size:10px;white-space:nowrap;z-index:999;border:1px solid ${C.border};box-shadow:0 4px 16px ${isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.1)"};pointer-events:none;letter-spacing:0.2px}
    ::selection{background:${isDark ? "rgba(107,163,232,0.3)" : "rgba(74,143,212,0.2)"}}
    input::placeholder,textarea::placeholder{color:${C.muted}}
    input:focus,textarea:focus,select:focus{box-shadow:0 0 0 2px ${isDark ? "rgba(107,163,232,0.12)" : "rgba(74,143,212,0.12)"}}
    .oc-glass-hover:hover{border-color:${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} !important;background:${C.raised} !important}
  `;
  document.head.appendChild(s);
  injectMarble();
};

// ─── Micro-Components ────────────────────────────────────────────────────

export const Dot = ({ color, pulse, size }: { color: string; pulse?: boolean; size?: number }) => (
  <span style={{ width: size ?? 8, height: size ?? 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0, animation: pulse ? "pulse 2s ease-in-out infinite" : "none" }} />
);

export const Pill = ({ children, color, bg, onClick }: { children: React.ReactNode; color?: string; bg?: string; onClick?: () => void }) => (
  <span onClick={onClick} style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, color: color ?? "#fff", background: bg ?? "rgba(255,255,255,0.06)", textTransform: "uppercase" as const, letterSpacing: .5, whiteSpace: "nowrap" as const, cursor: onClick ? "pointer" : "default" }}>{children}</span>
);

export const Card = ({ children, style, glow, onClick }: { children: React.ReactNode; style?: React.CSSProperties; glow?: boolean; onClick?: () => void }) => (
  <div onClick={onClick} style={{ ...glass(1), padding: 18, animation: glow ? "glow 3s ease-in-out infinite" : undefined, cursor: onClick ? "pointer" : undefined, transition: "border-color .15s, background .15s", ...style }}>{children}</div>
);

export const Btn = ({ children, v, onClick, disabled, style }: { children: React.ReactNode; v?: "p" | "g" | "d"; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties }) => {
  const base: React.CSSProperties = { padding: "8px 18px", borderRadius: C.rx, fontWeight: 600, fontSize: 13, border: "none", ...style };
  const s = v === "d" ? { ...base, background: C.errSoft, color: C.err } : v === "g" ? { ...base, background: "rgba(255,255,255,0.04)", color: C.dim, border: `1px solid ${C.border}` } : { ...base, background: C.grad, color: "#fff" };
  return <button style={{ ...s, opacity: disabled ? .5 : 1 }} onClick={onClick} disabled={disabled}>{children}</button>;
};

export const Input = ({ value, onChange, placeholder, type, style, onKeyDown }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties; onKeyDown?: (e: React.KeyboardEvent) => void }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
    style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 14, outline: "none", ...style }}
    onFocus={e => { e.currentTarget.style.borderColor = C.accent; }} onBlur={e => { e.currentTarget.style.borderColor = C.border; }} />
);

export const TextArea = ({ value, onChange, placeholder, rows, style }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; style?: React.CSSProperties }) => (
  <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 12}
    style={{ width: "100%", padding: "12px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 13, fontFamily: C.mono, outline: "none", resize: "vertical" as const, lineHeight: 1.6, ...style }}
    onFocus={e => { e.currentTarget.style.borderColor = C.accent; }} onBlur={e => { e.currentTarget.style.borderColor = C.border; }} />
);

export const Select = ({ value, onChange, options, style }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; style?: React.CSSProperties }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 13, outline: "none", ...style }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const Sec = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <h3 style={{ fontSize: 12, fontWeight: 600, color: C.dim, textTransform: "uppercase" as const, letterSpacing: 1 }}>{children}</h3>
    {right}
  </div>
);

export const Empty = ({ icon, title, sub, action, onAction }: { icon: string; title: string; sub: string; action?: string; onAction?: () => void }) => (
  <div style={{ textAlign: "center" as const, padding: "48px 24px" }}>
    <div style={{ fontSize: 44, marginBottom: 14, opacity: .35 }}>{icon}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, color: C.dim, marginBottom: action ? 20 : 0, maxWidth: 340, margin: "0 auto" }}>{sub}</div>
    {action && <Btn onClick={onAction}>{action}</Btn>}
  </div>
);

export const Spinner = ({ size }: { size?: number }) => (
  <div style={{ width: size ?? 22, height: size ?? 22, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
);

// ─── Modal / Overlay ─────────────────────────────────────────────────────

export function Modal({ open, onClose, title, width, children }: { open: boolean; onClose: () => void; title: string; width?: number; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", animation: "fadeIn .15s ease" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: width ?? 480, maxHeight: "85vh", overflowY: "auto" as const, ...glass(1), padding: "28px 28px 24px", animation: "scaleIn .2s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Tab Switcher ────────────────────────────────────────────────────────

export function SubTabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: C.rs, padding: 3, border: `1px solid ${C.border}`, marginBottom: 22, width: "fit-content" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: "7px 18px", borderRadius: C.rx, border: "none", background: active === t.id ? C.accentSoft : "transparent", color: active === t.id ? C.accent : C.dim, fontSize: 12, fontWeight: 600 }}>{t.label}</button>
      ))}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, color, icon, pulse, onClick }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string; pulse?: boolean; onClick?: () => void;
}) {
  return (
    <Card onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Dot color={color ?? C.muted} pulse={pulse} />
        <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>{label}</span>
        {icon && <span style={{ marginLeft: "auto", fontSize: 16, opacity: .4 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────

export function ProgressBar({ percent, color, height }: { percent: number; color?: string; height?: number }) {
  const c = color ?? (percent >= 90 ? C.err : percent >= 70 ? C.warn : C.ok);
  return (
    <div style={{ height: height ?? 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(percent, 100)}%`, background: c, borderRadius: 3, transition: "width .3s ease" }} />
    </div>
  );
}

// ─── Auth Level Badge ────────────────────────────────────────────────────

export function AuthBadge({ level }: { level: string }) {
  const icons: Record<string, string> = { admin: "&#128737;", elevated: "&#128273;", standard: "&#9675;" };
  const colors: Record<string, string> = { admin: C.err, elevated: C.warn, standard: C.dim };
  const bgs: Record<string, string> = { admin: C.errSoft, elevated: C.warnSoft, standard: "rgba(255,255,255,0.04)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, color: colors[level] ?? C.dim, background: bgs[level] ?? "rgba(255,255,255,0.04)", textTransform: "capitalize" as const }}>
      <span dangerouslySetInnerHTML={{ __html: icons[level] ?? "" }} />
      {level}
    </span>
  );
}

// ─── Signature Badge ─────────────────────────────────────────────────────

export function SignatureBadge({ status, keyId, level, onClick }: { status: "verified" | "unsigned" | "invalid" | "signed"; keyId?: string; level?: string; onClick?: () => void }) {
  const cfg = {
    verified: { icon: "&#10003;", color: C.ok, bg: C.okSoft, label: "Verified" },
    signed: { icon: "&#10003;", color: C.ok, bg: C.okSoft, label: "Signed" },
    unsigned: { icon: "&#9888;", color: C.warn, bg: C.warnSoft, label: "Unsigned" },
    invalid: { icon: "&#10007;", color: C.err, bg: C.errSoft, label: "Invalid" },
  }[status];
  return (
    <span onClick={onClick} className="oc-tooltip" data-tip={keyId ? `Key: ${keyId.slice(0, 12)}...` : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 12, color: cfg.color, background: cfg.bg, cursor: onClick ? "pointer" : "default" }}>
      <span dangerouslySetInnerHTML={{ __html: cfg.icon }} /> {cfg.label}
    </span>
  );
}

// ─── Table Component ─────────────────────────────────────────────────────

export function Table({ columns, rows, onRowClick, selectedId }: {
  columns: { key: string; label: string; width?: number | string }[];
  rows: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
  selectedId?: string;
}) {
  return (
    <div style={{ ...glass(0), overflow: "hidden" }}>
      <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 600, color: C.dim }}>
        {columns.map(c => <span key={c.key} style={{ flex: c.width ? undefined : 1, width: c.width }}>{c.label}</span>)}
      </div>
      {rows.length === 0 && <div style={{ padding: 20, textAlign: "center" as const, color: C.muted, fontSize: 12 }}>No entries.</div>}
      {rows.map((row, i) => (
        <div key={String(row["id"] ?? row["key_id"] ?? i)} onClick={() => onRowClick?.(row)}
          style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12, cursor: onRowClick ? "pointer" : undefined, background: selectedId && String(row["id"] ?? row["key_id"]) === selectedId ? C.accentSoft : undefined }}>
          {columns.map(c => <span key={c.key} style={{ flex: c.width ? undefined : 1, width: c.width, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{String(row[c.key] ?? "-")}</span>)}
        </div>
      ))}
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface KeyInfo { key_id: string; label: string; max_auth_level: string; algorithm?: string; active: boolean; fingerprint?: string; created_at: string; }
export interface AuditEntry { id: number; timestamp: string; event_type: string; key_id?: string; channel?: string; sender_id?: string; auth_level?: string; status?: string; detail?: string; hash?: string; metadata?: Record<string, unknown>; }
export interface Message { id: number; text: string; sender: "user" | "agent"; auth_level?: string; signed: boolean; timestamp: string; key_id?: string; tool_calls?: ToolCall[]; thinking?: string; }
export interface ToolCall { name: string; args?: Record<string, unknown>; result?: string; auth_required?: string; status?: "pending" | "approved" | "denied" | "completed"; }
export interface BridgeLog { level: string; message: string; timestamp: string; }
export interface ModelInfo { id: string; label: string; provider_id: string; parameter_count_b?: number; context_window?: number; strengths?: string[]; estimated_cost_per_1k_input?: number; estimated_cost_per_1k_output?: number; }
export interface SetupDetection { hardware: { cpu: string; ram_gb: number; gpus: { name: string; vram_gb: number; vendor: string }[] }; runtimes: any[]; configured_providers: string[]; recommendations: { model: string; tier: string; reason: string; fits_in_memory: boolean }[]; summary: string; warnings: string[]; suggested_runtime: string; needs_runtime_install: boolean; }
export interface AgentConfig { id: string; name: string; description?: string; auth_level: string; model_id?: string; model_provider?: string; status: "online" | "offline" | "error"; created_at: string; last_active?: string; tools?: string[]; brain_files?: { name: string; content: string }[]; }
export type View = "overview" | "chat" | "agents" | "keys" | "authorization" | "skills" | "personality";
