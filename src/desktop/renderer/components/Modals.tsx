/**
 * openclaw-spa — Global Modals & Keyboard Shortcuts
 *
 * Command palette (Ctrl+K), exec approval modal, keyboard shortcut handler.
 */

import React, { useState, useEffect, useCallback } from "react";
import { C, glass, Dot, Pill, Btn, Input, AuthBadge, Modal, LEVEL } from "./shared";
import type { View, KeyInfo } from "./shared";

// ─── Command Palette ─────────────────────────────────────────────────────

interface PaletteAction {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  action: () => void;
}

export function CommandPalette({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: PaletteAction[] }) {
  const [search, setSearch] = useState("");

  useEffect(() => { if (open) setSearch(""); }, [open]);

  const filtered = actions.filter(a =>
    a.label.toLowerCase().includes(search.toLowerCase()) ||
    (a.sub?.toLowerCase().includes(search.toLowerCase()))
  );

  const exec = (a: PaletteAction) => { a.action(); onClose(); };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120, background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: 420, background: C.raised, border: `1px solid ${C.borderAccent}`, borderRadius: 14, overflow: "hidden", animation: "scaleIn .15s ease", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type a command..."
            autoFocus
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered.length > 0) exec(filtered[0]);
            }}
            style={{ width: "100%", padding: "8px 0", background: "transparent", border: "none", color: C.text, fontSize: 16, outline: "none", fontFamily: C.font }} />
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" as const }}>
          {filtered.length === 0 && <div style={{ padding: 24, textAlign: "center" as const, color: C.muted, fontSize: 13 }}>No matching commands</div>}
          {filtered.map(a => (
            <div key={a.id} onClick={() => exec(a)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.accentSoft; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              {a.icon && <span style={{ fontSize: 16, opacity: .5, width: 24, textAlign: "center" as const }} dangerouslySetInnerHTML={{ __html: a.icon }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                {a.sub && <div style={{ fontSize: 11, color: C.dim }}>{a.sub}</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted, display: "flex", gap: 12 }}>
          <span>&#8593;&#8595; Navigate</span>
          <span>&#9166; Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Exec Approval Modal ─────────────────────────────────────────────────

export interface ExecApproval {
  id: string;
  operation: string;
  command: string;
  agent: string;
  requiredLevel: string;
  timestamp: Date;
}

export function ExecApprovalModal({ approval, keys, onApprove, onDeny, onClose }: {
  approval: ExecApproval | null;
  keys: KeyInfo[];
  onApprove: (keyId: string) => void;
  onDeny: () => void;
  onClose: () => void;
}) {
  const [selKey, setSelKey] = useState("");

  useEffect(() => {
    if (approval) {
      const valid = keys.filter(k => k.active && (
        approval.requiredLevel === "admin" ? k.max_auth_level === "admin" :
        approval.requiredLevel === "elevated" ? ["admin", "elevated"].includes(k.max_auth_level) : true
      ));
      if (valid.length > 0) setSelKey(valid[0].key_id);
    }
  }, [approval, keys]);

  if (!approval) return null;

  const validKeys = keys.filter(k => k.active && (
    approval.requiredLevel === "admin" ? k.max_auth_level === "admin" :
    approval.requiredLevel === "elevated" ? ["admin", "elevated"].includes(k.max_auth_level) : true
  ));

  const levelColor = LEVEL[approval.requiredLevel] ?? C.warn;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,0.4)", animation: "fadeIn .15s ease" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, height: "100%", background: C.raised, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column" as const, animation: "slideInRight .25s ease", overflow: "hidden" }}>
        {/* Header with urgency stripe */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${levelColor}08, transparent)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: levelColor + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, animation: "pulse 2s infinite" }}>&#9888;&#65039;</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Approval Required</div>
              <div style={{ fontSize: 11, color: C.dim }}>Agent requests a sensitive operation</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, fontSize: 18, lineHeight: 1 }}>&times;</button>
          </div>
          <AuthBadge level={approval.requiredLevel} />
        </div>

        {/* Operation details */}
        <div style={{ padding: 24, flex: 1, overflowY: "auto" as const }}>
          <div style={{ ...glass(0), padding: 16, marginBottom: 20, borderLeft: `3px solid ${levelColor}`, borderRadius: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "8px 12px", fontSize: 12 }}>
              <span style={{ color: C.dim, fontWeight: 600 }}>Operation</span>
              <span style={{ fontFamily: C.mono, fontWeight: 600 }}>{approval.operation}</span>
              <span style={{ color: C.dim, fontWeight: 600 }}>Command</span>
              <span style={{ fontFamily: C.mono, color: levelColor, wordBreak: "break-all" as const, fontSize: 11 }}>{approval.command}</span>
              <span style={{ color: C.dim, fontWeight: 600 }}>Agent</span>
              <span>{approval.agent}</span>
              <span style={{ color: C.dim, fontWeight: 600 }}>Time</span>
              <span style={{ fontSize: 11, color: C.dim }}>{approval.timestamp.toLocaleTimeString()}</span>
            </div>
          </div>

          {validKeys.length > 0 ? (
            <>
              <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: "block", marginBottom: 8 }}>Sign with key:</label>
              <div style={{ marginBottom: 16 }}>
                {validKeys.map(k => (
                  <div key={k.key_id} onClick={() => setSelKey(k.key_id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, marginBottom: 4, cursor: "pointer", background: selKey === k.key_id ? C.accentSoft : "transparent", border: selKey === k.key_id ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`, transition: "all .12s" }}>
                    <Dot color={selKey === k.key_id ? C.accent : C.muted} size={7} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{k.label}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{k.algorithm ?? "ecdsa-p384"} &middot; {k.max_auth_level}</div>
                    </div>
                    {selKey === k.key_id && <span style={{ color: C.accent, fontSize: 14 }}>&#10003;</span>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ ...glass(0), padding: 16, marginBottom: 16, borderLeft: `3px solid ${C.err}`, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: C.err }}>No keys available for {approval.requiredLevel}-level authorization. Generate an appropriate key first.</span>
            </div>
          )}
        </div>

        {/* Action buttons pinned to bottom */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, background: C.surface }}>
          <Btn v="d" onClick={onDeny} style={{ flex: 1, padding: "12px 0", fontSize: 13 }}>Deny</Btn>
          <Btn onClick={() => onApprove(selKey)} disabled={!selKey} style={{ flex: 1, padding: "12px 0", fontSize: 13 }}>
            {validKeys.length > 0 ? "Sign & Approve" : "No Valid Key"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Keyboard Shortcuts Hook ─────────────────────────────────────────────

export function useKeyboardShortcuts({ onNav, onPalette, onNewItem }: {
  onNav: (v: View) => void;
  onPalette: () => void;
  onNewItem: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }

      // Ctrl/Cmd + K -> Command palette
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); onPalette(); return; }

      // Number keys for tab navigation
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key) {
          case "1": onNav("overview"); return;
          case "2": onNav("chat"); return;
          case "3": onNav("agents"); return;
          case "4": onNav("keys"); return;
          case "5": onNav("authorization"); return;
          case "/": e.preventDefault(); /* focus search handled per-tab */ return;
          case "n": case "N": onNewItem(); return;
          case "Escape": /* close modals handled by individual components */ return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNav, onPalette, onNewItem]);
}
