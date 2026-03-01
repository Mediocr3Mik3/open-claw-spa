/**
 * openclaw-spa — Dashboard View
 *
 * At-a-glance system health: security posture, gateway status, active model,
 * auth metrics, cost tracking, and quick-access navigation.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Sec, StatCard, ProgressBar, Empty, Spinner } from "./shared";
import type { View, KeyInfo, SetupDetection } from "./shared";

export default function DashboardView({ onNav, gwOn, brOn, keys }: { onNav: (v: View | "settings", sub?: string) => void; gwOn: boolean; brOn: boolean; keys: KeyInfo[] }) {
  const [det, setDet] = useState<SetupDetection | null>(null);
  const [prov, setProv] = useState<any>(null);
  const [spend, setSpend] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [auditStats, setAuditStats] = useState<Record<string, number>>({});
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [gateCount, setGateCount] = useState(0);
  const [alerts, setAlerts] = useState<{ type: string; message: string; color: string; action?: () => void }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adapterStatuses, setAdapterStatuses] = useState<{ name: string; ok: boolean }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, p, s, dy, as2, ch, gs] = await Promise.all([
          window.spa.autoSetup.detect().catch(() => null),
          window.spa.llm.status().catch(() => null),
          window.spa.spend.budget().catch(() => null),
          window.spa.spend.daily(7).catch(() => []),
          window.spa.audit.stats().catch(() => ({})),
          window.spa.audit.verifyChain().catch(() => null),
          window.spa.gates.list().catch(() => []),
        ]);
        setDet(d); setProv(p); setSpend(s); setDaily(dy as any[]); setAuditStats(as2 as Record<string, number>);
        setChainOk(ch === null); setGateCount((gs as any[]).length);

        // Check adapter statuses
        const adapterKeys = [
          { name: "WhatsApp", key: "WHATSAPP_API_TOKEN" }, { name: "Telegram", key: "TELEGRAM_BOT_TOKEN" },
          { name: "Discord", key: "DISCORD_BOT_TOKEN" }, { name: "Slack", key: "SLACK_BOT_TOKEN" },
          { name: "Signal", key: "SIGNAL_API_URL" }, { name: "iMessage", key: "IMESSAGE_ENABLED" },
        ];
        const statuses = await Promise.all(adapterKeys.map(async a => ({ name: a.name, ok: await window.spa.config.has(a.key).catch(() => false) })));
        setAdapterStatuses(statuses);

        const a: typeof alerts = [];
        if (ch !== null) a.push({ type: "security", message: "Audit chain integrity compromised", color: C.err, action: () => onNav("authorization") });
        if ((as2 as any)?.intrusion_alert > 0) a.push({ type: "intrusion", message: `${(as2 as any).intrusion_alert} intrusion alert(s)`, color: C.err, action: () => onNav("authorization") });
        if (!keys.some(k => k.active)) a.push({ type: "keys", message: "No active signing key — prompts won't be signed", color: C.warn, action: () => onNav("keys") });
        if ((s as any)?.budget_percent >= ((s as any)?.warn_at_percent ?? 80)) a.push({ type: "budget", message: `Budget at ${Math.round((s as any).budget_percent)}%`, color: C.warn });
        setAlerts(a);
      } catch {}
      setLoading(false);
    };
    load();
  }, [keys]);

  const hasLLM = prov?.provider_id;
  const hasRT = det && det.runtimes.length > 0;
  const activeKey = keys.find(k => k.active);
  const totalVerified = auditStats.envelope_verified ?? 0;
  const totalRejected = auditStats.envelope_rejected ?? 0;
  const verifyRate = totalVerified + totalRejected > 0 ? Math.round((totalVerified / (totalVerified + totalRejected)) * 100) : 100;
  const budgetPercent = (spend as any)?.budget_percent ?? 0;
  const monthlyLimit = (spend as any)?.monthly_limit_usd ?? 0;
  const totalSpent = monthlyLimit * budgetPercent / 100;
  const configuredAdapters = adapterStatuses.filter(a => a.ok).length;

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner size={28} /></div>;

  return (
    <div style={{ padding: "18px 28px 28px", overflowY: "auto" as const, flex: 1, animation: "fadeIn .25s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2, letterSpacing: -0.3 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: C.dim }}>System health at a glance</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", ...glass(0), borderRadius: C.rs }}>
            <Dot color={gwOn ? C.ok : C.muted} pulse={gwOn} size={6} /><span style={{ fontSize: 10, color: C.dim }}>Gateway</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", ...glass(0), borderRadius: C.rs }}>
            <Dot color={brOn ? C.ok : C.muted} pulse={brOn} size={6} /><span style={{ fontSize: 10, color: C.dim }}>Bridge</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", ...glass(0), borderRadius: C.rs }}>
            <Dot color={chainOk ? C.ok : chainOk === false ? C.err : C.muted} size={6} /><span style={{ fontSize: 10, color: C.dim }}>Chain</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {alerts.map((a, i) => (
            <div key={i} onClick={a.action} style={{ ...glass(1), padding: "9px 14px", marginBottom: 5, borderLeft: `3px solid ${a.color}`, display: "flex", alignItems: "center", gap: 8, cursor: a.action ? "pointer" : "default", borderRadius: C.rs }}>
              <Dot color={a.color} size={6} />
              <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{a.message}</span>
              <Pill bg={a.color + "15"} color={a.color}>{a.type}</Pill>
            </div>
          ))}
        </div>
      )}

      {/* ── Quick Actions ── */}
      <Sec>Quick Actions</Sec>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Chat", sub: "Send signed messages", icon: "&#128172;", action: () => onNav("chat") },
          { label: "Models", sub: "Switch or configure LLM", icon: "&#129302;", action: () => onNav("settings", "llm") },
          { label: "Adapters", sub: "Connect messaging services", icon: "&#128268;", action: () => onNav("settings", "adapters") },
          { label: "Audit", sub: "Review security events", icon: "&#128203;", action: () => onNav("authorization") },
        ].map(q => (
          <button key={q.label} onClick={q.action} style={{ ...glass(1), padding: 16, textAlign: "left" as const, cursor: "pointer", display: "flex", gap: 10, alignItems: "center", borderRadius: C.r, transition: "all .12s" }}>
            <span style={{ fontSize: 18, opacity: .4 }} dangerouslySetInnerHTML={{ __html: q.icon }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 1 }}>{q.label}</div>
              <div style={{ fontSize: 10, color: C.dim }}>{q.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Security Posture ── */}
      <Sec>Security Posture</Sec>
      <div style={{ ...glass(0), padding: 18, marginBottom: 20, borderRadius: C.r }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
          <div onClick={() => onNav("keys")} style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Dot color={activeKey ? C.ok : C.warn} size={7} />
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Signing Key</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: activeKey ? C.text : C.warn }}>{activeKey ? activeKey.label : "None active"}</div>
            {activeKey && <div style={{ fontSize: 10, color: C.muted, fontFamily: C.mono, marginTop: 2 }}>{activeKey.key_id.slice(0, 16)}...</div>}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Dot color={C.ok} size={7} />
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Encryption</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>AES-256-GCM</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>OS Keychain backed</div>
          </div>
          <div onClick={() => onNav("authorization")} style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Dot color={chainOk ? C.ok : C.err} size={7} />
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Audit Chain</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: chainOk ? C.ok : C.err }}>{chainOk ? "Intact" : "Broken"}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{totalVerified + totalRejected} events</div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Dot color={verifyRate >= 95 ? C.ok : verifyRate >= 80 ? C.warn : C.err} size={7} />
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>Verify Rate</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{verifyRate}%</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>ECDSA P-384</div>
          </div>
        </div>
      </div>

      {/* ── Onboarding CTA ── */}
      {(!hasLLM || !hasRT) && (
        <div style={{ ...glass(1), padding: 18, marginBottom: 20, background: C.gradSoft, borderColor: C.borderAccent, borderRadius: C.r }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>&#9889;</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Get Started</div>
              <div style={{ fontSize: 11, color: C.dim }}>{!hasRT ? "Install a local runtime to run models privately." : "Connect an LLM provider to start chatting."}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!hasRT && <Btn onClick={() => onNav("settings", "llm")} style={{ fontSize: 12 }}>Set Up Runtime</Btn>}
            {!hasLLM && <Btn onClick={() => onNav("settings", "llm")} v={!hasRT ? "g" : "p"} style={{ fontSize: 12 }}>Configure Provider</Btn>}
          </div>
        </div>
      )}

      {/* ── Status Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Active Model" value={prov?.model_id ?? "None"} sub={prov?.provider_id ?? "No provider"} color={hasLLM ? C.ok : C.muted} pulse={!!hasLLM} onClick={() => onNav("settings", "llm")} />
        <StatCard label="Bridge" value={brOn ? "Running" : "Stopped"} sub={`Gateway: ${gwOn ? "Connected" : "Off"}`} color={brOn ? C.ok : C.muted} pulse={brOn} onClick={() => onNav("settings", "general")} />
        <StatCard label="Signing Keys" value={keys.length} sub={`${gateCount} gated actions`} color={keys.length > 0 ? C.ok : C.warn} onClick={() => onNav("keys")} />
        <StatCard label="Adapters" value={`${configuredAdapters}/${adapterStatuses.length}`} sub={brOn ? "Bridge active" : "Bridge stopped"} color={configuredAdapters > 0 ? C.ok : C.muted} onClick={() => onNav("settings", "adapters")} />
      </div>

      {/* ── Connected Services ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        {/* Messaging Adapters */}
        <div>
          <Sec right={<button onClick={() => onNav("settings", "adapters")} style={{ background: "none", border: "none", color: C.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Configure &rarr;</button>}>Messaging</Sec>
          <div style={{ ...glass(0), padding: 14, borderRadius: C.r }}>
            {adapterStatuses.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: 12, color: C.muted, fontSize: 11 }}>Loading...</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                {adapterStatuses.map(a => (
                  <div key={a.name} onClick={() => onNav("settings", "adapters")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: a.ok ? C.okSoft : "rgba(255,255,255,0.02)", border: `1px solid ${a.ok ? "rgba(52,211,153,0.15)" : C.border}`, cursor: "pointer", transition: "all .1s" }}>
                    <Dot color={a.ok ? C.ok : C.muted} size={5} />
                    <span style={{ fontSize: 11, color: a.ok ? C.text : C.muted }}>{a.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cost Tracking */}
        <div>
          <Sec right={monthlyLimit > 0 ? <span style={{ fontSize: 10, color: C.dim }}>${totalSpent.toFixed(2)} / ${monthlyLimit}</span> : undefined}>Spend</Sec>
          <div style={{ ...glass(0), padding: 14, borderRadius: C.r }}>
            {monthlyLimit > 0 ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>${totalSpent.toFixed(2)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: budgetPercent >= 90 ? C.err : budgetPercent >= 70 ? C.warn : C.ok }}>{Math.round(budgetPercent)}%</span>
                </div>
                <ProgressBar percent={budgetPercent} height={4} />
                {daily.length > 0 && (
                  <div style={{ display: "flex", gap: 3, marginTop: 12, alignItems: "flex-end", height: 36 }}>
                    {daily.map((d: any, i: number) => {
                      const maxCost = Math.max(...daily.map((x: any) => x.total_cost_usd ?? 0), 0.01);
                      const h = Math.max(((d.total_cost_usd ?? 0) / maxCost) * 32, 2);
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2 }}>
                          <div style={{ width: "100%", height: h, background: C.accent, borderRadius: 2, opacity: .6 }} />
                          <span style={{ fontSize: 7, color: C.muted }}>{d.date?.slice(5) ?? ""}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center" as const, padding: 8, color: C.muted, fontSize: 11 }}>No budget configured. <span onClick={() => onNav("settings", "llm")} style={{ color: C.accent, cursor: "pointer" }}>Set up &rarr;</span></div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
