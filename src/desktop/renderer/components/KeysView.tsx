/**
 * openclaw-spa — Keys Management View
 *
 * Full key registry: overview stats, key table with sort/filter,
 * details side panel, key generation modal, rotation management.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Input, Select, Sec, Empty, Modal, AuthBadge, ProgressBar, Spinner, LEVEL } from "./shared";
import type { KeyInfo } from "./shared";

// ─── Key Generation Modal ────────────────────────────────────────────────

function KeyGenModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState("My Signing Key");
  const [level, setLevel] = useState("elevated");
  const [algo, setAlgo] = useState("ecdsa-p384");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ key_id: string; fingerprint: string } | null>(null);

  const gen = async () => {
    setLoading(true);
    try {
      const r = await window.spa.generateKey({ label, max_auth_level: level, algorithm: algo });
      setResult(r);
    } catch (e) { alert(`Key generation failed: ${e}`); }
    setLoading(false);
  };

  const done = () => { setResult(null); setLabel("My Signing Key"); setLevel("elevated"); onCreated(); onClose(); };

  return (
    <Modal open={open} onClose={result ? done : onClose} title={result ? "Key Created" : "Generate Signing Key"} width={440}>
      {!result ? (
        <>
          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Label</label>
          <Input value={label} onChange={setLabel} style={{ marginBottom: 14 }} />

          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Algorithm</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[{ v: "ecdsa-p384", l: "ECDSA P-384" }, { v: "rsa-4096", l: "RSA 4096" }].map(a => (
              <button key={a.v} onClick={() => setAlgo(a.v)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: algo === a.v ? `1px solid ${C.accent}` : `1px solid ${C.border}`, background: algo === a.v ? C.accentSoft : "transparent", color: algo === a.v ? C.accent : C.dim, fontWeight: 600, fontSize: 12 }}>
                {a.l}{a.v === "ecdsa-p384" && <span style={{ fontSize: 9, marginLeft: 4, opacity: .6 }}>recommended</span>}
              </button>
            ))}
          </div>

          <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Max Authorization Level</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
            {(["standard", "elevated", "admin"] as const).map(l => (
              <button key={l} onClick={() => setLevel(l)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: level === l ? `1px solid ${LEVEL[l]}` : `1px solid ${C.border}`, background: level === l ? (l === "admin" ? C.errSoft : l === "elevated" ? C.warnSoft : C.accentSoft) : "transparent", color: level === l ? LEVEL[l] : C.dim, fontWeight: 600, fontSize: 12, textTransform: "capitalize" as const }}>{l}</button>
            ))}
          </div>

          <Btn onClick={gen} disabled={loading || !label.trim()} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
            {loading ? "Generating..." : "Generate Key Pair"}
          </Btn>
        </>
      ) : (
        <div style={{ textAlign: "center" as const }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.okSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 16px", color: C.ok }}>&#10003;</div>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 16 }}>Key stored securely in your OS keychain.</p>
          <div style={{ background: C.bg, padding: 14, borderRadius: 10, fontFamily: "'SF Mono', monospace", fontSize: 11, color: C.muted, textAlign: "left" as const, wordBreak: "break-all" as const, border: `1px solid ${C.border}`, marginBottom: 20 }}>
            <div><span style={{ color: C.dim }}>ID:</span> {result.key_id}</div>
            <div style={{ marginTop: 4 }}><span style={{ color: C.dim }}>Fingerprint:</span> {result.fingerprint}</div>
          </div>
          <Btn onClick={done} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>Done</Btn>
        </div>
      )}
    </Modal>
  );
}

// ─── Key Rotation Modal ──────────────────────────────────────────────────

function RotateModal({ open, onClose, keyId, onRotated }: { open: boolean; onClose: () => void; keyId: string; onRotated: () => void }) {
  const [grace, setGrace] = useState("72");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const rotate = async () => {
    setLoading(true);
    try {
      await window.spa.keyRotation.rotate(keyId, { grace_period_hours: parseInt(grace) || 72, label: label || undefined });
      onRotated(); onClose();
    } catch (e) { alert(`Rotation failed: ${e}`); }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Rotate Key" width={400}>
      <p style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Creates a new key and marks the old one for graceful retirement.</p>
      <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>New Key Label (optional)</label>
      <Input value={label} onChange={setLabel} placeholder="Leave blank to auto-name" style={{ marginBottom: 14 }} />
      <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 5 }}>Grace Period (hours)</label>
      <Input value={grace} onChange={setGrace} type="number" style={{ marginBottom: 20 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <Btn v="g" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={rotate} disabled={loading} style={{ flex: 1 }}>{loading ? "Rotating..." : "Rotate"}</Btn>
      </div>
    </Modal>
  );
}

// ─── Key Details Side Panel ──────────────────────────────────────────────

function KeyDetails({ k, isActive, onUse, onRevoke, onRotate }: {
  k: KeyInfo; isActive: boolean; onUse: () => void; onRevoke: () => void; onRotate: () => void;
}) {
  const [chain, setChain] = useState<any[]>([]);
  useEffect(() => { window.spa.keyRotation.chain(k.key_id).then(setChain).catch(() => {}); }, [k.key_id]);

  return (
    <div style={{ padding: 20, animation: "slideIn .2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: k.active ? C.okSoft : C.errSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: k.active ? C.ok : C.err }}>&#128273;</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{k.label}</div>
          <div style={{ fontSize: 11, color: C.dim }}>{k.active ? "Active" : "Revoked"}</div>
        </div>
      </div>

      <div style={{ background: C.bg, padding: 14, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        {[
          { l: "Key ID", v: k.key_id },
          { l: "Algorithm", v: k.algorithm ?? "ecdsa-p384" },
          { l: "Auth Level", v: k.max_auth_level },
          { l: "Fingerprint", v: k.fingerprint ?? "—" },
          { l: "Created", v: new Date(k.created_at).toLocaleString() },
        ].map(r => (
          <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
            <span style={{ color: C.dim }}>{r.l}</span>
            <span style={{ color: C.text, fontFamily: "'SF Mono', monospace", fontSize: 10, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, textAlign: "right" as const }}>{r.v}</span>
          </div>
        ))}
      </div>

      {isActive && <Pill bg={C.accentSoft} color={C.accent}>Currently Active</Pill>}

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, marginTop: 16 }}>
        {k.active && !isActive && <Btn v="g" onClick={onUse} style={{ width: "100%" }}>Use This Key</Btn>}
        {k.active && <Btn v="g" onClick={onRotate} style={{ width: "100%" }}>Rotate Key</Btn>}
        {k.active && <Btn v="d" onClick={onRevoke} style={{ width: "100%" }}>Revoke Key</Btn>}
      </div>

      {chain.length > 1 && (
        <div style={{ marginTop: 20 }}>
          <Sec>Rotation Chain</Sec>
          {chain.map((c: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
              <Dot color={i === 0 ? C.ok : C.muted} />
              <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 10 }}>{String(c.key_id ?? c).slice(0, 16)}...</span>
              {i === 0 && <Pill bg={C.okSoft} color={C.ok}>Current</Pill>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Keys View ──────────────────────────────────────────────────────

export default function KeysView({ keys, keyId, setKeyId, refresh }: {
  keys: KeyInfo[]; keyId: string | null; setKeyId: (id: string) => void; refresh: () => void;
}) {
  const [genOpen, setGenOpen] = useState(false);
  const [rotateKey, setRotateKey] = useState<string | null>(null);
  const [selKey, setSelKey] = useState<KeyInfo | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "revoked">("all");
  const [search, setSearch] = useState("");

  useEffect(() => { window.spa.keyRotation.pending().then(setPending).catch(() => {}); }, []);

  const active = keys.filter(k => k.active).length;
  const revoked = keys.filter(k => !k.active).length;
  const filtered = keys.filter(k => {
    if (filter === "active" && !k.active) return false;
    if (filter === "revoked" && k.active) return false;
    if (search && !k.label.toLowerCase().includes(search.toLowerCase()) && !k.key_id.includes(search)) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flex: 1, animation: "fadeIn .2s ease" }}>
      {/* Main Panel */}
      <div style={{ flex: 1, padding: 28, overflowY: "auto" as const }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Signing Keys</h1>
            <p style={{ fontSize: 13, color: C.dim }}>Generate, rotate, and manage cryptographic signing keys.</p>
          </div>
          <Btn onClick={() => setGenOpen(true)}>+ Generate Key</Btn>
        </div>

        {/* Overview */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
          <Card><div style={{ fontSize: 22, fontWeight: 700 }}>{keys.length}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Total Keys</div></Card>
          <Card><div style={{ fontSize: 22, fontWeight: 700, color: C.ok }}>{active}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Active</div></Card>
          <Card><div style={{ fontSize: 22, fontWeight: 700, color: C.err }}>{revoked}</div><div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Revoked</div></Card>
        </div>

        {/* Pending rotations */}
        {pending.length > 0 && (
          <div style={{ ...glass(1), padding: "12px 16px", marginBottom: 18, borderLeft: `3px solid ${C.warn}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.warn} /><span style={{ fontSize: 12, color: C.text }}>{pending.length} pending rotation(s) with active grace periods</span></div>
            <Btn v="g" onClick={async () => { await window.spa.keyRotation.finalize(); setPending(await window.spa.keyRotation.pending()); refresh(); }} style={{ padding: "4px 12px", fontSize: 11 }}>Finalize Expired</Btn>
          </div>
        )}

        {/* Filter + Search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <Input value={search} onChange={setSearch} placeholder="Search by label or ID..." style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: 8, padding: 3, border: `1px solid ${C.border}` }}>
            {(["all", "active", "revoked"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 12px", borderRadius: 5, border: "none", background: filter === f ? C.accentSoft : "transparent", color: filter === f ? C.accent : C.dim, fontSize: 11, fontWeight: 600, textTransform: "capitalize" as const }}>{f}</button>
            ))}
          </div>
        </div>

        {/* Key Table */}
        {filtered.length === 0 ? (
          <Empty icon="&#128273;" title="No keys found" sub={keys.length === 0 ? "Generate a key to sign elevated prompts." : "Try a different search or filter."} action={keys.length === 0 ? "Generate Key" : undefined} onAction={() => setGenOpen(true)} />
        ) : (
          <div style={{ ...glass(0), overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "9px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 600, color: C.dim }}>
              <span style={{ width: 24 }}></span>
              <span style={{ flex: 2 }}>Label</span>
              <span style={{ flex: 1 }}>Algorithm</span>
              <span style={{ flex: 1 }}>Level</span>
              <span style={{ flex: 1 }}>Created</span>
              <span style={{ width: 70 }}>Status</span>
            </div>
            {filtered.map(k => (
              <div key={k.key_id} onClick={() => setSelKey(k)}
                style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: selKey?.key_id === k.key_id ? C.accentSoft : undefined, transition: "background .1s" }}>
                <span style={{ width: 24 }}><Dot color={k.active ? C.ok : C.err} /></span>
                <span style={{ flex: 2, fontSize: 13, fontWeight: 600 }}>
                  {k.label}
                  {k.key_id === keyId && <span style={{ fontSize: 9, color: C.accent, marginLeft: 6 }}>IN USE</span>}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: C.dim }}>{k.algorithm ?? "ecdsa-p384"}</span>
                <span style={{ flex: 1 }}><AuthBadge level={k.max_auth_level} /></span>
                <span style={{ flex: 1, fontSize: 10, color: C.dim }}>{new Date(k.created_at).toLocaleDateString()}</span>
                <span style={{ width: 70 }}><Pill bg={k.active ? C.okSoft : C.errSoft} color={k.active ? C.ok : C.err}>{k.active ? "Active" : "Revoked"}</Pill></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details Side Panel */}
      {selKey && (
        <div style={{ width: 300, borderLeft: `1px solid ${C.border}`, background: C.surface, overflowY: "auto" as const }}>
          <KeyDetails
            k={selKey}
            isActive={selKey.key_id === keyId}
            onUse={() => { setKeyId(selKey.key_id); }}
            onRevoke={async () => {
              if (confirm(`Revoke key "${selKey.label}"? This is irreversible.`)) {
                await window.spa.revokeKey(selKey.key_id);
                refresh(); setSelKey(null);
              }
            }}
            onRotate={() => setRotateKey(selKey.key_id)}
          />
        </div>
      )}

      <KeyGenModal open={genOpen} onClose={() => setGenOpen(false)} onCreated={refresh} />
      {rotateKey && <RotateModal open={!!rotateKey} onClose={() => setRotateKey(null)} keyId={rotateKey} onRotated={refresh} />}
    </div>
  );
}
