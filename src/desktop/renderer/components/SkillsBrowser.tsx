/**
 * openclaw-spa — Skills Browser Component
 *
 * Browse, search, and manage community-contributed skills.
 * Shows trust scores, install counts, and gate requirements.
 * Skills below the trust threshold are visually dimmed with warnings.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Btn, Input, Sec, Card, Pill, Empty, Modal, Spinner } from "./shared";

const TRUST_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  trusted:   { bg: "rgba(52,211,153,0.08)", fg: C.ok,     label: "Trusted" },
  community: { bg: "rgba(104,130,255,0.08)", fg: C.accent, label: "Community" },
  new:       { bg: "rgba(251,191,36,0.08)",  fg: C.warn,   label: "New" },
  untrusted: { bg: "rgba(248,113,113,0.08)", fg: C.err,    label: "Untrusted" },
  blocked:   { bg: "rgba(248,113,113,0.12)", fg: C.err,    label: "Blocked" },
};

const CATEGORIES = [
  { id: "all", label: "All" }, { id: "productivity", label: "Productivity" },
  { id: "development", label: "Development" }, { id: "research", label: "Research" },
  { id: "communication", label: "Communication" }, { id: "data", label: "Data" },
  { id: "automation", label: "Automation" }, { id: "security", label: "Security" },
];

function TrustBadge({ tier, score }: { tier: string; score: number }) {
  const t = TRUST_COLORS[tier] ?? TRUST_COLORS.untrusted;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: t.bg, color: t.fg }}>
      <span>{t.label}</span>
      <span style={{ opacity: 0.7 }}>{score}</span>
    </div>
  );
}

function TrustBar({ score }: { score: number }) {
  const color = score >= 80 ? C.ok : score >= 50 ? C.accent : score >= 30 ? C.warn : C.err;
  return (
    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
      <div style={{ width: `${Math.min(100, score)}%`, height: "100%", borderRadius: 2, background: color, transition: "width .3s ease" }} />
    </div>
  );
}

interface SkillData {
  id: string; name: string; summary: string; version: string; category: string;
  tags: string[]; icon?: string; license: string;
  author: { name: string; verified: boolean };
  trust: { trust_score: number; tier: string; install_count: number; review_count: number; average_rating: number; code_audited: boolean; author_verified: boolean };
  required_gates: { tool: string; reason: string; level: string }[];
}

function SkillDetailModal({ skill, open, onClose, isInstalled, onInstall, onRemove }: {
  skill: SkillData | null; open: boolean; onClose: () => void;
  isInstalled: boolean; onInstall: () => void; onRemove: () => void;
}) {
  if (!skill) return null;
  const tr = skill.trust;
  return (
    <Modal open={open} onClose={onClose} title={skill.name} width={500}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: C.rs, background: C.raised, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: `1px solid ${C.border}` }}>
          {skill.icon ?? "\u{1F9E9}"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{skill.name}</div>
          <div style={{ fontSize: 11, color: C.dim }}>v{skill.version} &middot; {skill.author.name} {skill.author.verified ? "\u2713" : ""}</div>
        </div>
        <TrustBadge tier={tr.tier} score={tr.trust_score} />
      </div>

      <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 16 }}>{skill.summary}</p>

      <div style={{ ...glass(0), padding: 14, borderRadius: C.rs, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 10, fontWeight: 600 }}>Trust & Safety</div>
        <TrustBar score={tr.trust_score} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
          {[
            { l: "Installs", v: tr.install_count.toLocaleString() },
            { l: "Reviews", v: String(tr.review_count) },
            { l: "Rating", v: `${tr.average_rating.toFixed(1)} / 5` },
          ].map(r => (
            <div key={r.l}>
              <div style={{ fontSize: 9, color: C.muted }}>{r.l}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {tr.code_audited && <Pill bg={C.okSoft} color={C.ok}>Code Audited</Pill>}
          {tr.author_verified && <Pill bg={C.accentSoft} color={C.accent}>Verified Author</Pill>}
        </div>
      </div>

      {skill.required_gates.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8, fontWeight: 600 }}>Required Permissions</div>
          {skill.required_gates.map(g => (
            <div key={g.tool} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ fontFamily: C.mono, fontWeight: 600, color: C.text }}>{g.tool}</span>
              <span style={{ flex: 1, fontSize: 10, color: C.dim }}>{g.reason}</span>
              <Pill bg={g.level === "admin" ? C.errSoft : g.level === "elevated" ? C.warnSoft : C.accentSoft} color={g.level === "admin" ? C.err : g.level === "elevated" ? C.warn : C.accent}>{g.level}</Pill>
            </div>
          ))}
        </div>
      )}

      {tr.tier === "blocked" ? (
        <div style={{ padding: "12px 16px", background: C.errSoft, borderRadius: C.rs, color: C.err, fontSize: 12, fontWeight: 600 }}>
          This skill has been blocked due to security concerns.
        </div>
      ) : tr.trust_score < 50 ? (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          <div style={{ padding: "10px 14px", background: C.warnSoft, borderRadius: C.rs, color: C.warn, fontSize: 11, lineHeight: 1.5 }}>
            This skill has not reached the community trust threshold (50). Install at your own risk.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isInstalled ? (
              <Btn v="d" onClick={onRemove} style={{ flex: 1 }}>Remove</Btn>
            ) : (
              <Btn v="g" onClick={onInstall} style={{ flex: 1 }}>Install Anyway</Btn>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          {isInstalled ? (
            <Btn v="d" onClick={onRemove} style={{ flex: 1 }}>Remove Skill</Btn>
          ) : (
            <Btn onClick={onInstall} style={{ flex: 1 }}>Install Skill</Btn>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Main Skills Browser ─────────────────────────────────────────────────

type SortMode = "popular" | "newest" | "top_rated" | "trust";

function VoteButtons({ skill, votes, onVote }: { skill: SkillData; votes: Record<string, 1 | -1>; onVote: (id: string, v: 1 | -1) => void }) {
  const v = votes[skill.id];
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      <button onClick={e => { e.stopPropagation(); onVote(skill.id, 1); }}
        style={{ background: v === 1 ? C.okSoft : "transparent", border: `1px solid ${v === 1 ? C.ok : C.border}`, borderRadius: 4, padding: "2px 6px", fontSize: 10, color: v === 1 ? C.ok : C.muted, cursor: "pointer", transition: "all .12s" }}>
        &#9650; {skill.trust.review_count > 0 ? Math.round(skill.trust.average_rating * skill.trust.review_count * 0.6) : 0}
      </button>
      <button onClick={e => { e.stopPropagation(); onVote(skill.id, -1); }}
        style={{ background: v === -1 ? C.errSoft : "transparent", border: `1px solid ${v === -1 ? C.err : C.border}`, borderRadius: 4, padding: "2px 6px", fontSize: 10, color: v === -1 ? C.err : C.muted, cursor: "pointer", transition: "all .12s" }}>
        &#9660;
      </button>
    </div>
  );
}

export default function SkillsBrowser() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SkillData | null>(null);
  const [sort, setSort] = useState<SortMode>("popular");
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});
  const [showInstalled, setShowInstalled] = useState(false);

  useEffect(() => {
    loadSkills();
    loadInstalled();
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const result = await window.spa.skills.search({ query: search, category: category === "all" ? undefined : category });
      setSkills((result.skills ?? []) as SkillData[]);
    } catch {
      setSkills([]);
    }
    setLoading(false);
  };

  const loadInstalled = async () => {
    try {
      const list = await window.spa.skills.installed();
      setInstalledIds(new Set((list as any[]).map(s => s.manifest?.id ?? s.id)));
    } catch {}
  };

  useEffect(() => { loadSkills(); }, [search, category]);

  const installSkill = async (id: string) => {
    await window.spa.skills.install(id).catch(() => {});
    loadInstalled();
  };

  const removeSkill = async (id: string) => {
    await window.spa.skills.remove(id).catch(() => {});
    loadInstalled();
  };

  const onVote = (id: string, v: 1 | -1) => {
    setVotes(p => ({ ...p, [id]: p[id] === v ? undefined as any : v }));
  };

  const filtered = skills.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.summary.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== "all" && s.category !== category) return false;
    if (showInstalled && !installedIds.has(s.id)) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "popular") return b.trust.install_count - a.trust.install_count;
    if (sort === "top_rated") return b.trust.average_rating - a.trust.average_rating;
    if (sort === "trust") return b.trust.trust_score - a.trust.trust_score;
    return 0; // newest: default API order
  });

  return (
    <div style={{ display: "flex", flex: 1, animation: "fadeIn .2s ease" }}>
      {/* Sidebar filters */}
      <div style={{ width: 200, borderRight: `1px solid ${C.border}`, padding: "14px 14px", background: C.surface, flexShrink: 0, display: "flex", flexDirection: "column" as const }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Skills</h2>
        <Input value={search} onChange={setSearch} placeholder="Search skills..." style={{ fontSize: 11, padding: "7px 10px", marginBottom: 14 }} />

        <Sec>Sort By</Sec>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, marginBottom: 14 }}>
          {([{ id: "popular", label: "Popular" }, { id: "newest", label: "Newest" }, { id: "top_rated", label: "Top Rated" }, { id: "trust", label: "Trust" }] as const).map(s => (
            <button key={s.id} onClick={() => setSort(s.id)} style={{
              padding: "4px 8px", borderRadius: C.rx, border: sort === s.id ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`,
              background: sort === s.id ? C.accentSoft : "transparent", color: sort === s.id ? C.accent : C.muted,
              fontSize: 9, fontWeight: 600, transition: "all .1s",
            }}>{s.label}</button>
          ))}
        </div>

        <Sec>Categories</Sec>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              padding: "7px 10px", borderRadius: C.rx, border: "none", textAlign: "left" as const,
              background: category === c.id ? C.accentSoft : "transparent",
              color: category === c.id ? C.accent : C.dim,
              fontSize: 11, fontWeight: 600, transition: "all .1s",
            }}>{c.label}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => setShowInstalled(!showInstalled)} style={{ ...glass(showInstalled ? 1 : 0), padding: 12, borderRadius: C.rs, border: showInstalled ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`, width: "100%", textAlign: "left" as const, cursor: "pointer", transition: "all .12s" }}>
          <div style={{ fontSize: 10, color: showInstalled ? C.accent : C.muted, marginBottom: 4 }}>Installed {showInstalled ? "(filtering)" : ""}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: showInstalled ? C.accent : C.text }}>{installedIds.size}</div>
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: 18 }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}><Spinner size={20} /></div>
        ) : filtered.length === 0 ? (
          <Empty icon="\u{1F9E9}" title="No Skills Found" sub={search ? "Try a different search term." : "No skills available in this category yet."} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {filtered.map(s => {
              const isInst = installedIds.has(s.id);
              const dimmed = s.trust.tier === "blocked";
              return (
                <div key={s.id} onClick={() => setSelected(s)} style={{
                  ...glass(1), padding: "16px 18px", borderRadius: C.rs, cursor: "pointer",
                  transition: "all .12s", opacity: dimmed ? 0.4 : 1,
                  border: isInst ? `1px solid ${C.borderAccent}` : `1px solid transparent`,
                }}
                  onMouseEnter={e => { if (!dimmed) e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isInst ? C.borderAccent : "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: C.rx, background: C.raised, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: `1px solid ${C.border}`, flexShrink: 0 }}>
                      {s.icon ?? "\u{1F9E9}"}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.name}</div>
                      <div style={{ fontSize: 9, color: C.dim }}>{s.author.name} {s.author.verified ? "\u2713" : ""} &middot; v{s.version}</div>
                    </div>
                    {isInst && <Pill bg={C.okSoft} color={C.ok}>Installed</Pill>}
                  </div>

                  <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {s.summary}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <TrustBadge tier={s.trust.tier} score={s.trust.trust_score} />
                    {s.trust.code_audited && <Pill bg={C.okSoft} color={C.ok}>Vetted</Pill>}
                    <span style={{ flex: 1 }} />
                    <VoteButtons skill={s} votes={votes} onVote={onVote} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ fontSize: 9, color: C.muted }}>{s.trust.install_count.toLocaleString()} installs</span>
                    <span style={{ fontSize: 9, color: C.muted }}>{s.license}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SkillDetailModal
        skill={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        isInstalled={selected ? installedIds.has(selected.id) : false}
        onInstall={() => { if (selected) { installSkill(selected.id); setSelected(null); } }}
        onRemove={() => { if (selected) { removeSkill(selected.id); setSelected(null); } }}
      />
    </div>
  );
}
