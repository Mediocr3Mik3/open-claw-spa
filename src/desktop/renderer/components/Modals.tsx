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

  return (
    <Modal open={!!approval} onClose={onClose} title="Action Requires Approval" width={480}>
      <div style={{ ...glass(0), padding: 16, marginBottom: 16, borderLeft: `3px solid ${C.warn}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>&#9888;&#65039;</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Sensitive Operation</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "6px 12px", fontSize: 12 }}>
          <span style={{ color: C.dim }}>Operation:</span>
          <span style={{ fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>{approval.operation}</span>
          <span style={{ color: C.dim }}>Command:</span>
          <span style={{ fontFamily: "'SF Mono', monospace", color: C.warn, wordBreak: "break-all" as const }}>{approval.command}</span>
          <span style={{ color: C.dim }}>Agent:</span>
          <span>{approval.agent}</span>
          <span style={{ color: C.dim }}>Required:</span>
          <span><AuthBadge level={approval.requiredLevel} /></span>
        </div>
      </div>

      {validKeys.length > 0 ? (
        <>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 6 }}>Sign with key:</label>
          <div style={{ marginBottom: 20 }}>
            {validKeys.map(k => (
              <div key={k.key_id} onClick={() => setSelKey(k.key_id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer", background: selKey === k.key_id ? C.accentSoft : "transparent", border: selKey === k.key_id ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}` }}>
                <Dot color={selKey === k.key_id ? C.accent : C.muted} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{k.label}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{k.algorithm ?? "ecdsa-p384"} &middot; {k.max_auth_level}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ ...glass(0), padding: 16, marginBottom: 20, borderLeft: `3px solid ${C.err}` }}>
          <span style={{ fontSize: 12, color: C.err }}>No keys available for {approval.requiredLevel}-level authorization. Generate an appropriate key first.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Btn v="d" onClick={onDeny} style={{ flex: 1 }}>Deny</Btn>
        <Btn onClick={() => onApprove(selKey)} disabled={!selKey} style={{ flex: 1 }}>
          {validKeys.length > 0 ? "Sign & Approve" : "No Valid Key"}
        </Btn>
      </div>
    </Modal>
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
