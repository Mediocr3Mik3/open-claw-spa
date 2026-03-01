/**
 * openclaw-spa — Enhanced Chat View
 *
 * Full-width chat with session list, signature verification badges,
 * tool call expansion, thinking traces, and signature-aware composer.
 */

import React, { useState, useEffect, useRef } from "react";
import { C, glass, Dot, Pill, Btn, Input, Sec, Empty, SignatureBadge, AuthBadge, Modal, LEVEL } from "./shared";
import type { View, Message, ToolCall, KeyInfo } from "./shared";

// ─── Tool Call Expansion ─────────────────────────────────────────────────

function ToolCallBlock({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false);
  const color = tc.status === "completed" ? C.ok : tc.status === "denied" ? C.err : tc.status === "approved" ? C.accent : C.warn;
  return (
    <div style={{ ...glass(0).background ? {} : {}, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", marginTop: 6, fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <span style={{ color, fontSize: 10 }}>{open ? "&#9660;" : "&#9654;"}</span>
        <span style={{ fontFamily: "'SF Mono', monospace", fontWeight: 600, color: C.text }}>{tc.name}</span>
        {tc.auth_required && <AuthBadge level={tc.auth_required} />}
        <Pill bg={color + "18"} color={color}>{tc.status ?? "pending"}</Pill>
      </div>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          {tc.args && <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 11, color: C.dim, marginBottom: 6, whiteSpace: "pre-wrap" as const }}>{JSON.stringify(tc.args, null, 2)}</div>}
          {tc.result && <div style={{ fontSize: 11, color: C.ok, padding: "6px 8px", background: C.okSoft, borderRadius: 6 }}>{tc.result}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Thinking Trace ──────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "rgba(168,85,247,0.06)", border: `1px solid rgba(168,85,247,0.12)`, borderRadius: 8, padding: "6px 12px", marginTop: 6, fontSize: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#a855f7" }} onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 10 }}>{open ? "&#9660;" : "&#9654;"}</span>
        <span style={{ fontWeight: 600 }}>Thinking</span>
        <span style={{ fontSize: 10, color: C.dim }}>({text.length} chars)</span>
      </div>
      {open && <div style={{ marginTop: 6, color: C.dim, whiteSpace: "pre-wrap" as const, lineHeight: 1.5 }}>{text}</div>}
    </div>
  );
}

// ─── Signature Detail Modal ──────────────────────────────────────────────

function SigDetailModal({ msg, open, onClose }: { msg: Message | null; open: boolean; onClose: () => void }) {
  if (!msg) return null;
  return (
    <Modal open={open} onClose={onClose} title="Signature Details" width={420}>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SignatureBadge status={msg.signed ? "verified" : "unsigned"} />
          {msg.auth_level && <AuthBadge level={msg.auth_level} />}
        </div>
        <div style={{ ...glass(0).background ? {} : {}, background: C.surface, padding: 14, borderRadius: 10, border: `1px solid ${C.border}` }}>
          {[
            { l: "Message ID", v: String(msg.id) },
            { l: "Sender", v: msg.sender },
            { l: "Signed", v: msg.signed ? "Yes" : "No" },
            { l: "Auth Level", v: msg.auth_level ?? "standard" },
            { l: "Key ID", v: msg.key_id ?? "N/A" },
            { l: "Timestamp", v: new Date(msg.timestamp).toLocaleString() },
          ].map(r => (
            <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ color: C.dim }}>{r.l}</span>
              <span style={{ color: C.text, fontFamily: "'SF Mono', monospace", fontSize: 11 }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Chat View ──────────────────────────────────────────────────────

export default function ChatView({ msgs, input, setInput, auth, setAuth, keyId, keys, onSend, hasLLM, onNav }: {
  msgs: Message[]; input: string; setInput: (v: string) => void; auth: string; setAuth: (v: string) => void;
  keyId: string | null; keys: KeyInfo[]; onSend: () => void; hasLLM: boolean; onNav: (v: View) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const [sigMsg, setSigMsg] = useState<Message | null>(null);
  const [autoSign, setAutoSign] = useState(true);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  if (!hasLLM) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Empty icon="&#129302;" title="No LLM Connected" sub="Connect a provider or start a local runtime to begin." action="Set Up Provider" onAction={() => onNav("settings")} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, animation: "fadeIn .2s ease" }}>
      {/* Session Info Sidebar */}
      <div style={{ width: 220, borderRight: `1px solid ${C.border}`, padding: 16, display: "flex", flexDirection: "column" as const, background: C.surface }}>
        <Sec>Session</Sec>
        <div style={{ ...glass(0), padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Messages</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{msgs.length}</div>
        </div>
        <div style={{ ...glass(0), padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Signed</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ok }}>{msgs.filter(m => m.signed).length}</div>
        </div>
        <div style={{ ...glass(0), padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Active Key</div>
          <div style={{ fontSize: 11, fontFamily: "'SF Mono', monospace", color: keyId ? C.accent : C.muted, wordBreak: "break-all" as const }}>{keyId ? keyId.slice(0, 16) + "..." : "None"}</div>
        </div>

        <div style={{ flex: 1 }} />

        <Sec>Quick Auth</Sec>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
          {(["standard", "elevated", "admin"] as const).map(l => (
            <button key={l} onClick={() => setAuth(l)} style={{ padding: "8px 10px", borderRadius: 6, border: auth === l ? `1px solid ${LEVEL[l]}` : `1px solid ${C.border}`, background: auth === l ? (l === "admin" ? C.errSoft : l === "elevated" ? C.warnSoft : C.accentSoft) : "transparent", color: auth === l ? LEVEL[l] : C.dim, fontSize: 11, fontWeight: 600, textTransform: "capitalize" as const, textAlign: "left" as const, display: "flex", alignItems: "center", gap: 6 }}>
              <span dangerouslySetInnerHTML={{ __html: l === "admin" ? "&#128737;" : l === "elevated" ? "&#128273;" : "&#9675;" }} />
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" as const }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: 20, display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {msgs.length === 0 && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: .3 }}>
              <div style={{ textAlign: "center" as const }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>&#128172;</div>
                <div style={{ fontSize: 13, color: C.dim }}>Send your first signed message</div>
              </div>
            </div>
          )}
          {msgs.map(m => (
            <div key={m.id} style={{ alignSelf: m.sender === "user" ? "flex-end" : "flex-start", maxWidth: "70%", animation: "fadeIn .2s ease" }}>
              <div style={{ padding: "10px 16px", borderRadius: m.sender === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: m.sender === "user" ? "rgba(104,130,255,0.12)" : C.raised, border: `1px solid ${m.sender === "user" ? C.borderAccent : C.border}` }}>
                {/* Header: auth badge + signature + time */}
                <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center", flexWrap: "wrap" as const }}>
                  {m.auth_level && m.auth_level !== "standard" && <AuthBadge level={m.auth_level} />}
                  <SignatureBadge status={m.signed ? "signed" : "unsigned"} keyId={m.key_id} onClick={() => setSigMsg(m)} />
                  <span style={{ fontSize: 9, color: C.muted, marginLeft: "auto" }}>{new Date(m.timestamp).toLocaleTimeString()}</span>
                </div>
                {/* Message text */}
                <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>{m.text}</div>
                {/* Thinking traces */}
                {m.thinking && <ThinkingBlock text={m.thinking} />}
                {/* Tool calls */}
                {m.tool_calls?.map((tc, i) => <ToolCallBlock key={i} tc={tc} />)}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>

        {/* Composer */}
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
          {/* Signature controls bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setAutoSign(!autoSign)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 4, border: `1px solid ${autoSign ? C.borderAccent : C.border}`, background: autoSign ? C.accentSoft : "transparent", color: autoSign ? C.accent : C.dim, fontSize: 10, fontWeight: 600 }}>
              &#10003; Auto-sign
            </button>
            {keyId && (
              <span style={{ fontSize: 10, color: C.dim, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: C.accent }}>&#128273;</span>
                {keys.find(k => k.key_id === keyId)?.label ?? keyId.slice(0, 12) + "..."}
              </span>
            )}
            {auth !== "standard" && (
              <AuthBadge level={auth} />
            )}
          </div>
          {/* Input row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Type a message... (Enter to send)"
              style={{ flex: 1, padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, fontSize: 14, outline: "none" }}
              onFocus={e => { e.currentTarget.style.borderColor = C.accent; }}
              onBlur={e => { e.currentTarget.style.borderColor = C.border; }} />
            <Btn onClick={onSend} style={{ padding: "10px 22px" }}>
              {auth !== "standard" ? "Sign & Send" : "Send"}
            </Btn>
          </div>
        </div>
      </div>

      <SigDetailModal msg={sigMsg} open={!!sigMsg} onClose={() => setSigMsg(null)} />
    </div>
  );
}
