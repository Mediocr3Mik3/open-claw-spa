/**
 * openclaw-spa — Agents Management View
 *
 * Fleet list with status indicators, agent details panel,
 * brain file sidebar, and agent creation wizard modal.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Input, Sec, Empty, Modal, AuthBadge, SubTabs, LEVEL } from "./shared";
import type { AgentConfig, KeyInfo } from "./shared";

// ─── Agent Create Modal ──────────────────────────────────────────────────

function AgentCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: AgentConfig) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [level, setLevel] = useState("elevated");
  const [modelId, setModelId] = useState("");
  const [modelProvider, setModelProvider] = useState("");
  const [models, setModels] = useState<any[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [allGates, setAllGates] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      window.spa.models.all().then((m: any) => setModels(m)).catch(() => {});
      window.spa.gates.list().then((g: any) => setAllGates(g)).catch(() => {});
    }
  }, [open]);

  const toggleTool = (t: string) => setTools(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]);

  const create = () => {
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
    onCreated(agent);
    setStep(0); setName(""); setDesc(""); setLevel("elevated"); setModelId(""); setTools([]);
    onClose();
  };

  const labels = ["Identity", "Model", "Tools", "Review"];

  return (
    <Modal open={open} onClose={onClose} title="New Agent" width={520}>
      {/* Step indicator */}
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 24 }}>
        {labels.map((l, i) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, background: i <= step ? C.grad : "rgba(255,255,255,0.03)", color: i <= step ? "#fff" : C.muted, border: i > step ? `1px solid ${C.border}` : "none" }}>{i + 1}</div>
            {i < 3 && <div style={{ width: 28, height: 1, background: i < step ? C.accent : C.border }} />}
          </div>
        ))}
      </div>

      {/* Step 0: Identity */}
      {step === 0 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Agent Name</label>
          <Input value={name} onChange={setName} placeholder="e.g. research-agent" style={{ marginBottom: 14 }} />
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Description (optional)</label>
          <Input value={desc} onChange={setDesc} placeholder="What does this agent do?" style={{ marginBottom: 14 }} />
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Authorization Level</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {(["standard", "elevated", "admin"] as const).map(l => (
              <button key={l} onClick={() => setLevel(l)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: level === l ? `1px solid ${LEVEL[l]}` : `1px solid ${C.border}`, background: level === l ? (l === "admin" ? C.errSoft : l === "elevated" ? C.warnSoft : C.accentSoft) : "transparent", color: level === l ? LEVEL[l] : C.dim, fontWeight: 600, fontSize: 12, textTransform: "capitalize" as const }}>{l}</button>
            ))}
          </div>
          <Btn onClick={() => setStep(1)} disabled={!name.trim()} style={{ width: "100%" }}>Next</Btn>
        </div>
      )}

      {/* Step 1: Model */}
      {step === 1 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 8 }}>Select Model (optional)</label>
          <div style={{ maxHeight: 260, overflowY: "auto" as const, marginBottom: 16 }}>
            {models.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center" as const, color: C.muted, fontSize: 12 }}>No models available. Configure providers in Settings.</div>
            ) : models.map((m: any) => (
              <div key={m.id} onClick={() => { setModelId(m.id); setModelProvider(m.provider_id); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer", background: modelId === m.id ? C.accentSoft : "transparent", border: modelId === m.id ? `1px solid ${C.borderAccent}` : `1px solid transparent` }}>
                <Dot color={modelId === m.id ? C.accent : C.muted} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label ?? m.id}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{m.provider_id}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(0)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={() => setStep(2)} style={{ flex: 1 }}>Next</Btn>
          </div>
        </div>
      )}

      {/* Step 2: Tools */}
      {step === 2 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 8 }}>Allowed Tools (from gate registry)</label>
          <div style={{ maxHeight: 260, overflowY: "auto" as const, marginBottom: 16 }}>
            {allGates.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center" as const, color: C.muted, fontSize: 12 }}>No gates defined. All tools will be available.</div>
            ) : allGates.map((g: any) => (
              <div key={g.tool} onClick={() => toggleTool(g.tool)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer", background: tools.includes(g.tool) ? C.accentSoft : "transparent", border: tools.includes(g.tool) ? `1px solid ${C.borderAccent}` : `1px solid transparent` }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${tools.includes(g.tool) ? C.accent : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.accent, background: tools.includes(g.tool) ? C.accentSoft : "transparent" }}>{tools.includes(g.tool) ? "&#10003;" : ""}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontFamily: "'SF Mono', monospace" }}>{g.tool}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{g.description ?? ""}</div>
                </div>
                <AuthBadge level={g.required_level} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(1)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={() => setStep(3)} style={{ flex: 1 }}>Next</Btn>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div style={{ animation: "fadeIn .2s ease" }}>
          <div style={{ background: C.bg, padding: 16, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 20 }}>
            {[
              { l: "Name", v: name },
              { l: "Description", v: desc || "—" },
              { l: "Auth Level", v: level },
              { l: "Model", v: modelId || "Default" },
              { l: "Provider", v: modelProvider || "—" },
              { l: "Tools", v: tools.length ? tools.join(", ") : "All available" },
            ].map(r => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <span style={{ color: C.dim }}>{r.l}</span>
                <span style={{ color: C.text, maxWidth: 280, textAlign: "right" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{r.v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={() => setStep(2)} style={{ flex: 1 }}>Back</Btn>
            <Btn onClick={create} style={{ flex: 1 }}>Create Agent</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Main Agents View ────────────────────────────────────────────────────

export default function AgentsView() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selAgent, setSelAgent] = useState<AgentConfig | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Agents are stored in encrypted config for now
  useEffect(() => {
    window.spa.config.get("agents").then(raw => {
      if (raw) try { setAgents(JSON.parse(raw)); } catch {}
    }).catch(() => {});
  }, []);

  const persist = async (list: AgentConfig[]) => {
    setAgents(list);
    await window.spa.config.set("agents", JSON.stringify(list));
  };

  const filtered = agents.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const deleteAgent = async (id: string) => {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    const next = agents.filter(a => a.id !== id);
    await persist(next);
    if (selAgent?.id === id) setSelAgent(null);
  };

  return (
    <div style={{ display: "flex", flex: 1, animation: "fadeIn .2s ease" }}>
      {/* Fleet List */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" as const, background: C.surface }}>
        <div style={{ padding: "16px 16px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Agents</h2>
            <Btn onClick={() => setCreateOpen(true)} style={{ padding: "4px 12px", fontSize: 11 }}>+ New</Btn>
          </div>
          <Input value={search} onChange={setSearch} placeholder="Search..." style={{ fontSize: 12, padding: "7px 10px" }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto" as const, padding: "0 8px 8px" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" as const }}>
              <div style={{ fontSize: 28, opacity: .3, marginBottom: 8 }}>&#129302;</div>
              <div style={{ fontSize: 12, color: C.dim }}>{agents.length === 0 ? "No agents yet" : "No match"}</div>
            </div>
          ) : filtered.map(a => (
            <div key={a.id} onClick={() => setSelAgent(a)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, marginBottom: 4, cursor: "pointer", background: selAgent?.id === a.id ? C.accentSoft : "transparent", border: selAgent?.id === a.id ? `1px solid ${C.borderAccent}` : "1px solid transparent", transition: "all .1s" }}>
              <Dot color={a.status === "online" ? C.ok : a.status === "error" ? C.err : C.muted} pulse={a.status === "online"} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{a.name}</div>
                <div style={{ fontSize: 10, color: C.dim, display: "flex", gap: 4, alignItems: "center" }}>
                  {a.model_id && <span>{a.model_id}</span>}
                  {!a.model_id && <span>No model</span>}
                </div>
              </div>
              <AuthBadge level={a.auth_level} />
            </div>
          ))}
        </div>
      </div>

      {/* Details Panel */}
      <div style={{ flex: 1, overflowY: "auto" as const }}>
        {selAgent ? (
          <div style={{ padding: 28, animation: "slideIn .2s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: selAgent.status === "online" ? C.okSoft : C.raised, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>&#129302;</div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{selAgent.name}</h2>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Dot color={selAgent.status === "online" ? C.ok : selAgent.status === "error" ? C.err : C.muted} />
                    <span style={{ fontSize: 12, color: C.dim, textTransform: "capitalize" as const }}>{selAgent.status}</span>
                    <AuthBadge level={selAgent.auth_level} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn v="d" onClick={() => deleteAgent(selAgent.id)} style={{ padding: "6px 14px", fontSize: 11 }}>Delete</Btn>
              </div>
            </div>

            {selAgent.description && <p style={{ fontSize: 13, color: C.dim, marginBottom: 18, lineHeight: 1.5 }}>{selAgent.description}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
              <Card>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>Model</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{selAgent.model_id ?? "Default"}</div>
                {selAgent.model_provider && <div style={{ fontSize: 11, color: C.dim }}>{selAgent.model_provider}</div>}
              </Card>
              <Card>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>Created</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(selAgent.created_at).toLocaleDateString()}</div>
                {selAgent.last_active && <div style={{ fontSize: 11, color: C.dim }}>Last active: {new Date(selAgent.last_active).toLocaleString()}</div>}
              </Card>
            </div>

            {/* Tools */}
            {selAgent.tools && selAgent.tools.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <Sec>Allowed Tools</Sec>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {selAgent.tools.map(t => (
                    <div key={t} style={{ ...glass(1), padding: "6px 12px", fontSize: 11, fontFamily: "'SF Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: C.dim }}>&#128274;</span>{t}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Brain Files placeholder */}
            <Sec>Brain Files</Sec>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
              {["SOUL.md", "IDENTITY.md", "TOOLS.md", "MEMORY.md"].map(f => (
                <div key={f} style={{ ...glass(1), padding: 14, cursor: "pointer", textAlign: "center" as const }}>
                  <div style={{ fontSize: 22, opacity: .3, marginBottom: 6 }}>&#128196;</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{f}</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Click to edit</div>
                </div>
              ))}
            </div>
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
