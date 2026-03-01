/**
 * openclaw-spa — Shared UI Components & Design Tokens
 *
 * Extracted from monolithic App.tsx for modularity.
 * All tabs import from here for consistent styling.
 */

import React, { useState, useEffect } from "react";

// ─── Design Tokens ───────────────────────────────────────────────────────

export const C = {
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

export const LEVEL: Record<string, string> = { standard: C.dim, elevated: C.warn, admin: C.err };
export const EV_C: Record<string, string> = {
  envelope_verified: C.ok, envelope_rejected: C.err, key_generated: C.accent, key_revoked: C.err,
  intrusion_alert: C.err, rate_limit_hit: C.warn, app_started: C.accent, config_changed: C.accent,
  provider_switched: C.accent, budget_warning: C.warn, budget_exceeded: C.err,
};

export const glass = (n = 0): React.CSSProperties => ({
  background: [C.surface, C.raised, C.bright][n],
  border: `1px solid ${C.border}`,
  borderRadius: C.r,
});

// ─── CSS Injection ───────────────────────────────────────────────────────

export const injectCSS = () => {
  if (document.getElementById("oc")) return;
  const s = document.createElement("style"); s.id = "oc";
  s.textContent = `
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @keyframes glow{0%,100%{box-shadow:0 0 8px rgba(104,130,255,0.15)}50%{box-shadow:0 0 20px rgba(104,130,255,0.3)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes slideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
    @keyframes scaleIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:${C.bg};overflow:hidden;font-family:${C.font}}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:3px}
    input,select,textarea{font-family:${C.font}}
    button{font-family:${C.font};cursor:pointer;transition:all .12s ease}
    button:hover{filter:brightness(1.12)}button:active{transform:scale(.97)}
    .oc-tooltip{position:relative}.oc-tooltip:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100%+6px);left:50%;transform:translateX(-50%);background:#1a1b2e;color:#eeeef5;padding:4px 10px;border-radius:6px;font-size:10px;white-space:nowrap;z-index:999;border:1px solid rgba(255,255,255,0.08)}
  `;
  document.head.appendChild(s);
};

// ─── Micro-Components ────────────────────────────────────────────────────

export const Dot = ({ color, pulse, size }: { color: string; pulse?: boolean; size?: number }) => (
  <span style={{ width: size ?? 8, height: size ?? 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0, animation: pulse ? "pulse 2s ease-in-out infinite" : "none" }} />
);

export const Pill = ({ children, color, bg, onClick }: { children: React.ReactNode; color?: string; bg?: string; onClick?: () => void }) => (
  <span onClick={onClick} style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, color: color ?? "#fff", background: bg ?? "rgba(255,255,255,0.06)", textTransform: "uppercase" as const, letterSpacing: .5, whiteSpace: "nowrap" as const, cursor: onClick ? "pointer" : "default" }}>{children}</span>
);

export const Card = ({ children, style, glow, onClick }: { children: React.ReactNode; style?: React.CSSProperties; glow?: boolean; onClick?: () => void }) => (
  <div onClick={onClick} style={{ ...glass(1), padding: 20, animation: glow ? "glow 3s ease-in-out infinite" : undefined, cursor: onClick ? "pointer" : undefined, ...style }}>{children}</div>
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
export type View = "dashboard" | "agents" | "chat" | "keys" | "gates" | "audit" | "settings";
