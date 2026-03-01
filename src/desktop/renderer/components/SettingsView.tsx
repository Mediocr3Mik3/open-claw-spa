/**
 * openclaw-spa — Enhanced Settings View
 *
 * Sections: Gateway, Bridge, LLM/Models, API Vault, Spend/Budget,
 * Messaging Adapters, Organization, Encrypted Config.
 */

import React, { useState, useEffect } from "react";
import { C, glass, Dot, Pill, Card, Btn, Input, Sec, Empty, Modal, SubTabs, ProgressBar, Spinner } from "./shared";
import type { BridgeLog, ModelInfo } from "./shared";

// ─── Adapter Card (clickable, inline config) ─────────────────────────────

function AdapterCard({ name, cfgKey, brOn }: { name: string; cfgKey: string; brOn: boolean }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { window.spa.config.has(cfgKey).then(setOk); }, [cfgKey]);

  const save = async () => {
    if (!val.trim()) return;
    setSaving(true);
    await window.spa.config.set(cfgKey, val.trim());
    setVal(""); setOk(true); setOpen(false); setSaving(false);
  };

  const remove = async () => {
    await window.spa.config.delete(cfgKey);
    setOk(false);
  };

  return (
    <div style={{ ...glass(1), borderRadius: C.rs, overflow: "hidden", borderLeft: `3px solid ${ok ? C.ok : C.border}`, transition: "all .15s" }}>
      <div onClick={() => setOpen(!open)} style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <Dot color={ok ? C.ok : C.muted} size={7} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 10, color: ok ? C.ok : C.muted }}>{ok == null ? "..." : ok ? "Configured" : "Not set"}</div>
        </div>
        <span style={{ fontSize: 9, color: C.muted, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}>&#9660;</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 12px", animation: "fadeIn .15s ease" }}>
          <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono, marginBottom: 6 }}>{cfgKey}</div>
          {ok ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, fontSize: 11, color: C.ok, display: "flex", alignItems: "center", gap: 4 }}>
                <span>&#10003;</span> Token saved (encrypted)
              </div>
              <Btn v="d" onClick={remove} style={{ padding: "3px 10px", fontSize: 10 }}>Remove</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <Input value={val} onChange={setVal} placeholder={`Enter ${name} token...`} type="password" style={{ flex: 1, fontSize: 11, padding: "7px 10px" }} onKeyDown={e => e.key === "Enter" && save()} />
              <Btn onClick={save} disabled={saving} style={{ padding: "6px 14px", fontSize: 11 }}>{saving ? "..." : "Save"}</Btn>
            </div>
          )}
          {!brOn && ok && <div style={{ fontSize: 10, color: C.warn, marginTop: 6 }}>Start the Bridge to activate this adapter.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Model Card (clickable, shows setup info) ────────────────────────────

function ModelCard({ m, isActive, onSwitch, vaultKeys }: { m: ModelInfo; isActive: boolean; onSwitch: () => void; vaultKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const local = ["ollama", "llama.cpp", "lm-studio"].includes(m.provider_id);
  const providerKeyMap: Record<string, string> = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", groq: "GROQ_API_KEY" };
  const neededKey = providerKeyMap[m.provider_id];
  const hasKey = neededKey ? vaultKeys.includes(neededKey) : true;

  return (
    <div style={{ ...glass(1), borderRadius: C.rs, overflow: "hidden", borderColor: isActive ? C.borderAccent : undefined, transition: "all .12s" }}>
      <div onClick={() => setOpen(!open)} style={{ padding: 14, cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? C.accent : C.text }}>{m.label}</span>
          <Pill bg={local ? C.okSoft : C.accentSoft} color={local ? C.ok : C.accent}>{m.provider_id}</Pill>
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 10, color: C.dim }}>
          {m.parameter_count_b && <span>{m.parameter_count_b}B</span>}
          {m.context_window && <span>{(m.context_window / 1000).toFixed(0)}k ctx</span>}
          {m.estimated_cost_per_1k_input != null && <span>${m.estimated_cost_per_1k_input}/1k</span>}
        </div>
        {m.strengths && m.strengths.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" as const }}>{m.strengths.slice(0, 3).map(s => <Pill key={s}>{s}</Pill>)}</div>}
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}`, animation: "fadeIn .15s ease" }}>
          <div style={{ paddingTop: 10, display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {local ? (
              <>
                <div style={{ fontSize: 11, color: C.dim }}>Local model — no API key needed. Requires a running runtime ({m.provider_id}).</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn onClick={onSwitch} style={{ fontSize: 11, padding: "6px 14px" }}>{isActive ? "Active" : "Use This Model"}</Btn>
                  <Btn v="g" onClick={() => window.spa.runtime.openDownload(m.provider_id)} style={{ fontSize: 11, padding: "6px 14px" }}>Download Runtime</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Dot color={hasKey ? C.ok : C.warn} size={6} />
                  <span style={{ fontSize: 11, color: hasKey ? C.ok : C.warn }}>{neededKey}: {hasKey ? "Configured" : "Missing"}</span>
                </div>
                {!hasKey && <div style={{ fontSize: 11, color: C.dim }}>Add your <strong style={{ color: C.text }}>{neededKey}</strong> in the API Key Vault above to use this model.</div>}
                <Btn onClick={onSwitch} disabled={!hasKey} style={{ fontSize: 11, padding: "6px 14px" }}>{isActive ? "Active" : hasKey ? "Use This Model" : "API Key Required"}</Btn>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Settings View ──────────────────────────────────────────────────

export default function SettingsView({ gwOn, brOn, gwUrl, setGwUrl, configKeys, setConfigKeys, initialSub }: {
  gwOn: boolean; brOn: boolean; gwUrl: string; setGwUrl: (v: string) => void;
  configKeys: string[]; setConfigKeys: (k: string[]) => void; initialSub?: string;
}) {
  const [sub, setSub] = useState(initialSub ?? "general");
  const [nk, setNk] = useState(""); const [nv, setNv] = useState("");
  const [orgs, setOrgs] = useState<any[]>([]);
  const [logs, setLogs] = useState<BridgeLog[]>([]);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelFilter, setModelFilter] = useState<"all" | "local" | "api">("all");
  const [modelSearch, setModelSearch] = useState("");
  const [runtimes, setRuntimes] = useState<any[]>([]);
  const [vaultKeys, setVaultKeys] = useState<string[]>([]);
  const [vkName, setVkName] = useState(""); const [vkVal, setVkVal] = useState("");
  const [prov, setProv] = useState<any>(null);
  const [spend, setSpend] = useState<any>(null);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetWarn, setBudgetWarn] = useState("");

  useEffect(() => { if (initialSub) setSub(initialSub); }, [initialSub]);

  useEffect(() => {
    if (sub === "org") window.spa.org.list().then(setOrgs).catch(() => {});
    if (sub === "llm") {
      window.spa.models.all().then((m: any) => setModels(m));
      window.spa.runtime.detect().then((r: any) => setRuntimes(r));
      window.spa.vault.configuredProviders().then(setVaultKeys);
      window.spa.llm.status().then(setProv).catch(() => {});
      window.spa.spend.budget().then((b: any) => {
        setSpend(b);
        setBudgetLimit(String(b?.monthly_limit_usd ?? 50));
        setBudgetWarn(String(b?.warn_at_percent ?? 80));
      }).catch(() => {});
    }
    window.spa.bridge.onLog((l: any) => setLogs(p => [...p.slice(-99), { ...l, timestamp: new Date().toISOString() }]));
  }, [sub]);

  const saveConfig = async () => {
    if (!nk.trim()) return;
    await window.spa.config.set(nk.trim(), nv); setNk(""); setNv("");
    setConfigKeys(await window.spa.config.keys());
  };

  const saveVaultKey = async () => {
    if (!vkName.trim() || !vkVal.trim()) return;
    const r = await window.spa.vault.setKey(vkName.trim(), vkVal.trim());
    if (r.warning) alert(r.warning);
    setVkName(""); setVkVal("");
    setVaultKeys(await window.spa.vault.configuredProviders());
  };

  const switchModel = async (m: ModelInfo) => {
    try { await window.spa.llm.switch({ provider_id: m.provider_id, model_id: m.id }); setProv(await window.spa.llm.status()); } catch (e) { alert(`Failed: ${e}`); }
  };

  const saveBudget = async () => {
    try {
      await window.spa.spend.setBudget({ monthly_limit_usd: parseFloat(budgetLimit) || 50, warn_at_percent: parseInt(budgetWarn) || 80 });
      setSpend(await window.spa.spend.budget());
    } catch (e) { alert(`Failed: ${e}`); }
  };

  const filteredModels = models.filter(m => {
    const local = ["ollama", "llama.cpp", "lm-studio"].includes(m.provider_id);
    if (modelFilter === "local" && !local) return false;
    if (modelFilter === "api" && local) return false;
    if (modelSearch && !m.label.toLowerCase().includes(modelSearch.toLowerCase())) return false;
    return true;
  });

  const TABS = [
    { id: "general", label: "General" },
    { id: "llm", label: "LLM & Models" },
    { id: "adapters", label: "Messaging" },
    { id: "org", label: "Organization" },
  ];

  const ADAPTERS = [
    { name: "WhatsApp", key: "WHATSAPP_API_TOKEN" }, { name: "Signal", key: "SIGNAL_API_URL" }, { name: "Telegram", key: "TELEGRAM_BOT_TOKEN" },
    { name: "Discord", key: "DISCORD_BOT_TOKEN" }, { name: "iMessage", key: "IMESSAGE_ENABLED" }, { name: "Slack", key: "SLACK_BOT_TOKEN" },
    { name: "SMS/Twilio", key: "TWILIO_ACCOUNT_SID" }, { name: "Email", key: "EMAIL_IMAP_HOST" }, { name: "Teams", key: "TEAMS_APP_ID" },
    { name: "Matrix", key: "MATRIX_HOMESERVER_URL" }, { name: "IRC", key: "IRC_SERVER" }, { name: "Messenger", key: "MESSENGER_PAGE_ACCESS_TOKEN" },
    { name: "Google Chat", key: "GOOGLE_CHAT_SA_PATH" }, { name: "X (Twitter)", key: "X_BEARER_TOKEN" }, { name: "LINE", key: "LINE_CHANNEL_ACCESS_TOKEN" },
    { name: "WeChat", key: "WECHAT_APP_ID" }, { name: "Webhook", key: "WEBHOOK_REPLY_URL" },
  ];

  return (
    <div style={{ padding: "18px 28px 28px", overflowY: "auto" as const, flex: 1, animation: "fadeIn .2s ease" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2, letterSpacing: -0.3 }}>Settings</h1>
      <p style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>Configuration, providers, adapters, and organization.</p>

      <SubTabs tabs={TABS} active={sub} onChange={setSub} />

      {/* ─── General ──────────────────────────────────────────────── */}
      {sub === "general" && (<>
        <Sec>Gateway Connection</Sec>
        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          <Input value={gwUrl} onChange={setGwUrl} placeholder="ws://localhost:3210/ws" style={{ flex: 1 }} />
          <Btn onClick={() => window.spa.connectGateway(gwUrl)}>Connect</Btn>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", ...glass(0), borderRadius: C.rs }}><Dot color={gwOn ? C.ok : C.muted} size={6} /><span style={{ fontSize: 11, color: C.dim }}>{gwOn ? "Connected" : "Off"}</span></div>
        </div>

        <Sec>Messaging Bridge</Sec>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", ...glass(0), borderRadius: C.rs }}><Dot color={brOn ? C.ok : C.muted} pulse={brOn} size={6} /><span style={{ fontSize: 12 }}>{brOn ? "Running" : "Stopped"}</span></div>
          <Btn v="g" onClick={() => brOn ? window.spa.bridge.stop() : window.spa.bridge.start()}>{brOn ? "Stop" : "Start"}</Btn>
        </div>
        {logs.length > 0 && (
          <div style={{ ...glass(0), padding: 10, maxHeight: 140, overflowY: "auto" as const, fontFamily: C.mono, fontSize: 11, marginBottom: 22, borderRadius: C.rs }}>
            {logs.slice(-20).map((l, i) => <div key={i} style={{ padding: "2px 0", color: l.level === "error" ? C.err : C.dim }}><span style={{ color: C.muted, fontSize: 9 }}>{new Date(l.timestamp).toLocaleTimeString()}</span> {l.message}</div>)}
          </div>
        )}

        <Sec>Encrypted Config</Sec>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>AES-256-GCM encrypted, OS keychain backed.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Input value={nk} onChange={setNk} placeholder="Key name" style={{ flex: 1 }} />
          <Input value={nv} onChange={setNv} placeholder="Value" type="password" style={{ flex: 1 }} />
          <Btn onClick={saveConfig}>Save</Btn>
        </div>
        <div style={{ ...glass(0), overflow: "hidden", borderRadius: C.rs }}>
          {configKeys.length === 0 && <div style={{ padding: 16, textAlign: "center" as const, color: C.muted, fontSize: 11 }}>No entries.</div>}
          {configKeys.map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: C.mono, fontSize: 11 }}>{k}</span>
              <Btn v="d" onClick={async () => { await window.spa.config.delete(k); setConfigKeys(await window.spa.config.keys()); }} style={{ padding: "2px 8px", fontSize: 9 }}>Delete</Btn>
            </div>
          ))}
        </div>
      </>)}

      {/* ─── LLM & Models ─────────────────────────────────────────── */}
      {sub === "llm" && (<>
        {prov?.model_id && (
          <Card style={{ marginBottom: 18, borderColor: C.borderAccent }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.ok} pulse /><span style={{ fontSize: 12, color: C.dim }}>Active:</span><span style={{ fontSize: 14, fontWeight: 600 }}>{prov.model_id}</span><Pill bg={C.accentSoft} color={C.accent}>{prov.provider_id}</Pill></div>
          </Card>
        )}

        <Sec>API Key Vault</Sec>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>Encrypted with AES-256-GCM, backed by OS keychain. Required for cloud providers.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Input value={vkName} onChange={setVkName} placeholder="Key name (e.g. OPENAI_API_KEY)" style={{ flex: 1 }} />
          <Input value={vkVal} onChange={setVkVal} placeholder="Value" type="password" style={{ flex: 1 }} />
          <Btn onClick={saveVaultKey}>Save</Btn>
        </div>
        <div style={{ ...glass(0), overflow: "hidden", marginBottom: 20, borderRadius: C.rs }}>
          {vaultKeys.length === 0 && <div style={{ padding: 16, textAlign: "center" as const, color: C.muted, fontSize: 11 }}>No API keys yet. Add one to use cloud models.</div>}
          {vaultKeys.map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Dot color={C.ok} size={6} /><span style={{ fontFamily: C.mono, fontSize: 12 }}>{k}</span></div>
              <Btn v="d" onClick={async () => { await window.spa.vault.removeKey(k); setVaultKeys(await window.spa.vault.configuredProviders()); }} style={{ padding: "3px 10px", fontSize: 10 }}>Remove</Btn>
            </div>
          ))}
        </div>

        <Sec>Spend Budget</Sec>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: C.dim, display: "block", marginBottom: 4 }}>Monthly Limit (USD)</label><Input value={budgetLimit} onChange={setBudgetLimit} type="number" /></div>
          <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: C.dim, display: "block", marginBottom: 4 }}>Warn at (%)</label><Input value={budgetWarn} onChange={setBudgetWarn} type="number" /></div>
          <div style={{ alignSelf: "flex-end" }}><Btn onClick={saveBudget}>Update</Btn></div>
        </div>
        {spend && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.dim }}>Current usage</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: (spend as any).budget_percent >= 90 ? C.err : (spend as any).budget_percent >= 70 ? C.warn : C.ok }}>{Math.round((spend as any).budget_percent ?? 0)}%</span>
            </div>
            <ProgressBar percent={(spend as any).budget_percent ?? 0} />
          </Card>
        )}

        <Sec>Model Browser</Sec>
        <p style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>Click a model to see setup details, switch to it, or configure its API key.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Input value={modelSearch} onChange={setModelSearch} placeholder="Search models..." style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2, background: C.surface, borderRadius: C.rs, padding: 3, border: `1px solid ${C.border}` }}>
            {(["all", "local", "api"] as const).map(f => (
              <button key={f} onClick={() => setModelFilter(f)} style={{ padding: "6px 12px", borderRadius: 5, border: "none", background: modelFilter === f ? C.accentSoft : "transparent", color: modelFilter === f ? C.accent : C.dim, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, transition: "all .1s" }}>{f}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 22 }}>
          {filteredModels.map(m => (
            <ModelCard key={m.id} m={m} isActive={prov?.model_id === m.id} onSwitch={() => switchModel(m)} vaultKeys={vaultKeys} />
          ))}
          {filteredModels.length === 0 && <div style={{ gridColumn: "1/-1" }}><Empty icon="&#128269;" title="No models" sub="Try different search or filter." /></div>}
        </div>

        <Sec>Local Runtimes</Sec>
        {runtimes.length === 0 ? (
          <Card style={{ marginBottom: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.warn} size={6} /><span style={{ fontSize: 12 }}>No local runtimes detected.</span></div></Card>
        ) : runtimes.map((r: any) => (
          <Card key={r.name} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot color={C.ok} pulse size={6} /><div><div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 10, color: C.dim }}>{r.version ?? "detected"}</div></div></div>
              <div style={{ display: "flex", gap: 6 }}><Btn v="g" onClick={() => window.spa.runtime.start(r.name)} style={{ padding: "5px 12px", fontSize: 11 }}>Start</Btn><Btn v="d" onClick={() => window.spa.runtime.stop(r.name)} style={{ padding: "5px 12px", fontSize: 11 }}>Stop</Btn></div>
            </div>
          </Card>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
          {[{ n: "Ollama", id: "ollama", d: "Easy local inference" }, { n: "LM Studio", id: "lm-studio", d: "GUI model manager" }, { n: "llama.cpp", id: "llama.cpp", d: "Raw performance" }].map(rt => (
            <div key={rt.id} style={{ ...glass(1), padding: 16, cursor: "pointer", borderRadius: C.rs }} onClick={() => window.spa.runtime.openDownload(rt.id)}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{rt.n}</div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>{rt.d}</div>
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>Download &#8594;</span>
            </div>
          ))}
        </div>
      </>)}

      {/* ─── Messaging Adapters ────────────────────────────────────── */}
      {sub === "adapters" && (<>
        <Sec>Messaging Adapters</Sec>
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>Click any adapter to configure its token. The bridge auto-enables adapters that have tokens saved.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Dot color={brOn ? C.ok : C.muted} pulse={brOn} size={6} />
          <span style={{ fontSize: 12, color: C.dim }}>Bridge {brOn ? "Running" : "Stopped"}</span>
          {!brOn && <Btn v="g" onClick={() => window.spa.bridge.start()} style={{ padding: "4px 12px", fontSize: 10, marginLeft: 4 }}>Start Bridge</Btn>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {ADAPTERS.map(a => <AdapterCard key={a.name} name={a.name} cfgKey={a.key} brOn={brOn} />)}
        </div>
      </>)}

      {/* ─── Organization ──────────────────────────────────────────── */}
      {sub === "org" && (<>
        <Sec>Organizations</Sec>
        <p style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>Manage teams, roles, and SPA key bindings.</p>
        <Btn onClick={async () => { const n = prompt("Organization name:"); if (n) { await window.spa.org.create(n); setOrgs(await window.spa.org.list()); } }} style={{ marginBottom: 14, padding: "6px 16px", fontSize: 12 }}>+ Create Org</Btn>
        {orgs.length === 0 ? <Empty icon="&#127970;" title="No organizations" sub="Create one to manage team access." /> : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {orgs.map((o: any) => (
              <Card key={o.org_id} style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{o.name}</div>
                <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>{o.org_id}</div>
              </Card>
            ))}
          </div>
        )}
      </>)}
    </div>
  );
}
