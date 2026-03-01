/**
 * openclaw-spa — Dashboard View
 *
 * At-a-glance system health: gateway status, active model, auth metrics,
 * cost tracking, recent activity timeline, and onboarding CTAs.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Sec, StatCard, ProgressBar, Empty, Spinner } from "./shared";
import type { View, SetupDetection } from "./shared";

export default function DashboardView({ onNav, gwOn, brOn }: { onNav: (v: View) => void; gwOn: boolean; brOn: boolean }) {
  const [det, setDet] = useState<SetupDetection | null>(null);
  const [prov, setProv] = useState<any>(null);
  const [spend, setSpend] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [auditStats, setAuditStats] = useState<Record<string, number>>({});
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [keyCount, setKeyCount] = useState(0);
  const [gateCount, setGateCount] = useState(0);
  const [alerts, setAlerts] = useState<{ type: string; message: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, p, s, dy, as2, ch, ks, gs] = await Promise.all([
          window.spa.autoSetup.detect().catch(() => null),
          window.spa.llm.status().catch(() => null),
          window.spa.spend.budget().catch(() => null),
          window.spa.spend.daily(7).catch(() => []),
          window.spa.audit.stats().catch(() => ({})),
          window.spa.audit.verifyChain().catch(() => null),
          window.spa.listKeys().catch(() => []),
          window.spa.gates.list().catch(() => []),
        ]);
        setDet(d); setProv(p); setSpend(s); setDaily(dy as any[]); setAuditStats(as2 as Record<string, number>);
        setChainOk(ch === null); setKeyCount((ks as any[]).length); setGateCount((gs as any[]).length);

        // Build alerts
        const a: { type: string; message: string; color: string }[] = [];
        if (ch !== null) a.push({ type: "security", message: "Audit chain integrity broken!", color: C.err });
        if ((as2 as any)?.intrusion_alert > 0) a.push({ type: "security", message: `${(as2 as any).intrusion_alert} intrusion alert(s) detected`, color: C.err });
        if ((as2 as any)?.rate_limit_hit > 0) a.push({ type: "rate_limit", message: `${(as2 as any).rate_limit_hit} rate limit hit(s)`, color: C.warn });
        if ((s as any)?.warn_at_percent && (s as any)?.budget_percent >= (s as any).warn_at_percent) {
          a.push({ type: "budget", message: `Budget at ${Math.round((s as any).budget_percent)}% of monthly limit`, color: C.warn });
        }
        if (!(ks as any[]).some((k: any) => k.active)) a.push({ type: "keys", message: "No active signing keys", color: C.warn });
        setAlerts(a);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const hasLLM = prov?.provider_id;
  const hasRT = det && det.runtimes.length > 0;
  const totalVerified = (auditStats.envelope_verified ?? 0);
  const totalRejected = (auditStats.envelope_rejected ?? 0);
  const verifyRate = totalVerified + totalRejected > 0 ? Math.round((totalVerified / (totalVerified + totalRejected)) * 100) : 100;
  const budgetPercent = (spend as any)?.budget_percent ?? 0;
  const monthlyLimit = (spend as any)?.monthly_limit_usd ?? 0;
  const totalSpent = monthlyLimit * budgetPercent / 100;

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner size={28} /></div>;

  return (
    <div style={{ padding: 28, overflowY: "auto" as const, flex: 1, animation: "fadeIn .3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: C.dim }}>Your AI command center.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", ...glass(0) }}>
            <Dot color={gwOn ? C.ok : C.err} pulse={gwOn} />
            <span style={{ fontSize: 11, color: C.dim }}>Gateway</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", ...glass(0) }}>
            <Dot color={chainOk ? C.ok : chainOk === false ? C.err : C.muted} />
            <span style={{ fontSize: 11, color: C.dim }}>Chain</span>
          </div>
        </div>
      </div>

      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <div style={{ marginTop: 18, marginBottom: 22 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ ...glass(1), padding: "10px 16px", marginBottom: 6, borderLeft: `3px solid ${a.color}`, display: "flex", alignItems: "center", gap: 10 }}>
              <Dot color={a.color} />
              <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{a.message}</span>
              <Pill bg={a.color + "18"} color={a.color}>{a.type}</Pill>
            </div>
          ))}
        </div>
      )}

      {/* Onboarding CTA */}
      {(!hasLLM || !hasRT) && (
        <div style={{ ...glass(1), padding: 22, marginTop: alerts.length ? 0 : 18, marginBottom: 22, background: C.gradSoft, borderColor: C.borderAccent, animation: "glow 3s ease-in-out infinite" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>&#9889;</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Get Started</div>
              <div style={{ fontSize: 12, color: C.dim }}>{!hasRT ? "Install a local runtime to run models." : "Connect an LLM provider to start chatting."}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!hasRT && <Btn onClick={() => onNav("settings")}>Set Up Runtime</Btn>}
            {!hasLLM && <Btn onClick={() => onNav("settings")} v={!hasRT ? "g" : "p"}>Configure Provider</Btn>}
          </div>
        </div>
      )}

      {/* Status Cards Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 22, marginTop: 18 }}>
        <StatCard label="Active Model" value={prov?.model_id ?? "None"} sub={prov?.provider_id ?? "No provider"} color={hasLLM ? C.ok : C.muted} pulse={!!hasLLM} onClick={() => onNav("settings")} />
        <StatCard label="Bridge" value={brOn ? "Running" : "Stopped"} sub={`Gateway: ${gwOn ? "Connected" : "Off"}`} color={brOn ? C.ok : C.err} pulse={brOn} />
        <StatCard label="Signing Keys" value={keyCount} sub={`${gateCount} gated actions`} color={keyCount > 0 ? C.ok : C.warn} onClick={() => onNav("keys")} />
        <StatCard label="Verification" value={`${verifyRate}%`} sub={`${totalVerified + totalRejected} total checks`} color={verifyRate >= 95 ? C.ok : verifyRate >= 80 ? C.warn : C.err} onClick={() => onNav("audit")} />
      </div>

      {/* Cost & Budget */}
      {monthlyLimit > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Sec>Cost Tracking</Sec>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>${totalSpent.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: C.dim }}>of ${monthlyLimit.toFixed(2)} monthly budget</div>
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: budgetPercent >= 90 ? C.err : budgetPercent >= 70 ? C.warn : C.ok }}>{Math.round(budgetPercent)}%</div>
                <div style={{ fontSize: 10, color: C.dim }}>used</div>
              </div>
            </div>
            <ProgressBar percent={budgetPercent} />
            {daily.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 14, alignItems: "flex-end", height: 50 }}>
                {daily.map((d: any, i: number) => {
                  const maxCost = Math.max(...daily.map((x: any) => x.total_cost_usd ?? 0), 0.01);
                  const h = Math.max(((d.total_cost_usd ?? 0) / maxCost) * 44, 2);
                  return (
                    <div key={i} className="oc-tooltip" data-tip={`$${(d.total_cost_usd ?? 0).toFixed(3)}`} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3 }}>
                      <div style={{ width: "100%", height: h, background: C.accent, borderRadius: 3, opacity: .7 }} />
                      <span style={{ fontSize: 8, color: C.muted }}>{d.date?.slice(5) ?? ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Auth Activity Stats */}
      {Object.keys(auditStats).length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Sec>Authorization Activity</Sec>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {Object.entries(auditStats).map(([k, v]) => (
              <div key={k} style={{ ...glass(1), padding: "10px 14px", minWidth: 100 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: (C as any)[k] ?? C.dim }}>{v}</div>
                <div style={{ fontSize: 9, color: C.dim, textTransform: "capitalize" as const, marginTop: 2 }}>{k.replace(/_/g, " ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hardware */}
      {det && (
        <div style={{ marginBottom: 22 }}>
          <Sec>Hardware</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            <div style={{ ...glass(1), padding: 14 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>CPU</div><div style={{ fontSize: 13 }}>{det.hardware.cpu}</div></div>
            <div style={{ ...glass(1), padding: 14 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>Memory</div><div style={{ fontSize: 13 }}>{det.hardware.ram_gb} GB</div></div>
            {det.hardware.gpus.map((g, i) => (
              <div key={i} style={{ ...glass(1), padding: 14 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>GPU</div><div style={{ fontSize: 13 }}>{g.name}</div><div style={{ fontSize: 11, color: C.dim }}>{g.vram_gb} GB VRAM</div></div>
            ))}
            <div style={{ ...glass(1), padding: 14 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 4 }}>Runtimes</div><div style={{ fontSize: 13, color: det.runtimes.length ? C.ok : C.warn }}>{det.runtimes.length ? det.runtimes.map((r: any) => r.name).join(", ") : "None"}</div></div>
          </div>
        </div>
      )}

      {/* Quick Navigation */}
      <Sec>Quick Actions</Sec>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {[
          { view: "chat" as View, label: "Start Chatting", sub: "Send signed messages to your agent", icon: "&#128172;" },
          { view: "keys" as View, label: "Manage Keys", sub: "Generate, rotate, or revoke signing keys", icon: "&#128273;" },
          { view: "gates" as View, label: "Action Gates", sub: "Configure authorization requirements", icon: "&#128737;" },
          { view: "audit" as View, label: "Audit Trail", sub: "Review security events and chain integrity", icon: "&#128203;" },
        ].map(q => (
          <button key={q.view} onClick={() => onNav(q.view)} style={{ ...glass(1), padding: 18, textAlign: "left" as const, cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 22, opacity: .5 }} dangerouslySetInnerHTML={{ __html: q.icon }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{q.label}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{q.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
