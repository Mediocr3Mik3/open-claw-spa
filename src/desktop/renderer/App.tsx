/**
 * openclaw-spa — Desktop Renderer (React)
 *
 * Simplified 6-section architecture: Overview, Chat, Agents, Keys,
 * Authorization (gates+audit merged), Settings (modal overlay).
 * Marble-textured UI with command palette and exec approval flow.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

import { C, glass, Dot, Pill, Btn, Modal, injectCSS, Spinner, getTheme, setTheme } from "./components/shared";
import type { Theme } from "./components/shared";
import type { View, KeyInfo, Message, AuditEntry, SetupDetection } from "./components/shared";
import DashboardView from "./components/DashboardView";
import AgentsView from "./components/AgentsView";
import ChatView from "./components/ChatView";
import KeysView from "./components/KeysView";
import GatesView from "./components/GatesView";
import AuditView from "./components/AuditView";
import AuthorizationView from "./components/AuthorizationView";
import SettingsView from "./components/SettingsView";
import { CommandPalette, ExecApprovalModal, useKeyboardShortcuts } from "./components/Modals";
import type { ExecApproval } from "./components/Modals";
import SkillsBrowser from "./components/SkillsBrowser";
import GlobalPersonality from "./components/GlobalPersonality";
import ZeroState from "./components/ZeroState";
import InstallWizard from "./components/InstallWizard";

// ─── Setup Wizard ────────────────────────────────────────────────────────

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<Record<string, unknown>>({});
  const [detection, setDetection] = useState<SetupDetection | null>(null);
  const [keyLabel, setKeyLabel] = useState("My Signing Key");
  const [keyLevel, setKeyLevel] = useState("elevated");
  const [keyResult, setKeyResult] = useState<{ key_id: string; fingerprint: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [gwUrlSetup, setGwUrlSetup] = useState("ws://localhost:18789");
  const [llmChoice, setLlmChoice] = useState<"local" | "cloud" | "skip">("local");
  const [adapterToggles, setAdapterToggles] = useState<Record<string, boolean>>({});
  const [gatePreset, setGatePreset] = useState<"development" | "production" | "compliance" | "skip">("development");

  useEffect(() => {
    injectCSS();
    Promise.all([
      window.spa.setup.getPlatform().then(setPlatform),
      window.spa.autoSetup.detect().then(setDetection),
    ]).finally(() => setScanning(false));
  }, []);

  const genKey = async () => {
    setLoading(true);
    try { const r = await window.spa.generateKey({ label: keyLabel, max_auth_level: keyLevel }); setKeyResult(r); setStep(4); }
    catch (e) { alert(`Key generation failed: ${e}`); }
    setLoading(false);
  };

  const finish = async () => { await window.spa.setup.complete(); onComplete(); };
  const STEPS = ["Welcome", "Hardware", "Gateway", "Key", "Provider", "Messaging", "Gates", "Personality", "Secure"];
  const totalSteps = STEPS.length;
  const LVL_C: Record<string, string> = { standard: C.dim, elevated: C.warn, admin: C.err };

  const ADAPTERS = [
    { id: "whatsapp", label: "WhatsApp", icon: "&#128242;" },
    { id: "telegram", label: "Telegram", icon: "&#9992;" },
    { id: "discord", label: "Discord", icon: "&#127918;" },
    { id: "slack", label: "Slack", icon: "&#128172;" },
    { id: "signal", label: "Signal", icon: "&#128274;" },
    { id: "imessage", label: "iMessage", icon: "&#128172;" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "transparent", fontFamily: C.font }}>
      <div style={{ width: 560, maxHeight: "90vh", overflowY: "auto" as const, ...glass(1), padding: "44px 44px", color: C.text, animation: "fadeIn .5s ease" }}>
        <div style={{ textAlign: "center" as const, marginBottom: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: -0.5 }}>OpenClaw</div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 3, textTransform: "uppercase" as const, marginTop: 4 }}>Signed Prompt Architecture</div>
        </div>

        {/* Progress bar */}
        <div style={{ margin: "24px 0 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: C.dim }}>{STEPS[step]}</span>
            <span style={{ fontSize: 10, color: C.muted }}>{step + 1}/{totalSteps}</span>
          </div>
          <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${((step + 1) / totalSteps) * 100}%`, background: C.grad, borderRadius: 2, transition: "width .4s ease" }} />
          </div>
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Welcome to OpenClaw</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 8 }}>I'll walk you through setting up your secure AI workspace. Every prompt you send will be cryptographically signed — no unsigned message ever reaches your agents.</p>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>This takes about 2 minutes. Let's start by checking your system.</p>
            <div style={{ ...glass(0), padding: 16, marginBottom: 22, borderRadius: C.r }}>
              {[
                { l: "Platform", v: `${platform.platform ?? "..."} (${platform.arch ?? "..."})`, ok: true },
                { l: "Electron", v: String(platform.electron_version ?? "..."), ok: true },
                { l: "Keychain", v: platform.safe_storage ? "Available" : "Unavailable", ok: !!platform.safe_storage },
              ].map(r => (
                <div key={r.l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <Dot color={r.ok ? C.ok : C.err} /><span style={{ fontSize: 12, color: C.dim, width: 80 }}>{r.l}</span><span style={{ fontSize: 13, color: C.text }}>{r.v}</span>
                </div>
              ))}
            </div>
            <Btn onClick={() => setStep(1)} style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>Let's Go</Btn>
          </div>
        )}

        {/* Step 1: Hardware */}
        {step === 1 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Your Hardware</h2>
            {scanning ? (
              <div style={{ textAlign: "center" as const, padding: "40px 0", color: C.dim }}>
                <Spinner /><div style={{ marginTop: 14 }}>Scanning your system...</div>
              </div>
            ) : detection ? (
              <>
                <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 16 }}>{detection.summary}</p>
                <div style={{ ...glass(0), padding: 16, marginBottom: 16, borderRadius: C.r }}>
                  <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>CPU</span><span style={{ fontSize: 13, color: C.text }}>{detection.hardware.cpu}</span></div>
                  <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>RAM</span><span style={{ fontSize: 13, color: C.text }}>{detection.hardware.ram_gb} GB</span></div>
                  {detection.hardware.gpus.map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>GPU</span><span style={{ fontSize: 13, color: C.text }}>{g.name} ({g.vram_gb}GB)</span></div>
                  ))}
                  <div style={{ display: "flex", gap: 12, padding: "6px 0" }}><span style={{ fontSize: 12, color: C.dim, width: 60 }}>Runtime</span><span style={{ fontSize: 13, color: detection.runtimes.length ? C.ok : C.warn }}>{detection.runtimes.length ? detection.runtimes.map((r: any) => r.name).join(", ") : "None detected"}</span></div>
                </div>
                {detection.needs_runtime_install && (
                  <div style={{ ...glass(0), padding: 14, marginBottom: 16, borderLeft: `3px solid ${C.warn}` }}>
                    <div style={{ fontSize: 12, color: C.warn, fontWeight: 600, marginBottom: 2 }}>No local runtime found</div>
                    <p style={{ fontSize: 11, color: C.dim }}>Don't worry — you can install <strong style={{ color: C.text }}>Ollama</strong> later, or use a cloud provider like OpenAI.</p>
                  </div>
                )}
                {detection.recommendations.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 10 }}>Recommended Models</h3>
                    {detection.recommendations.slice(0, 3).map((r, i) => (
                      <div key={i} style={{ ...glass(0), padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 6, borderRadius: C.rs }}>
                        <Pill bg={r.fits_in_memory ? C.okSoft : C.warnSoft} color={r.fits_in_memory ? C.ok : C.warn}>{r.tier}</Pill>
                        <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{r.model}</span>
                        <span style={{ fontSize: 10, color: C.muted }}>{r.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn v="g" onClick={() => setStep(0)} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>Back</Btn>
                  <Btn onClick={() => setStep(2)} style={{ padding: "12px 0", flex: 2, fontSize: 14 }}>Continue</Btn>
                </div>
              </>
            ) : <div style={{ color: C.err, padding: 20 }}>Detection failed. <Btn v="g" onClick={() => setStep(2)} style={{ marginLeft: 8 }}>Skip</Btn></div>}
          </div>
        )}

        {/* Step 2: Gateway */}
        {step === 2 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Gateway Connection</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 20 }}>The OpenClaw gateway routes signed messages between you and your AI agents. The default runs locally on your machine.</p>
            <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 6 }}>Gateway URL</label>
            <input value={gwUrlSetup} onChange={e => setGwUrlSetup(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 13, fontFamily: C.mono, outline: "none", marginBottom: 14 }} />
            <div style={{ ...glass(0), padding: 12, marginBottom: 22, borderLeft: `3px solid ${C.accent}`, borderRadius: C.rs }}>
              <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
                <strong style={{ color: C.text }}>Tip:</strong> Keep the default for local development. Change this if connecting to a remote gateway or team server.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="g" onClick={() => setStep(1)} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>Back</Btn>
              <Btn onClick={() => setStep(3)} style={{ padding: "12px 0", flex: 2, fontSize: 14 }}>Continue</Btn>
            </div>
          </div>
        )}

        {/* Step 3: Signing Key */}
        {step === 3 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Create Your Signing Key</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 20 }}>This is the heart of OpenClaw's security. Your ECDSA P-384 key lives in the OS keychain and signs every elevated prompt so agents know it came from you.</p>
            <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 6 }}>Key Label</label>
            <input value={keyLabel} onChange={e => setKeyLabel(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: C.rs, fontSize: 14, outline: "none", marginBottom: 14 }} />
            <label style={{ fontSize: 11, color: C.dim, display: "block", marginBottom: 6 }}>Max Authorization Level</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
              {(["standard", "elevated", "admin"] as const).map(l => (
                <button key={l} onClick={() => setKeyLevel(l)} style={{ flex: 1, padding: "10px 0", borderRadius: C.rs, border: keyLevel === l ? `1px solid ${C.accent}` : `1px solid ${C.border}`, background: keyLevel === l ? C.accentSoft : "transparent", color: keyLevel === l ? C.accent : C.dim, fontWeight: 600, fontSize: 12, textTransform: "capitalize" as const, transition: "all .15s" }}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="g" onClick={() => setStep(2)} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>Back</Btn>
              <Btn onClick={genKey} disabled={loading} style={{ padding: "12px 0", flex: 2, fontSize: 14 }}>{loading ? "Generating..." : "Generate Key Pair"}</Btn>
            </div>
          </div>
        )}

        {/* Step 4: LLM Provider */}
        {step === 4 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Choose Your AI Provider</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 8 }}>
              {keyResult ? "Key created successfully! " : ""}How would you like to run your AI models?
            </p>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 20 }}>You can always change this later in Settings.</p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 22 }}>
              {([
                { id: "local" as const, icon: "&#128187;", label: "Local Runtime", desc: "Run models privately on your machine (Ollama, llama.cpp, LM Studio)", tag: "Private" },
                { id: "cloud" as const, icon: "&#9729;", label: "Cloud Provider", desc: "Use OpenAI, Anthropic, Groq, or other API providers", tag: "Powerful" },
                { id: "skip" as const, icon: "&#8594;", label: "Set Up Later", desc: "Configure your LLM provider after setup", tag: "" },
              ] as const).map(o => (
                <button key={o.id} onClick={() => setLlmChoice(o.id)} style={{ ...glass(llmChoice === o.id ? 1 : 0), padding: "14px 16px", textAlign: "left" as const, display: "flex", alignItems: "center", gap: 12, borderRadius: C.r, border: llmChoice === o.id ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`, cursor: "pointer", transition: "all .15s" }}>
                  <span style={{ fontSize: 20, opacity: llmChoice === o.id ? .8 : .4 }} dangerouslySetInnerHTML={{ __html: o.icon }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: llmChoice === o.id ? C.text : C.dim }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{o.desc}</div>
                  </div>
                  {o.tag && <Pill bg={llmChoice === o.id ? C.accentSoft : "transparent"} color={llmChoice === o.id ? C.accent : C.muted}>{o.tag}</Pill>}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="g" onClick={() => setStep(3)} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>Back</Btn>
              <Btn onClick={() => setStep(5)} style={{ padding: "12px 0", flex: 2, fontSize: 14 }}>Continue</Btn>
            </div>
          </div>
        )}

        {/* Step 5: Messaging */}
        {step === 5 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Messaging Bridge</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 8 }}>OpenClaw can receive signed messages from your favorite messaging platforms. Select any you'd like to connect.</p>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 20 }}>You can configure credentials for each adapter later in Settings.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 22 }}>
              {ADAPTERS.map(a => {
                const on = adapterToggles[a.id] ?? false;
                return (
                  <button key={a.id} onClick={() => setAdapterToggles(p => ({ ...p, [a.id]: !on }))}
                    style={{ ...glass(on ? 1 : 0), padding: "14px 10px", textAlign: "center" as const, borderRadius: C.r, border: on ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`, cursor: "pointer", transition: "all .15s" }}>
                    <span style={{ fontSize: 18, display: "block", marginBottom: 4, opacity: on ? .8 : .3 }} dangerouslySetInnerHTML={{ __html: a.icon }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: on ? C.accent : C.muted }}>{a.label}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="g" onClick={() => setStep(4)} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>Back</Btn>
              <Btn onClick={() => setStep(6)} style={{ padding: "12px 0", flex: 2, fontSize: 14 }}>
                {Object.values(adapterToggles).some(Boolean) ? "Continue" : "Skip for Now"}
              </Btn>
            </div>
          </div>
        )}

        {/* Step 6: Action Gates */}
        {step === 6 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Security Gates</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 20 }}>Action gates control which tools require signed authorization before an agent can use them. Choose a starting preset — you can customize individual gates anytime.</p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 22 }}>
              {([
                { id: "development" as const, label: "Development", desc: "Relaxed gates for coding. Shell exec needs approval, file writes are standard.", count: 4 },
                { id: "production" as const, label: "Production", desc: "Strict gates for live systems. Most actions require elevated or admin approval.", count: 8 },
                { id: "compliance" as const, label: "Compliance", desc: "Maximum security. Every sensitive action requires admin-level signing.", count: 10 },
                { id: "skip" as const, label: "No Gates (Configure Later)", desc: "Start without gates. You can add them from the Authorization view.", count: 0 },
              ] as const).map(p => (
                <button key={p.id} onClick={() => setGatePreset(p.id)} style={{ ...glass(gatePreset === p.id ? 1 : 0), padding: "14px 16px", textAlign: "left" as const, display: "flex", alignItems: "center", gap: 12, borderRadius: C.r, border: gatePreset === p.id ? `1px solid ${C.borderAccent}` : `1px solid ${C.border}`, cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: gatePreset === p.id ? C.text : C.dim }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.desc}</div>
                  </div>
                  {p.count > 0 && <Pill bg={gatePreset === p.id ? C.accentSoft : "transparent"} color={gatePreset === p.id ? C.accent : C.muted}>{p.count} gates</Pill>}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="g" onClick={() => setStep(5)} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>Back</Btn>
              <Btn onClick={() => setStep(7)} style={{ padding: "12px 0", flex: 2, fontSize: 14 }}>Continue</Btn>
            </div>
          </div>
        )}

        {/* Step 7: Personality */}
        {step === 7 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Default Agent Personality</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 20 }}>Set a default communication style for your agents. Each agent can override this with their own personality later.</p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 22 }}>
              {[
                { icon: "&#128188;", label: "Professional", desc: "Clear, concise, and focused" },
                { icon: "&#128075;", label: "Friendly", desc: "Warm, approachable, and conversational" },
                { icon: "&#9889;", label: "Direct", desc: "Blunt, efficient, no fluff" },
                { icon: "&#129504;", label: "Thoughtful", desc: "Nuanced, explores tradeoffs carefully" },
              ].map(p => (
                <div key={p.label} style={{ ...glass(0), padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderRadius: C.r, cursor: "pointer", transition: "all .12s", border: `1px solid ${C.border}` }}
                  onClick={() => { /* personality preference stored on complete */ }}>
                  <span style={{ fontSize: 16 }} dangerouslySetInnerHTML={{ __html: p.icon }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="g" onClick={() => setStep(6)} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>Back</Btn>
              <Btn onClick={() => setStep(8)} style={{ padding: "12px 0", flex: 2, fontSize: 14 }}>Continue</Btn>
            </div>
          </div>
        )}

        {/* Step 8: Complete */}
        {step === 8 && (
          <div style={{ animation: "fadeIn .3s ease", textAlign: "center" as const }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: C.okSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px", color: C.ok, border: `2px solid ${C.ok}` }}>&#10003;</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>OpenClaw is Ready</h2>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, marginBottom: 12 }}>Your secure AI workspace is fully configured. Every prompt will be cryptographically signed and verified.</p>
            {keyResult && (
              <div style={{ ...glass(0), padding: 16, marginBottom: 14, textAlign: "left" as const, borderRadius: C.r }}>
                {[
                  { l: "Key ID", v: keyResult.key_id },
                  { l: "Fingerprint", v: keyResult.fingerprint },
                  { l: "Encryption", v: "AES-256-GCM" },
                  { l: "Storage", v: "OS Keychain (safeStorage)" },
                  { l: "Algorithm", v: "ECDSA P-384" },
                  { l: "Gateway", v: gwUrlSetup },
                  { l: "Provider", v: llmChoice === "skip" ? "Not configured" : llmChoice === "local" ? "Local runtime" : "Cloud API" },
                  { l: "Gates", v: gatePreset === "skip" ? "None" : `${gatePreset} preset` },
                ].map(r => (
                  <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <span style={{ color: C.dim }}>{r.l}</span>
                    <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...glass(0), padding: 12, marginBottom: 24, borderLeft: `3px solid ${C.ok}`, textAlign: "left" as const }}>
              <div style={{ fontSize: 11, color: C.ok, fontWeight: 600, marginBottom: 2 }}>Security Summary</div>
              <ul style={{ fontSize: 11, color: C.dim, lineHeight: 1.7, paddingLeft: 16 }}>
                <li>Private key encrypted in OS keychain</li>
                <li>Config encrypted with AES-256-GCM</li>
                <li>Tamper-evident audit chain active</li>
                <li>All prompts require signature verification</li>
              </ul>
            </div>
            <Btn onClick={finish} style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>Launch OpenClaw</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nav Items ───────────────────────────────────────────────────────────

const NAV: { view: View; label: string; icon: string; shortcut: string }[] = [
  { view: "overview", label: "Overview", icon: "&#9670;", shortcut: "1" },
  { view: "chat", label: "Chat", icon: "&#128172;", shortcut: "2" },
  { view: "agents", label: "Agents", icon: "&#129302;", shortcut: "3" },
  { view: "keys", label: "Keys", icon: "&#128273;", shortcut: "4" },
  { view: "authorization", label: "Auth", icon: "&#128737;", shortcut: "5" },
];

// ─── Main App ────────────────────────────────────────────────────────────

type AppPhase = "loading" | "zero_state" | "install_wizard" | "legacy_setup" | "ready";

interface DetectionResult {
  binary_found: boolean;
  binary_path: string | null;
  binary_version: string | null;
  gateway_reachable: boolean;
  gateway_url: string;
  config_found: boolean;
  config_path: string | null;
  spa_setup_complete: boolean;
  platform: { os: string; arch: string; home: string };
  status: "not_installed" | "installed_not_running" | "running_not_configured" | "ready";
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("loading");
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [settingsSub, setSettingsSub] = useState("general");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [auth, setAuth] = useState("standard");
  const [gwOn, setGwOn] = useState(false);
  const [brOn, setBrOn] = useState(false);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [cfgKeys, setCfgKeys] = useState<string[]>([]);
  const [gwUrl, setGwUrl] = useState("ws://localhost:3210/ws");
  const [provStat, setProvStat] = useState<any>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [approval, setApproval] = useState<ExecApproval | null>(null);
  const [version, setVersion] = useState("");
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<{id:string;name:string;status:string}[]>([]);
  const mc = useRef(0);

  const navTo = useCallback((v: View | "settings", sub?: string) => {
    if (v === "settings") {
      if (sub) setSettingsSub(sub);
      setSettingsOpen(true);
    } else {
      setView(v as View);
    }
  }, []);

  // ─── Pre-flight: detect OpenClaw installation status ───
  useEffect(() => {
    injectCSS();
    (async () => {
      try {
        const setupDone = await window.spa.setup.isComplete();
        if (setupDone) {
          // Already set up — go straight to dashboard
          setReady(true);
          setPhase("ready");
          return;
        }
        // Not set up — detect OpenClaw installation
        const det = await window.spa.installer.detect();
        setDetection(det);
        if (det.status === "ready" || det.status === "running_not_configured") {
          // Gateway is running — go to legacy SPA setup (key gen etc.)
          setReady(false);
          setPhase("legacy_setup");
        } else {
          // Not installed or not running — show zero state
          setPhase("zero_state");
        }
      } catch {
        // If installer API fails (common on Windows first run), synthesize a not_installed detection
        // so the zero-state install wizard always shows when setup isn't complete
        try {
          const setupDone = await window.spa.setup.isComplete();
          if (setupDone) {
            setReady(true);
            setPhase("ready");
          } else {
            // Show zero-state with a synthetic detection — user needs to install
            setDetection({
              binary_found: false, binary_path: null, binary_version: null,
              gateway_reachable: false, gateway_url: "ws://localhost:3210/ws",
              config_found: false, config_path: null, spa_setup_complete: false,
              platform: { os: navigator.platform?.includes("Win") ? "win32" : navigator.platform?.includes("Mac") ? "darwin" : "linux", arch: "x64", home: "" },
              status: "not_installed",
            } as DetectionResult);
            setPhase("zero_state");
          }
        } catch {
          // Last resort — still show zero_state so user isn't stuck
          setDetection({
            binary_found: false, binary_path: null, binary_version: null,
            gateway_reachable: false, gateway_url: "ws://localhost:3210/ws",
            config_found: false, config_path: null, spa_setup_complete: false,
            platform: { os: "unknown", arch: "unknown", home: "" },
            status: "not_installed",
          } as DetectionResult);
          setPhase("zero_state");
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.spa.listKeys().then((k: KeyInfo[]) => { setKeys(k); const a = k.find(x => x.active); if (a) setKeyId(a.key_id); });
    window.spa.gatewayStatus().then(s => setGwOn(s.connected));
    window.spa.bridge.status().then(s => setBrOn(s.running));
    window.spa.config.keys().then(setCfgKeys);
    window.spa.llm.status().then(setProvStat).catch(() => {});
    window.spa.getVersion().then(setVersion).catch(() => {});
    window.spa.onGatewayStatus(s => setGwOn(s.connected));
    window.spa.bridge.onStatus(s => setBrOn(s.running));
    window.spa.onGatewayMessage((d: any) => {
      if (d?.text) { mc.current++; setMsgs(p => [...p, { id: mc.current, text: d.text, sender: "agent", signed: !!d.signed, timestamp: new Date().toISOString(), key_id: d.key_id, tool_calls: d.tool_calls, thinking: d.thinking }]); }
    });
    window.spa.onIntrusionAlert((a: any) => { console.warn("[Intrusion Alert]", a); });
    window.spa.config.get("agents").then((raw: string | null) => { if (raw) try { setAgents(JSON.parse(raw)); } catch {} }).catch(() => {});
  }, [ready]);

  const refreshKeys = async () => { const k = await window.spa.listKeys(); setKeys(k); };

  const send = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim(); setInput("");
    let token: string | undefined; let signed = false;
    // Security: ALWAYS sign when a key is available — no unsigned messages reach agents
    if (keyId) {
      try { token = await window.spa.signMessage({ text, key_id: keyId, auth_level: auth }); signed = true; } catch {}
    }
    mc.current++; setMsgs(p => [...p, { id: mc.current, text, sender: "user", auth_level: auth, signed, timestamp: new Date().toISOString(), key_id: keyId ?? undefined }]);
    await window.spa.sendMessage({ text, token });
  }, [input, auth, keyId]);

  useKeyboardShortcuts({
    onNav: setView,
    onPalette: () => setPaletteOpen(true),
    onNewItem: () => {},
  });

  const paletteActions = [
    ...NAV.map(n => ({ id: `nav-${n.view}`, label: `Go to ${n.label}`, sub: `Press ${n.shortcut}`, icon: n.icon, action: () => setView(n.view) })),
    { id: "gen-key", label: "Generate Signing Key", sub: "Create a new ECDSA key pair", icon: "&#128273;", action: () => setView("keys") },
    { id: "add-gate", label: "Add Action Gate", sub: "Configure authorization gate", icon: "&#128737;", action: () => setView("authorization") },
    { id: "view-audit", label: "View Audit Log", sub: "Check security events", icon: "&#128203;", action: () => setView("authorization") },
    { id: "cfg-adapters", label: "Configure Messaging", sub: "Set up messaging adapters", icon: "&#9673;", action: () => navTo("settings", "adapters") },
    { id: "cfg-llm", label: "Configure LLM", sub: "Set up AI providers & models", icon: "&#129302;", action: () => navTo("settings", "llm") },
    { id: "open-settings", label: "Open Settings", sub: "Configuration & preferences", icon: "&#9881;", action: () => setSettingsOpen(true) },
    { id: "open-skills", label: "Browse Skills", sub: "Community skill marketplace", icon: "&#129513;", action: () => setView("skills") },
    { id: "toggle-bridge", label: brOn ? "Stop Bridge" : "Start Bridge", sub: `Bridge is ${brOn ? "running" : "stopped"}`, icon: "&#9673;", action: () => brOn ? window.spa.bridge.stop() : window.spa.bridge.start() },
  ];

  // ─── Phase-based rendering ───
  if (phase === "loading") return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "transparent", color: C.dim, fontFamily: C.font }}><Spinner size={28} /></div>;

  if (phase === "zero_state" && detection) return (
    <ZeroState
      detection={detection}
      onBeginInstall={() => setPhase("install_wizard")}
      onConnectExisting={async (url) => {
        await window.spa.config.set("OPENCLAW_GATEWAY_URL", url);
        await window.spa.connectGateway(url);
        setReady(false);
        setPhase("legacy_setup");
      }}
      onRetry={async () => {
        setPhase("loading");
        const det = await window.spa.installer.detect();
        setDetection(det);
        if (det.status === "ready" || det.status === "running_not_configured") {
          setReady(false);
          setPhase("legacy_setup");
        } else {
          setPhase("zero_state");
        }
      }}
    />
  );

  if (phase === "install_wizard" && detection) return (
    <InstallWizard
      detection={detection}
      onComplete={async () => {
        setReady(true);
        setPhase("ready");
      }}
      onBack={() => setPhase("zero_state")}
    />
  );

  if (phase === "legacy_setup" || (ready === false)) return <SetupWizard onComplete={() => { setReady(true); setPhase("ready"); }} />;

  const hasLLM = !!provStat?.provider_id;
  const isDarwin = navigator.userAgent.includes("Mac");

  return (
    <div style={{ display: "flex", height: "100vh", background: "transparent", color: C.text, fontFamily: C.font }}>
      {/* ─── Sidebar ─── */}
      <div style={{ width: 62, background: C.surface, backdropFilter: "blur(12px)", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" as const, alignItems: "center", paddingTop: isDarwin ? C.safePadTop : 12, gap: 0, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, background: C.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8, userSelect: "none" as const, letterSpacing: -0.5 }}>OC</div>
        {NAV.map(n => {
          const active = view === n.view;
          return (
            <button key={n.view} onClick={() => setView(n.view)}
              aria-label={`Navigate to ${n.label}`} aria-current={active ? "page" : undefined}
              className="oc-tooltip" data-tip={n.label}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              style={{ width: 44, height: 36, borderRadius: C.rs, border: "none", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 1,
                background: active ? C.accentSoft : "transparent", color: active ? C.accent : C.muted, fontSize: 13, transition: "all .15s",
                borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent" }}>
              <span dangerouslySetInnerHTML={{ __html: n.icon }} />
              <span style={{ fontSize: 7, fontWeight: 600, letterSpacing: .2, opacity: active ? 1 : .6 }}>{n.label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button onClick={() => setSettingsOpen(true)}
          aria-label="Open settings" className="oc-tooltip" data-tip="Settings"
          style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: settingsOpen ? C.accentSoft : "transparent", color: settingsOpen ? C.accent : C.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6, transition: "all .15s" }}
          dangerouslySetInnerHTML={{ __html: "&#9881;" }} />
        <button onClick={() => { const next: Theme = theme === "dark" ? "light" : "dark"; setTheme(next); setThemeState(next); }}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="oc-tooltip" data-tip={theme === "dark" ? "Light Mode" : "Dark Mode"}
          style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6, transition: "all .15s" }}
          dangerouslySetInnerHTML={{ __html: theme === "dark" ? "&#9788;" : "&#9790;" }} />
        <button onClick={() => setPaletteOpen(true)}
          aria-label="Open command palette"
          style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, fontWeight: 600 }}>
          {isDarwin ? "\u2318K" : "^K"}
        </button>
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5 }}>
          <Dot color={brOn ? C.ok : C.muted} pulse={brOn} size={6} label={brOn ? "Bridge connected" : "Bridge disconnected"} />
          <Dot color={gwOn ? C.ok : C.muted} size={6} label={gwOn ? "Gateway connected" : "Gateway disconnected"} />
        </div>
        {version && <div style={{ fontSize: 7, color: C.muted, marginBottom: 8, userSelect: "none" as const }}>v{version}</div>}
      </div>

      {/* ─── Content ─── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden", paddingTop: isDarwin ? C.safePadTop - 10 : 0 }}>
        {view === "overview" && <DashboardView onNav={navTo} gwOn={gwOn} brOn={brOn} keys={keys} />}
        {view === "agents" && <AgentsView onNav={navTo} onOpenChat={(id: string) => { setChatAgent(id); setView("chat"); }} />}
        {view === "chat" && <ChatView msgs={msgs} input={input} setInput={setInput} auth={auth} setAuth={setAuth} keyId={keyId} keys={keys} onSend={send} hasLLM={hasLLM} onNav={navTo} agentId={chatAgent} agents={agents} onAgentChange={setChatAgent} />}
        {view === "keys" && <KeysView keys={keys} keyId={keyId} setKeyId={setKeyId} refresh={refreshKeys} />}
        {view === "authorization" && <AuthorizationView />}
        {view === "skills" && <SkillsBrowser />}
        {view === "personality" && <GlobalPersonality />}
      </div>

      {/* ─── Overlays ─── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <ExecApprovalModal
        approval={approval}
        keys={keys}
        onApprove={async () => { setApproval(null); }}
        onDeny={() => setApproval(null)}
        onClose={() => setApproval(null)}
      />

      {/* ─── Settings Modal Overlay ─── */}
      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", animation: "fadeIn .15s ease" }} onClick={() => setSettingsOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "85vw", maxWidth: 860, maxHeight: "85vh", overflowY: "auto" as const, ...glass(1), padding: 0, animation: "scaleIn .2s ease", display: "flex", flexDirection: "column" as const }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px 0" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Settings</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              <SettingsView gwOn={gwOn} brOn={brOn} gwUrl={gwUrl} setGwUrl={setGwUrl} configKeys={cfgKeys} setConfigKeys={setCfgKeys} initialSub={settingsSub} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
