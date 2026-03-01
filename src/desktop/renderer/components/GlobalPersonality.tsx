/**
 * openclaw-spa — Global Personality / Context Definition
 *
 * Toggleable panel where users define their personal context, core vision,
 * and operating style. This context is injected into every agent interaction
 * when enabled, giving agents a shared understanding of the user.
 *
 * Design: Clean, calm, minimal. A single card with a toggle, two text areas,
 * and a save button. No clutter.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Btn, Sec, Card, Spinner } from "./shared";

interface GlobalPersonalityProps {
  /** Whether shown inline (settings tab) or standalone */
  inline?: boolean;
}

export default function GlobalPersonality({ inline }: GlobalPersonalityProps) {
  const [enabled, setEnabled] = useState(false);
  const [context, setContext] = useState("");
  const [vision, setVision] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.spa.personality.get().then((data) => {
      if (data) {
        setEnabled(data.enabled);
        setContext(data.context);
        setVision(data.vision);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await window.spa.personality.set({ context, vision, enabled });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ padding: inline ? 0 : 24, display: "flex", justifyContent: "center", paddingTop: 40 }}>
        <Spinner size={18} />
      </div>
    );
  }

  return (
    <div style={{ padding: inline ? 0 : 24, animation: "fadeIn .2s ease", maxWidth: 640 }}>
      {!inline && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Global Personality</h2>
          <p style={{ fontSize: 12, color: C.dim, marginBottom: 20, lineHeight: 1.6 }}>
            Define who you are and what drives you. When enabled, every agent inherits this context — giving them a deeper understanding of your goals, style, and priorities.
          </p>
        </>
      )}

      {/* Enable toggle */}
      <div
        onClick={() => setEnabled(!enabled)}
        style={{
          ...glass(1), padding: "14px 18px", borderRadius: C.rs, marginBottom: 20, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 14, transition: "all .15s",
          border: enabled ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`,
        }}
      >
        <div style={{
          width: 40, height: 22, borderRadius: 11, padding: 2, transition: "background .2s",
          background: enabled ? C.accent : "rgba(255,255,255,0.06)", flexShrink: 0,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transition: "transform .2s", transform: enabled ? "translateX(18px)" : "translateX(0)",
          }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            {enabled ? "Active" : "Inactive"} — Global context shared with all agents
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {enabled ? "Agents will use your personality context in every conversation" : "Turn on to let agents understand your context and goals"}
          </div>
        </div>
      </div>

      {/* Context */}
      <div style={{ marginBottom: 18, opacity: enabled ? 1 : 0.5, transition: "opacity .2s", pointerEvents: enabled ? "auto" : "none" }}>
        <Sec>Your Context</Sec>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 8, lineHeight: 1.5 }}>
          Who are you? What do you do? What are your daily responsibilities, expertise areas, and working style?
        </p>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="e.g. I'm a startup founder building AI tools. I manage a team of 8 engineers, handle product strategy, and write code daily. I prefer concise communication and data-driven decisions..."
          rows={5}
          style={{
            width: "100%", padding: "12px 16px", background: C.bg,
            border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs,
            fontSize: 13, outline: "none", resize: "vertical" as const,
            lineHeight: 1.7, fontFamily: C.font, transition: "border-color .15s",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
        />
      </div>

      {/* Vision */}
      <div style={{ marginBottom: 20, opacity: enabled ? 1 : 0.5, transition: "opacity .2s", pointerEvents: enabled ? "auto" : "none" }}>
        <Sec>Core Vision & Purpose</Sec>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 8, lineHeight: 1.5 }}>
          What are you building toward? What&apos;s the north star that guides your decisions?
        </p>
        <textarea
          value={vision}
          onChange={e => setVision(e.target.value)}
          placeholder="e.g. Build the most intuitive AI assistant platform that empowers individuals to accomplish 10x more while maintaining full control over their data and privacy..."
          rows={4}
          style={{
            width: "100%", padding: "12px 16px", background: C.bg,
            border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs,
            fontSize: 13, outline: "none", resize: "vertical" as const,
            lineHeight: 1.7, fontFamily: C.font, transition: "border-color .15s",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
        />
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Btn onClick={save} disabled={saving} style={{ padding: "10px 28px" }}>
          {saving ? "Saving..." : "Save"}
        </Btn>
        {saved && (
          <span style={{ fontSize: 12, color: C.ok, animation: "fadeIn .15s ease" }}>
            &#10003; Saved
          </span>
        )}
      </div>
    </div>
  );
}
