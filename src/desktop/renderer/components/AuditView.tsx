/**
 * openclaw-spa — Audit Log View
 *
 * Security and compliance monitoring: filterable log table,
 * event detail panel, chain integrity, activity charts, export.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Input, Sec, Empty, Modal, AuthBadge, ProgressBar, EV_C, LEVEL } from "./shared";
import type { AuditEntry } from "./shared";

// ─── Event Detail Modal ──────────────────────────────────────────────────

function EventDetailModal({ entry, open, onClose }: { entry: AuditEntry | null; open: boolean; onClose: () => void }) {
  if (!entry) return null;
  return (
    <Modal open={open} onClose={onClose} title="Event Details" width={500}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Pill bg={(EV_C[entry.event_type] ?? C.dim) + "18"} color={EV_C[entry.event_type] ?? C.dim}>{entry.event_type.replace(/_/g, " ")}</Pill>
        {entry.auth_level && <AuthBadge level={entry.auth_level} />}
        {entry.status && <Pill bg={entry.status === "success" ? C.okSoft : C.errSoft} color={entry.status === "success" ? C.ok : C.err}>{entry.status}</Pill>}
      </div>

      <div style={{ background: C.bg, padding: 14, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        {[
          { l: "ID", v: String(entry.id) },
          { l: "Timestamp", v: new Date(entry.timestamp).toLocaleString() },
          { l: "Event Type", v: entry.event_type },
          { l: "Key ID", v: entry.key_id ?? "—" },
          { l: "Channel", v: entry.channel ?? "—" },
          { l: "Sender", v: entry.sender_id ?? "—" },
          { l: "Auth Level", v: entry.auth_level ?? "—" },
          { l: "Status", v: entry.status ?? "—" },
        ].map(r => (
          <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
            <span style={{ color: C.dim }}>{r.l}</span>
            <span style={{ color: C.text, fontFamily: "'SF Mono', monospace", fontSize: 11 }}>{r.v}</span>
          </div>
        ))}
      </div>

      {entry.detail && (
        <>
          <Sec>Detail</Sec>
          <div style={{ background: C.bg, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.dim, whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const, marginBottom: 16 }}>{entry.detail}</div>
        </>
      )}

      {entry.hash && (
        <>
          <Sec>Chain Hash</Sec>
          <div style={{ background: C.bg, padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "'SF Mono', monospace", fontSize: 10, color: C.muted, wordBreak: "break-all" as const }}>{entry.hash}</div>
        </>
      )}
    </Modal>
  );
}

// ─── Activity Chart (mini bar chart) ─────────────────────────────────────

function ActivityChart({ stats }: { stats: Record<string, number> }) {
  const entries = Object.entries(stats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100, padding: "0 4px" }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, maxWidth: 60 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: EV_C[k] ?? C.dim }}>{v}</span>
          <div style={{ width: "100%", height: Math.max((v / max) * 64, 4), background: EV_C[k] ?? C.dim, borderRadius: 4, opacity: .7 }} />
          <span style={{ fontSize: 8, color: C.muted, textAlign: "center" as const, lineHeight: 1.2 }}>{k.replace(/_/g, "\n")}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Audit View ─────────────────────────────────────────────────────

export default function AuditView({ embedded }: { embedded?: boolean } = {}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    const opts: Record<string, unknown> = { limit };
    if (filterType) opts.event_type = filterType;
    if (filterLevel) opts.auth_level = filterLevel;

    const [e, s, ch, cnt] = await Promise.all([
      window.spa.audit.query(opts),
      window.spa.audit.stats(),
      window.spa.audit.verifyChain(),
      window.spa.audit.count(),
    ]);
    setEntries(e); setStats(s); setChainOk(ch === null); setTotalCount(cnt);
  };

  useEffect(() => { load(); }, [filterType, filterLevel, limit]);

  const filtered = entries.filter(e => {
    if (filterOutcome === "success" && e.status !== "success") return false;
    if (filterOutcome === "failure" && e.status === "success") return false;
    if (search && !e.event_type.includes(search) && !e.detail?.toLowerCase().includes(search.toLowerCase()) && !e.key_id?.includes(search)) return false;
    return true;
  });

  const eventTypes = [...new Set(entries.map(e => e.event_type))];

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await window.spa.audit.exportNDJSON();
      const blob = new Blob([data], { type: "application/x-ndjson" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `audit-${new Date().toISOString().slice(0, 10)}.ndjson`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert(`Export failed: ${e}`); }
    setExporting(false);
  };

  const totalVerified = stats.envelope_verified ?? 0;
  const totalRejected = stats.envelope_rejected ?? 0;
  const verifyRate = totalVerified + totalRejected > 0 ? Math.round((totalVerified / (totalVerified + totalRejected)) * 100) : 100;

  return (
    <div style={{ padding: embedded ? "0 28px 28px" : 28, overflowY: "auto" as const, flex: 1, animation: "fadeIn .2s ease" }}>
      {!embedded && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Audit Log</h1>
            <p style={{ fontSize: 13, color: C.dim }}>Security events, signature verification, and compliance trail.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="g" onClick={doExport} disabled={exporting}>{exporting ? "Exporting..." : "Export NDJSON"}</Btn>
            <Btn v="g" onClick={load}>Refresh</Btn>
          </div>
        </div>
      )}
      {embedded && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 18 }}>
          <Btn v="g" onClick={doExport} disabled={exporting}>{exporting ? "Exporting..." : "Export NDJSON"}</Btn>
          <Btn v="g" onClick={load}>Refresh</Btn>
        </div>
      )}

      {/* Summary Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 22 }}>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totalCount}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Total Events</div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot color={chainOk ? C.ok : chainOk === false ? C.err : C.muted} size={10} />
            <span style={{ fontSize: 16, fontWeight: 700, color: chainOk ? C.ok : chainOk === false ? C.err : C.dim }}>{chainOk ? "Intact" : chainOk === false ? "BROKEN" : "..."}</span>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Chain Integrity</div>
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 700, color: verifyRate >= 95 ? C.ok : verifyRate >= 80 ? C.warn : C.err }}>{verifyRate}%</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Verification Rate</div>
          <ProgressBar percent={verifyRate} height={4} />
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.err }}>{stats.intrusion_alert ?? 0}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Intrusion Alerts</div>
        </Card>
      </div>

      {/* Activity Chart */}
      {Object.keys(stats).length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Sec>Activity Breakdown</Sec>
          <Card><ActivityChart stats={stats} /></Card>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" as const }}>
        <Input value={search} onChange={setSearch} placeholder="Search events..." style={{ flex: 1, minWidth: 200 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, fontSize: 12 }}>
          <option value="">All Types</option>
          {eventTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
          style={{ padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, fontSize: 12 }}>
          <option value="">All Levels</option>
          <option value="admin">Admin</option>
          <option value="elevated">Elevated</option>
          <option value="standard">Standard</option>
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}
          style={{ padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, fontSize: 12 }}>
          <option value="">All Outcomes</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      {/* Audit Table */}
      <div style={{ ...glass(0), overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 600, color: C.dim }}>
          <span style={{ width: 140 }}>Time</span>
          <span style={{ width: 150 }}>Event</span>
          <span style={{ width: 80 }}>Auth</span>
          <span style={{ width: 70 }}>Status</span>
          <span style={{ flex: 1 }}>Detail</span>
          <span style={{ width: 40 }}></span>
        </div>
        {filtered.length === 0 && <div style={{ padding: 24, textAlign: "center" as const, color: C.muted, fontSize: 12 }}>No entries match filters.</div>}
        {filtered.map(e => (
          <div key={e.id} onClick={() => setSelected(e)}
            style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11, cursor: "pointer", background: selected?.id === e.id ? C.accentSoft : undefined, transition: "background .1s" }}>
            <span style={{ width: 140, color: C.dim, fontSize: 10 }}>{new Date(e.timestamp).toLocaleString()}</span>
            <span style={{ width: 150 }}><Pill bg={(EV_C[e.event_type] ?? C.dim) + "18"} color={EV_C[e.event_type] ?? C.dim}>{e.event_type.replace(/_/g, " ")}</Pill></span>
            <span style={{ width: 80 }}>{e.auth_level ? <span style={{ color: LEVEL[e.auth_level] ?? C.dim, fontSize: 10, fontWeight: 600, textTransform: "capitalize" as const }}>{e.auth_level}</span> : <span style={{ color: C.muted }}>—</span>}</span>
            <span style={{ width: 70 }}>{e.status ? <Dot color={e.status === "success" ? C.ok : C.err} /> : null}</span>
            <span style={{ flex: 1, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.detail ?? "—"}</span>
            <span style={{ width: 40, textAlign: "right" as const, color: C.accent, fontSize: 12 }}>&#8594;</span>
          </div>
        ))}
      </div>

      {filtered.length >= limit && (
        <div style={{ textAlign: "center" as const, marginTop: 12 }}>
          <Btn v="g" onClick={() => setLimit(l => l + 100)}>Load More</Btn>
        </div>
      )}

      <EventDetailModal entry={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
