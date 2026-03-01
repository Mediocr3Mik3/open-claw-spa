/**
 * openclaw-spa — Gates Configuration View
 *
 * Action gate registry: summary, grouped gate list, editor modal,
 * preset templates, and import/export.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Input, Select, Sec, Empty, Modal, AuthBadge, LEVEL } from "./shared";

interface GateEntry { tool: string; required_level: string; description?: string; }

// ─── Gate Editor Modal ───────────────────────────────────────────────────

function GateEditorModal({ open, onClose, gate, onSaved }: {
  open: boolean; onClose: () => void; gate?: GateEntry | null; onSaved: () => void;
}) {
  const [tool, setTool] = useState(gate?.tool ?? "");
  const [level, setLevel] = useState(gate?.required_level ?? "elevated");
  const [desc, setDesc] = useState(gate?.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (gate) { setTool(gate.tool); setLevel(gate.required_level); setDesc(gate.description ?? ""); }
    else { setTool(""); setLevel("elevated"); setDesc(""); }
  }, [gate, open]);

  const save = async () => {
    if (!tool.trim()) return;
    setSaving(true);
    try { await window.spa.gates.set(tool.trim(), level, desc.trim()); onSaved(); onClose(); }
    catch (e) { alert(`Failed: ${e}`); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={gate ? "Edit Gate" : "Add Gate"} width={420}>
      <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Tool / Action Name</label>
      <Input value={tool} onChange={setTool} placeholder="e.g. shell_exec, file_write" style={{ marginBottom: 14, fontFamily: "'SF Mono', monospace" }} />

      <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Required Authorization Level</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["standard", "elevated", "admin"] as const).map(l => (
          <button key={l} onClick={() => setLevel(l)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: level === l ? `1px solid ${LEVEL[l]}` : `1px solid ${C.border}`, background: level === l ? (l === "admin" ? C.errSoft : l === "elevated" ? C.warnSoft : C.accentSoft) : "transparent", color: level === l ? LEVEL[l] : C.dim, fontWeight: 600, fontSize: 12, textTransform: "capitalize" as const }}>
            <span dangerouslySetInnerHTML={{ __html: l === "admin" ? "&#128737; " : l === "elevated" ? "&#128273; " : "" }} />{l}
          </button>
        ))}
      </div>

      <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Description</label>
      <Input value={desc} onChange={setDesc} placeholder="Brief description of what this gate protects" style={{ marginBottom: 22 }} />

      <div style={{ display: "flex", gap: 8 }}>
        <Btn v="g" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || !tool.trim()} style={{ flex: 1 }}>{saving ? "Saving..." : "Save Gate"}</Btn>
      </div>
    </Modal>
  );
}

// ─── Preset Templates ────────────────────────────────────────────────────

const PRESETS: Record<string, GateEntry[]> = {
  "Development": [
    { tool: "shell_exec", required_level: "elevated", description: "Execute shell commands" },
    { tool: "file_write", required_level: "standard", description: "Write files (relaxed for dev)" },
    { tool: "file_delete", required_level: "elevated", description: "Delete files" },
    { tool: "git_push", required_level: "standard", description: "Push to git (relaxed for dev)" },
  ],
  "Production": [
    { tool: "shell_exec", required_level: "admin", description: "Execute shell commands" },
    { tool: "file_write", required_level: "elevated", description: "Write or create files" },
    { tool: "file_delete", required_level: "admin", description: "Delete files" },
    { tool: "deploy", required_level: "admin", description: "Deploy applications" },
    { tool: "database_write", required_level: "elevated", description: "Write to databases" },
    { tool: "database_admin", required_level: "admin", description: "Database DDL operations" },
    { tool: "env_set", required_level: "admin", description: "Modify environment variables" },
    { tool: "service_restart", required_level: "admin", description: "Restart services" },
  ],
  "Compliance": [
    { tool: "shell_exec", required_level: "admin", description: "Execute shell commands" },
    { tool: "file_write", required_level: "elevated", description: "Write or create files" },
    { tool: "file_delete", required_level: "admin", description: "Delete files" },
    { tool: "email_send", required_level: "elevated", description: "Send emails" },
    { tool: "api_call", required_level: "elevated", description: "External API requests" },
    { tool: "database_write", required_level: "admin", description: "Write to databases" },
    { tool: "deploy", required_level: "admin", description: "Deploy applications" },
    { tool: "key_revoke", required_level: "admin", description: "Revoke signing keys" },
    { tool: "gate_modify", required_level: "admin", description: "Modify gate registry" },
    { tool: "vault_write_key", required_level: "admin", description: "Add/update vault keys" },
  ],
};

// ─── Main Gates View ─────────────────────────────────────────────────────

export default function GatesView() {
  const [gates, setGates] = useState<GateEntry[]>([]);
  const [editGate, setEditGate] = useState<GateEntry | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [presetOpen, setPresetOpen] = useState(false);

  const load = () => { window.spa.gates.list().then((g: any) => setGates(g)); };
  useEffect(load, []);

  const adminCount = gates.filter(g => g.required_level === "admin").length;
  const elevatedCount = gates.filter(g => g.required_level === "elevated").length;
  const standardCount = gates.filter(g => g.required_level === "standard").length;

  const filtered = gates.filter(g => {
    if (filterLevel !== "all" && g.required_level !== filterLevel) return false;
    if (search && !g.tool.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<string, GateEntry[]> = {};
  for (const g of filtered) {
    const lvl = g.required_level;
    if (!grouped[lvl]) grouped[lvl] = [];
    grouped[lvl].push(g);
  }
  const levelOrder = ["admin", "elevated", "standard"];

  const applyPreset = async (name: string) => {
    const entries = PRESETS[name];
    if (!entries) return;
    for (const e of entries) await window.spa.gates.set(e.tool, e.required_level, e.description ?? "");
    load(); setPresetOpen(false);
  };

  return (
    <div style={{ padding: 28, overflowY: "auto" as const, flex: 1, animation: "fadeIn .2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Action Gates</h1>
          <p style={{ fontSize: 13, color: C.dim }}>Control which tools require signed authorization.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn v="g" onClick={() => setPresetOpen(true)}>Presets</Btn>
          <Btn onClick={() => setEditGate(null)}>+ Add Gate</Btn>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
        <Card><div style={{ fontSize: 22, fontWeight: 700 }}>{gates.length}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Total Gates</div></Card>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: C.err }}>{adminCount}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Admin</div></Card>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: C.warn }}>{elevatedCount}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Elevated</div></Card>
        <Card><div style={{ fontSize: 22, fontWeight: 700, color: C.dim }}>{standardCount}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Standard</div></Card>
      </div>

      {/* Filter + Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <Input value={search} onChange={setSearch} placeholder="Search gates..." style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
          {["all", "admin", "elevated", "standard"].map(f => (
            <button key={f} onClick={() => setFilterLevel(f)} style={{ padding: "6px 12px", borderRadius: 5, border: "none", background: filterLevel === f ? C.accentSoft : "transparent", color: filterLevel === f ? C.accent : C.dim, fontSize: 11, fontWeight: 600, textTransform: "capitalize" as const }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Gate List grouped by level */}
      {filtered.length === 0 ? (
        <Empty icon="&#128737;" title="No gates defined" sub="Action gates control which tools require signed authorization." action="Add Gate" onAction={() => setEditGate(null)} />
      ) : (
        levelOrder.filter(l => grouped[l]).map(level => (
          <div key={level} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <AuthBadge level={level} />
              <span style={{ fontSize: 11, color: C.dim }}>{grouped[level].length} gate(s)</span>
            </div>
            <div style={{ ...glass(0), overflow: "hidden" }}>
              {grouped[level].map(g => (
                <div key={g.tool} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <span style={{ flex: 2, fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 600 }}>
                    <span style={{ color: C.dim, marginRight: 6 }}>&#128274;</span>{g.tool}
                  </span>
                  <span style={{ flex: 3, color: C.dim, fontSize: 11 }}>{g.description ?? "—"}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <Btn v="g" onClick={() => setEditGate(g)} style={{ padding: "3px 10px", fontSize: 10 }}>Edit</Btn>
                    <Btn v="d" onClick={async () => { await window.spa.gates.remove(g.tool); load(); }} style={{ padding: "3px 10px", fontSize: 10 }}>Remove</Btn>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Gate Editor Modal */}
      <GateEditorModal
        open={editGate !== undefined}
        onClose={() => setEditGate(undefined)}
        gate={editGate}
        onSaved={load}
      />

      {/* Preset Modal */}
      <Modal open={presetOpen} onClose={() => setPresetOpen(false)} title="Gate Presets" width={440}>
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Apply a preset template. Existing gates with matching tools will be updated.</p>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
          {Object.entries(PRESETS).map(([name, entries]) => (
            <div key={name} style={{ ...glass(1), padding: 16, cursor: "pointer" }} onClick={() => applyPreset(name)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 10, color: C.dim }}>{entries.length} gates</span>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                {entries.slice(0, 5).map(e => (
                  <Pill key={e.tool} bg={e.required_level === "admin" ? C.errSoft : e.required_level === "elevated" ? C.warnSoft : C.accentSoft} color={LEVEL[e.required_level]}>{e.tool}</Pill>
                ))}
                {entries.length > 5 && <Pill>+{entries.length - 5} more</Pill>}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
