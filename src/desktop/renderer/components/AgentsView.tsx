/**
 * openclaw-spa — Agents Management View
 *
 * Fleet list with status indicators, agent details panel,
 * brain file sidebar, and agent creation wizard modal.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Input, Sec, Empty, Modal, AuthBadge, SubTabs, LEVEL } from "./shared";
import type { AgentConfig, KeyInfo } from "./shared";
import VoiceRecorder from "./VoiceRecorder";

// ─── Agent Create Modal ──────────────────────────────────────────────────

/* ─── Personality presets for quick agent archetype selection ────────── */
const ARCHETYPES = [
  { id: "assistant", icon: "&#128161;", label: "Personal Assistant", desc: "General-purpose helper for daily tasks, scheduling, and research", personality: "helpful, organized, proactive", jobs: ["scheduling", "research", "email drafts", "reminders"] },
  { id: "coder", icon: "&#128187;", label: "Developer Partner", desc: "Code reviews, debugging, architecture, and technical writing", personality: "precise, analytical, thorough", jobs: ["code_review", "debugging", "documentation", "testing"] },
  { id: "researcher", icon: "&#128218;", label: "Deep Researcher", desc: "In-depth analysis, literature review, and synthesis", personality: "curious, methodical, detail-oriented", jobs: ["research", "analysis", "summarization", "fact_checking"] },
  { id: "creative", icon: "&#127912;", label: "Creative Director", desc: "Writing, brainstorming, ideation, and content creation", personality: "imaginative, expressive, bold", jobs: ["writing", "brainstorming", "content_creation", "storytelling"] },
  { id: "ops", icon: "&#9881;", label: "DevOps / SysAdmin", desc: "Infrastructure, deployment, monitoring, and automation", personality: "cautious, systematic, reliable", jobs: ["deployment", "monitoring", "automation", "troubleshooting"] },
  { id: "custom", icon: "&#10024;", label: "Custom", desc: "Define everything from scratch", personality: "", jobs: [] },
];

/* ─── Conversational personality questions ─────────────────────────── */
const PERSONALITY_QUESTIONS = [
  { id: "tone", q: "How should this agent communicate?", options: [
    { label: "Professional", val: "professional, clear, and concise" },
    { label: "Friendly", val: "warm, approachable, and conversational" },
    { label: "Direct", val: "blunt, efficient, no fluff" },
    { label: "Thoughtful", val: "considered, nuanced, explores tradeoffs" },
  ]},
  { id: "initiative", q: "How proactive should it be?", options: [
    { label: "Ask first", val: "always asks before acting" },
    { label: "Suggest & act", val: "suggests actions and proceeds if logical" },
    { label: "Autonomous", val: "acts independently, reports results" },
  ]},
  { id: "depth", q: "How detailed should responses be?", options: [
    { label: "Brief", val: "short, to the point" },
    { label: "Balanced", val: "moderate detail, key points highlighted" },
    { label: "Thorough", val: "comprehensive, covers edge cases" },
  ]},
];

function AgentCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: AgentConfig) => void }) {
  const [step, setStep] = useState(0);
  // Step 0: Archetype
  const [archetype, setArchetype] = useState<string | null>(null);
  // Step 1: Identity
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  // Step 2: Personality
  const [personality, setPersonality] = useState<Record<string, string>>({});
  const [customPersonality, setCustomPersonality] = useState("");
  // Step 3: Jobs & Context
  const [userJobs, setUserJobs] = useState("");
  const [agentJobs, setAgentJobs] = useState<string[]>([]);
  const [customJob, setCustomJob] = useState("");
  // Step 4: Model & Auth
  const [level, setLevel] = useState("elevated");
  const [modelId, setModelId] = useState("");
  const [modelProvider, setModelProvider] = useState("");
  const [models, setModels] = useState<any[]>([]);
  // Step 5: Learning & Review
  const [learningEnabled, setLearningEnabled] = useState(true);
  const [allGates, setAllGates] = useState<any[]>([]);
  const [tools, setTools] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      window.spa.models.all().then((m: any) => setModels(m)).catch(() => {});
      window.spa.gates.list().then((g: any) => setAllGates(g)).catch(() => {});
    }
  }, [open]);

  const selectArchetype = (id: string) => {
    const a = ARCHETYPES.find(x => x.id === id);
    setArchetype(id);
    if (a && id !== "custom") {
      setDesc(a.desc);
      setAgentJobs(a.jobs);
      setCustomPersonality(a.personality);
    }
  };

  const toggleJob = (j: string) => setAgentJobs(js => js.includes(j) ? js.filter(x => x !== j) : [...js, j]);
  const addCustomJob = () => { if (customJob.trim()) { setAgentJobs(j => [...j, customJob.trim()]); setCustomJob(""); } };
  const toggleTool = (t: string) => setTools(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]);

  const buildSoulContent = () => {
    const lines = [`# ${name.trim()}`, ""];
    if (desc) lines.push(desc, "");
    const traits = Object.values(personality).filter(Boolean);
    if (customPersonality) traits.push(customPersonality);
    if (traits.length) { lines.push("## Personality", traits.join(". ") + ".", ""); }
    if (agentJobs.length) { lines.push("## Primary Jobs", agentJobs.map(j => `- ${j}`).join("\n"), ""); }
    if (userJobs.trim()) { lines.push("## User Context", userJobs.trim(), ""); }
    return lines.join("\n");
  };

  const create = async () => {
    const agent: AgentConfig = {
      id: `agent-${Date.now().toString(36)}`,
      name: name.trim(),
      description: desc.trim() || undefined,
      auth_level: level,
      model_id: modelId || undefined,
      model_provider: modelProvider || undefined,
      status: "offline",
      created_at: new Date().toISOString(),
      tools: tools.length ? tools : undefined,
    };
    // Save SOUL.md brain file with personality + job context
    const soul = buildSoulContent();
    await window.spa.config.set(`brain_${agent.id}_SOUL.md`, soul).catch(() => {});
    // Save learning preference
    await window.spa.learning.setEnabled(agent.id, learningEnabled).catch(() => {});
    onCreated(agent);
    // Reset
    setStep(0); setArchetype(null); setName(""); setDesc(""); setPersonality({});
    setCustomPersonality(""); setUserJobs(""); setAgentJobs([]); setLevel("elevated");
    setModelId(""); setModelProvider(""); setTools([]); setLearningEnabled(true);
    onClose();
  };

  const labels = ["Archetype", "Identity", "Personality", "Jobs", "Model", "Review"];
  const canProceed = [
    !!archetype,                     // step 0
    !!name.trim(),                   // step 1
    true,                            // step 2 (personality optional)
    true,                            // step 3 (jobs optional)
    true,                            // step 4 (model optional)
    true,                            // step 5 (review)
  ];

  return (
    <Modal open={open} onClose={onClose} title="Create Agent" width={560}>
      {/* Step indicator — minimal dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 3, marginBottom: 22 }}>
        {labels.map((l, i) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div
              onClick={() => { if (i < step) setStep(i); }}
              style={{
                width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 10, fontWeight: 600, cursor: i < step ? "pointer" : "default",
                background: i <= step ? C.grad : "rgba(255,255,255,0.03)",
                color: i <= step ? "#fff" : C.muted,
                border: i > step ? `1px solid ${C.border}` : "none",
                transition: "all .2s",
              }}
            >{i + 1}</div>
            {i < labels.length - 1 && <div style={{ width: 20, height: 1, background: i < step ? C.accent : C.border, transition: "background .2s" }} />}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: C.muted, textAlign: "center" as const, marginBottom: 16, letterSpacing: 1, textTransform: "uppercase" as const }}>{labels[step]}</div>

      {/* Step 0: Archetype Selection */}
      {step === 0 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 16, lineHeight: 1.6 }}>
            What kind of agent would you like to create? Pick a starting point — you can customize everything.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
            {ARCHETYPES.map(a => (
              <div key={a.id} onClick={() => selectArchetype(a.id)} style={{
                ...glass(1), padding: "14px 16px", cursor: "pointer", borderRadius: C.rs,
                border: archetype === a.id ? `1px solid ${C.borderAccent}` : `1px solid transparent`,
                background: archetype === a.id ? C.accentSoft : undefined,
                transition: "all .12s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span dangerouslySetInnerHTML={{ __html: a.icon }} style={{ fontSize: 16 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: archetype === a.id ? C.accent : C.text }}>{a.label}</span>
                </div>
                <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            ))}
          </div>
          <Btn onClick={() => setStep(1)} disabled={!archetype} style={{ width: "100%" }}>Continue</Btn>
        </div>
      )}

      {/* Step 1: Identity */}
      {step === 1 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 16, lineHeight: 1.6 }}>
            Give your agent a name and describe what it does in your words.
          </p>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Agent Name</label>
          <Input value={name} onChange={setName} placeholder="e.g. Atlas, Scout, Archie..." style={{ marginBottom: 14 }} />
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>What does this agent do?</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the agent's purpose in a sentence or two..."
            rows={3} style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 13, outline: "none", resize: "vertical" as const, lineHeight: 1.6, fontFamily: C.font, marginBottom: 18 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(0)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={() => setStep(2)} disabled={!name.trim()} style={{ flex: 1 }}>Continue</Btn>
          </div>
        </div>
      )}

      {/* Step 2: Personality — Conversational Questions */}
      {step === 2 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 16, lineHeight: 1.6 }}>
            Shape your agent's personality. These choices define how it thinks and communicates.
          </p>
          {PERSONALITY_QUESTIONS.map(pq => (
            <div key={pq.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: C.text }}>{pq.q}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {pq.options.map(o => (
                  <button key={o.label} onClick={() => setPersonality(p => ({ ...p, [pq.id]: o.val }))}
                    style={{
                      padding: "8px 16px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      border: personality[pq.id] === o.val ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                      background: personality[pq.id] === o.val ? C.accentSoft : "transparent",
                      color: personality[pq.id] === o.val ? C.accent : C.dim,
                      transition: "all .12s",
                    }}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Custom traits (optional)</label>
          <Input value={customPersonality} onChange={setCustomPersonality} placeholder="e.g. witty, security-conscious, concise..." style={{ marginBottom: 18 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(1)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={() => setStep(3)} style={{ flex: 1 }}>Continue</Btn>
          </div>
        </div>
      )}

      {/* Step 3: Jobs & User Context */}
      {step === 3 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            What should this agent help you with? Select suggested jobs or add your own.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 14 }}>
            {["research", "writing", "code_review", "scheduling", "email_drafts", "data_analysis", "brainstorming", "debugging", "summarization", "automation", "monitoring", "content_creation"].map(j => (
              <button key={j} onClick={() => toggleJob(j)} style={{
                padding: "6px 14px", borderRadius: 16, fontSize: 10, fontWeight: 600,
                border: agentJobs.includes(j) ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                background: agentJobs.includes(j) ? C.accentSoft : "transparent",
                color: agentJobs.includes(j) ? C.accent : C.dim,
              }}>{j.replace(/_/g, " ")}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            <Input value={customJob} onChange={setCustomJob} placeholder="Add a custom job..." onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") addCustomJob(); }} style={{ flex: 1, fontSize: 11 }} />
            <Btn v="g" onClick={addCustomJob} style={{ padding: "6px 12px", fontSize: 11 }}>Add</Btn>
          </div>

          <div style={{ ...glass(0), padding: 14, borderRadius: C.rs, marginBottom: 18, borderLeft: `3px solid ${C.accent}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.accent, marginBottom: 6 }}>Help your agent understand you</div>
            <p style={{ fontSize: 11, color: C.dim, marginBottom: 8, lineHeight: 1.5 }}>
              Describe what you do day-to-day so the agent can find ways to help. This is optional and stays on your device.
            </p>
            <textarea value={userJobs} onChange={e => setUserJobs(e.target.value)}
              placeholder="e.g. I'm a software architect. I review PRs, write specs, attend design meetings, and manage a team of 5..."
              rows={3} style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 12, outline: "none", resize: "vertical" as const, lineHeight: 1.6, fontFamily: C.font }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(2)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={() => setStep(4)} style={{ flex: 1 }}>Continue</Btn>
          </div>
        </div>
      )}

      {/* Step 4: Model & Auth */}
      {step === 4 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Authorization Level</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["standard", "elevated", "admin"] as const).map(l => (
              <button key={l} onClick={() => setLevel(l)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: level === l ? `1px solid ${LEVEL[l]}` : `1px solid ${C.border}`, background: level === l ? (l === "admin" ? C.errSoft : l === "elevated" ? C.warnSoft : C.accentSoft) : "transparent", color: level === l ? LEVEL[l] : C.dim, fontWeight: 600, fontSize: 12, textTransform: "capitalize" as const, transition: "all .12s" }}>{l}</button>
            ))}
          </div>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 6 }}>Model (optional)</label>
          <div style={{ maxHeight: 180, overflowY: "auto" as const, marginBottom: 14 }}>
            {models.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center" as const, color: C.muted, fontSize: 11 }}>No models configured yet. You can set this later in Settings.</div>
            ) : models.map((m: any) => (
              <div key={m.id} onClick={() => { setModelId(m.id); setModelProvider(m.provider_id); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: C.rs, marginBottom: 3, cursor: "pointer", background: modelId === m.id ? C.accentSoft : "transparent", border: modelId === m.id ? `1px solid ${C.borderAccent}` : `1px solid transparent`, transition: "all .1s" }}>
                <Dot color={modelId === m.id ? C.accent : C.muted} size={6} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label ?? m.id}</div>
                  <div style={{ fontSize: 9, color: C.dim }}>{m.provider_id}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(3)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={() => setStep(5)} style={{ flex: 1 }}>Review</Btn>
          </div>
        </div>
      )}

      {/* Step 5: Review & Learning Toggle */}
      {step === 5 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <div style={{ background: C.bg, padding: 16, borderRadius: C.r, border: `1px solid ${C.border}`, marginBottom: 14 }}>
            {[
              { l: "Name", v: name },
              { l: "Archetype", v: ARCHETYPES.find(a => a.id === archetype)?.label ?? "Custom" },
              { l: "Auth Level", v: level },
              { l: "Model", v: modelId || "Default" },
              { l: "Jobs", v: agentJobs.length ? agentJobs.join(", ") : "General" },
              { l: "Personality", v: Object.values(personality).filter(Boolean).join("; ") || customPersonality || "Default" },
            ].map(r => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <span style={{ color: C.dim }}>{r.l}</span>
                <span style={{ color: C.text, maxWidth: 280, textAlign: "right" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.v}</span>
              </div>
            ))}
          </div>

          {/* Learning toggle */}
          <div onClick={() => setLearningEnabled(!learningEnabled)} style={{
            ...glass(1), padding: "12px 16px", borderRadius: C.rs, marginBottom: 18, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12, transition: "all .12s",
            border: learningEnabled ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`,
          }}>
            <div style={{
              width: 36, height: 20, borderRadius: 10, padding: 2, transition: "background .2s",
              background: learningEnabled ? C.accent : "rgba(255,255,255,0.06)",
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                transition: "transform .2s", transform: learningEnabled ? "translateX(16px)" : "translateX(0)",
              }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Learn from interactions</div>
              <div style={{ fontSize: 10, color: C.dim }}>Agent will observe patterns and offer suggestions over time</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(4)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={create} style={{ flex: 1 }}>Create Agent</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Brain File Editor ───────────────────────────────────────────────────

function BrainFileEditor({ agentId, fileName, onClose }: { agentId: string; fileName: string; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.spa.config.get(`brain_${agentId}_${fileName}`).then((raw: string | null) => {
      setContent(raw ?? `# ${fileName.replace(".md", "")}\n\nDefine this agent's ${fileName.replace(".md", "").toLowerCase()} here.\n`);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [agentId, fileName]);

  const save = async () => {
    setSaving(true);
    await window.spa.config.set(`brain_${agentId}_${fileName}`, content);
    setSaving(false);
  };

  return (
    <div style={{ animation: "fadeIn .15s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, opacity: .4 }}>&#128196;</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{fileName}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={save} disabled={saving} style={{ padding: "5px 14px", fontSize: 11 }}>{saving ? "Saving..." : "Save"}</Btn>
          <Btn v="g" onClick={onClose} style={{ padding: "5px 14px", fontSize: 11 }}>Close</Btn>
        </div>
      </div>
      {loaded ? (
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={16}
          style={{ width: "100%", padding: "14px 16px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 13, fontFamily: C.mono, outline: "none", resize: "vertical" as const, lineHeight: 1.7 }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent; }} onBlur={e => { e.currentTarget.style.borderColor = C.border; }} />
      ) : <div style={{ padding: 20, textAlign: "center" as const, color: C.dim, fontSize: 11 }}>Loading...</div>}
    </div>
  );
}

// ─── Quick Chat Panel ────────────────────────────────────────────────────

function QuickChat({ agent }: { agent: AgentConfig }) {
  const [msgs, setMsgs] = useState<{ id: number; text: string; sender: string; ts: string }[]>([]);
  const [input, setInput] = useState("");
  const end = React.useRef<HTMLDivElement>(null);
  const mc = React.useRef(0);

  React.useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim(); setInput("");
    mc.current++;
    setMsgs(p => [...p, { id: mc.current, text, sender: "user", ts: new Date().toISOString() }]);
    try {
      await window.spa.sendMessage({ text });
    } catch {}
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, height: 320, animation: "fadeIn .15s ease" }}>
      <div style={{ flex: 1, overflowY: "auto" as const, padding: "8px 0", display: "flex", flexDirection: "column" as const, gap: 6 }}>
        {msgs.length === 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: .3 }}>
            <div style={{ textAlign: "center" as const, fontSize: 12, color: C.dim }}>Send a message to {agent.name}</div>
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} style={{ alignSelf: m.sender === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <div style={{ padding: "8px 14px", borderRadius: m.sender === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: m.sender === "user" ? C.accentSoft : C.raised, border: `1px solid ${m.sender === "user" ? C.borderAccent : C.border}`, fontSize: 13, lineHeight: 1.5 }}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div style={{ display: "flex", gap: 6, paddingTop: 8, borderTop: `1px solid ${C.border}`, alignItems: "center" }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={`Message ${agent.name}...`}
          style={{ flex: 1, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 13, outline: "none" }}
          onFocus={e => { e.currentTarget.style.borderColor = C.accent; }} onBlur={e => { e.currentTarget.style.borderColor = C.border; }} />
        <VoiceRecorder compact onTranscription={(text) => setInput(text)} />
        <Btn onClick={send} style={{ padding: "8px 16px", fontSize: 12 }}>Send</Btn>
      </div>
    </div>
  );
}

// ─── Main Agents View ────────────────────────────────────────────────────

export default function AgentsView({ onNav, onOpenChat }: { onNav?: (v: any, sub?: string) => void; onOpenChat?: (agentId: string) => void }) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selAgent, setSelAgent] = useState<AgentConfig | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [detailTab, setDetailTab] = useState<"info" | "chat" | "brain">("info");
  const [editingFile, setEditingFile] = useState<string | null>(null);

  useEffect(() => {
    window.spa.config.get("agents").then(raw => {
      if (raw) try { setAgents(JSON.parse(raw)); } catch {}
    }).catch(() => {});
  }, []);

  const persist = async (list: AgentConfig[]) => {
    setAgents(list);
    await window.spa.config.set("agents", JSON.stringify(list));
  };

  const filtered = agents.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  const deleteAgent = async (id: string) => {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    const next = agents.filter(a => a.id !== id);
    await persist(next);
    if (selAgent?.id === id) setSelAgent(null);
  };

  const BRAIN_FILES = ["SOUL.md", "IDENTITY.md", "TOOLS.md", "MEMORY.md"];

  return (
    <div style={{ display: "flex", flex: 1, animation: "fadeIn .2s ease" }}>
      {/* Fleet List */}
      <div style={{ width: 260, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" as const, background: C.surface, flexShrink: 0 }}>
        <div style={{ padding: "14px 14px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Agents</h2>
            <Btn onClick={() => setCreateOpen(true)} style={{ padding: "4px 12px", fontSize: 10 }}>+ New</Btn>
          </div>
          <Input value={search} onChange={setSearch} placeholder="Search..." style={{ fontSize: 11, padding: "6px 10px" }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto" as const, padding: "0 6px 6px" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "28px 14px", textAlign: "center" as const }}>
              <div style={{ fontSize: 24, opacity: .3, marginBottom: 6 }}>&#129302;</div>
              <div style={{ fontSize: 11, color: C.dim }}>{agents.length === 0 ? "No agents yet" : "No match"}</div>
            </div>
          ) : filtered.map(a => (
            <div key={a.id} onClick={() => { setSelAgent(a); setDetailTab("info"); setEditingFile(null); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: C.rs, marginBottom: 3, cursor: "pointer", background: selAgent?.id === a.id ? C.accentSoft : "transparent", border: selAgent?.id === a.id ? `1px solid ${C.borderAccent}` : "1px solid transparent", transition: "all .12s" }}>
              <Dot color={a.status === "online" ? C.ok : a.status === "error" ? C.err : C.muted} pulse={a.status === "online"} size={7} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{a.name}</div>
                <div style={{ fontSize: 9, color: C.dim }}>{a.model_id || "No model"}</div>
              </div>
              <AuthBadge level={a.auth_level} />
            </div>
          ))}
        </div>
      </div>

      {/* Details Panel */}
      <div style={{ flex: 1, overflowY: "auto" as const }}>
        {selAgent ? (
          <div style={{ padding: "18px 24px 24px", animation: "slideIn .2s ease" }}>
            {/* Agent Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: selAgent.status === "online" ? C.okSoft : C.raised, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>&#129302;</div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 1 }}>{selAgent.name}</h2>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <Dot color={selAgent.status === "online" ? C.ok : selAgent.status === "error" ? C.err : C.muted} size={6} />
                    <span style={{ fontSize: 11, color: C.dim, textTransform: "capitalize" as const }}>{selAgent.status}</span>
                    <AuthBadge level={selAgent.auth_level} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {onOpenChat && <Btn onClick={() => onOpenChat(selAgent.id)} style={{ padding: "5px 12px", fontSize: 11 }}>Full Chat &#8594;</Btn>}
                <Btn v="d" onClick={() => deleteAgent(selAgent.id)} style={{ padding: "5px 12px", fontSize: 11 }}>Delete</Btn>
              </div>
            </div>

            {selAgent.description && <p style={{ fontSize: 12, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>{selAgent.description}</p>}

            {/* Detail Tabs */}
            <div style={{ display: "flex", gap: 2, marginBottom: 16, background: C.surface, borderRadius: C.rs, padding: 3, border: `1px solid ${C.border}`, width: "fit-content" }}>
              {([{ id: "info", label: "Details" }, { id: "chat", label: "Quick Chat" }, { id: "brain", label: "Brain Files" }] as const).map(t => (
                <button key={t.id} onClick={() => { setDetailTab(t.id); setEditingFile(null); }}
                  style={{ padding: "6px 14px", borderRadius: 5, border: "none", background: detailTab === t.id ? C.accentSoft : "transparent", color: detailTab === t.id ? C.accent : C.dim, fontSize: 11, fontWeight: 600, transition: "all .1s" }}>{t.label}</button>
              ))}
            </div>

            {/* Info Tab */}
            {detailTab === "info" && (
              <div style={{ animation: "fadeIn .15s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                  <Card>
                    <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 3 }}>Model</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{selAgent.model_id ?? "Default"}</div>
                    {selAgent.model_provider && <div style={{ fontSize: 10, color: C.dim }}>{selAgent.model_provider}</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 3 }}>Created</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{new Date(selAgent.created_at).toLocaleDateString()}</div>
                    {selAgent.last_active && <div style={{ fontSize: 10, color: C.dim }}>Active: {new Date(selAgent.last_active).toLocaleString()}</div>}
                  </Card>
                </div>

                {selAgent.tools && selAgent.tools.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <Sec>Allowed Tools</Sec>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                      {selAgent.tools.map(t => (
                        <div key={t} style={{ ...glass(1), padding: "5px 10px", fontSize: 10, fontFamily: C.mono, display: "flex", alignItems: "center", gap: 5, borderRadius: C.rx }}>
                          <span style={{ color: C.dim, fontSize: 9 }}>&#128274;</span>{t}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Chat Tab */}
            {detailTab === "chat" && <QuickChat agent={selAgent} />}

            {/* Brain Files Tab */}
            {detailTab === "brain" && (
              <div style={{ animation: "fadeIn .15s ease" }}>
                {editingFile ? (
                  <BrainFileEditor agentId={selAgent.id} fileName={editingFile} onClose={() => setEditingFile(null)} />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                    {BRAIN_FILES.map(f => (
                      <div key={f} onClick={() => setEditingFile(f)} style={{ ...glass(1), padding: 14, cursor: "pointer", textAlign: "center" as const, borderRadius: C.rs, transition: "all .1s" }}>
                        <div style={{ fontSize: 20, opacity: .3, marginBottom: 5 }}>&#128196;</div>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{f}</div>
                        <div style={{ fontSize: 9, color: C.accent, marginTop: 3 }}>Edit</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Empty icon="&#129302;" title="Select an Agent" sub="Choose an agent from the list or create a new one." action="Create Agent" onAction={() => setCreateOpen(true)} />
          </div>
        )}
      </div>

      <AgentCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={a => persist([...agents, a])} />
    </div>
  );
}
