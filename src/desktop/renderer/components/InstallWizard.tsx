/**
 * openclaw-spa — Installation Wizard
 *
 * Full 9-step conversational guided flow that takes a user from zero
 * to a fully configured, secure OpenClaw installation. No CLI needed.
 *
 * Steps:
 *   0. Welcome + System Check
 *   1. Environment (local / cloud / device)
 *   2. Security Posture (cautious / balanced / trusted)
 *   3. Network (localhost / private / tailscale)
 *   4. Authentication (auto-gen token + SPA key)
 *   5. Agent Identity (name, personality)
 *   6. Tool Permissions (gate presets)
 *   7. Review (settings summary, security score)
 *   8. Install & Verify (progress, download, configure, start, verify)
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { C, glass, injectCSS, Btn, Input, Spinner, Dot, Pill, Card } from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────

interface DetectionResult {
  binary_found: boolean;
  binary_path: string | null;
  binary_version: string | null;
  gateway_reachable: boolean;
  gateway_url: string;
  config_found: boolean;
  platform: { os: string; arch: string; home: string };
  status: string;
}

interface HardwareInfo {
  cpu: string;
  ram_gb: number;
  gpus: { name: string; vram_gb: number; vendor: string }[];
}

interface InstallProgress {
  step: string;
  message: string;
  percent: number;
  error?: string;
}

interface InstallResult {
  success: boolean;
  gateway_url: string;
  gateway_token: string;
  config_path: string;
  binary_path: string;
  agent_name: string;
  security_score: number;
  error?: string;
}

interface WizardProps {
  detection: DetectionResult;
  onComplete: (result: InstallResult) => void;
  onBack: () => void;
}

// ─── Step definitions ─────────────────────────────────────────────────────

const STEP_LABELS = [
  "Welcome", "Environment", "Security", "Network",
  "Authentication", "Agent", "Permissions", "Review", "Install",
];

// ─── Shared mini-components ───────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / (total - 1)) * 100);
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>
          Step {step + 1} of {total}
        </span>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{
        height: 3, borderRadius: 2, background: C.border, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 2,
          background: C.grad, transition: "width .4s ease",
        }} />
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 8 }}>
        {STEP_LABELS.map((label, i) => (
          <div key={label} style={{
            flex: 1, textAlign: "center" as const,
            fontSize: 8, fontWeight: 600, letterSpacing: 0.3,
            color: i === step ? C.accent : i < step ? C.ok : C.muted,
            opacity: i === step ? 1 : i < step ? 0.7 : 0.4,
          }}>
            {i <= step ? label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function OptionCard({ selected, onClick, icon, title, desc, badge, warn }: {
  selected: boolean; onClick: () => void; icon: string; title: string;
  desc: string; badge?: string; warn?: string;
}) {
  return (
    <div role="button" tabIndex={0} aria-pressed={selected} onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        ...glass(0), padding: "16px 20px", borderRadius: C.rs, cursor: "pointer",
        display: "flex", alignItems: "flex-start", gap: 14,
        border: `1.5px solid ${selected ? C.accent : C.border}`,
        background: selected ? `${C.accentSoft}` : undefined,
        transition: "all .15s",
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: selected ? `${C.accent}15` : "rgba(255,255,255,0.02)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        <span dangerouslySetInnerHTML={{ __html: icon }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: selected ? C.accent : C.text }}>{title}</span>
          {badge && <Pill bg={C.okSoft} color={C.ok}>{badge}</Pill>}
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>{desc}</div>
        {warn && (
          <div style={{ fontSize: 11, color: C.warn, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
            <span>&#9888;&#65039;</span> {warn}
          </div>
        )}
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
        border: `2px solid ${selected ? C.accent : C.border}`,
        background: selected ? C.accent : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .15s", marginTop: 2,
      }}>
        {selected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>&#10003;</span>}
      </div>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel, nextDisabled, backLabel, showBack }: {
  onBack: () => void; onNext: () => void;
  nextLabel?: string; nextDisabled?: boolean;
  backLabel?: string; showBack?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
      {showBack !== false && (
        <Btn v="g" onClick={onBack} style={{ padding: "12px 0", flex: 1, fontSize: 13 }}>
          {backLabel ?? "Back"}
        </Btn>
      )}
      <Btn onClick={onNext} disabled={nextDisabled}
        style={{ padding: "12px 0", flex: 2, fontSize: 14, opacity: nextDisabled ? 0.4 : 1 }}>
        {nextLabel ?? "Continue"}
      </Btn>
    </div>
  );
}

function DangerBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "12px 16px", borderRadius: C.rx,
      background: C.errSoft, border: `1px solid ${C.err}30`,
      color: C.err, fontSize: 12, lineHeight: 1.6,
      display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>&#128683;</span>
      <div>{children}</div>
    </div>
  );
}

function InfoBox({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = color ?? C.accent;
  return (
    <div style={{
      padding: "12px 16px", borderRadius: C.rx,
      background: `${c}08`, border: `1px solid ${c}20`,
      color: C.dim, fontSize: 12, lineHeight: 1.6,
      marginTop: 12,
    }}>{children}</div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function InstallWizard({ detection, onComplete, onBack }: WizardProps) {
  const [step, setStep] = useState(0);

  // Wizard data
  const [environment, setEnvironment] = useState<"local" | "cloud" | "device">("local");
  const [securityLevel, setSecurityLevel] = useState<"cautious" | "balanced" | "trusted">("balanced");
  const [bindAddress, setBindAddress] = useState<"localhost" | "private" | "tailscale">("localhost");
  const [gatewayPort] = useState(3210);
  const [agentName, setAgentName] = useState("Atlas");
  const [personality, setPersonality] = useState<"professional" | "friendly" | "direct" | "thoughtful">("professional");
  const [gatePreset, setGatePreset] = useState<"cautious" | "balanced" | "trusted" | "none">("balanced");

  // System check data
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [checking, setChecking] = useState(true);

  // Auth step
  const [keyGenerated, setKeyGenerated] = useState(false);
  const [keyResult, setKeyResult] = useState<{ key_id: string; fingerprint: string } | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);

  // Install step
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => { injectCSS(); }, []);

  // System check on mount
  useEffect(() => {
    (async () => {
      try {
        const autoDetect = await window.spa.autoSetup.detect();
        setHardware({
          cpu: autoDetect.hardware.cpu,
          ram_gb: autoDetect.hardware.ram_gb,
          gpus: autoDetect.hardware.gpus,
        });
      } catch { /* ignore */ }
      setChecking(false);
    })();
  }, []);

  // Listen for install progress events
  useEffect(() => {
    window.spa.installer.onProgress((progress: InstallProgress) => {
      setInstallProgress(progress);
    });
  }, []);

  // Auto-sync gate preset to security level
  useEffect(() => {
    setGatePreset(securityLevel);
  }, [securityLevel]);

  const goNext = () => setStep(s => Math.min(s + 1, 8));
  const goBack = () => {
    if (step === 0) onBack();
    else setStep(s => s - 1);
  };

  // Generate SPA signing key
  const generateKey = async () => {
    setGeneratingKey(true);
    try {
      const result = await window.spa.generateKey({
        label: `${agentName} Primary Key`,
        max_auth_level: "admin",
        algorithm: "ecdsa-p384",
      });
      setKeyResult(result);
      setKeyGenerated(true);
    } catch (err) {
      console.error("Key generation failed:", err);
    }
    setGeneratingKey(false);
  };

  // Run full installation
  const runInstall = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const result = await window.spa.installer.fullInstall({
        environment,
        security_level: securityLevel,
        bind_address: bindAddress,
        gateway_port: gatewayPort,
        agent_name: agentName,
        agent_personality: personality,
        gate_preset: gatePreset,
        channels: {},
      });

      if (result.success) {
        setInstallResult(result);
        // Mark SPA setup as complete
        await window.spa.setup.complete();
      } else {
        setInstallError(result.error ?? "Installation failed");
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    }
    setInstalling(false);
  };

  // Security score calculation (mirrors backend)
  const securityScore = (() => {
    let score = 0;
    if (bindAddress === "localhost") score += 25;
    else if (bindAddress === "tailscale") score += 20;
    else score += 10;
    score += 25; // token auth always
    if (securityLevel === "cautious") score += 25;
    else if (securityLevel === "balanced") score += 15;
    else score += 5;
    const gateCount = gatePreset === "cautious" ? 12 : gatePreset === "balanced" ? 8 : gatePreset === "trusted" ? 3 : 0;
    if (gateCount > 8) score += 25;
    else if (gateCount > 4) score += 15;
    else if (gateCount > 0) score += 10;
    return Math.min(100, score);
  })();

  const scoreColor = securityScore >= 80 ? C.ok : securityScore >= 50 ? C.warn : C.err;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100vw",
      background: C.bg, color: C.text, fontFamily: C.font,
    }}>
      {/* Left sidebar: progress */}
      <div style={{
        width: 220, flexShrink: 0, padding: "40px 24px",
        borderRight: `1px solid ${C.border}`, background: C.surface,
        display: "flex", flexDirection: "column" as const,
      }}>
        <div style={{
          fontSize: 16, fontWeight: 800, marginBottom: 32,
          background: C.grad, WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent", letterSpacing: -0.5,
        }}>OpenClaw Setup</div>

        {STEP_LABELS.map((label, i) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 14, cursor: i < step ? "pointer" : "default",
            opacity: i === step ? 1 : i < step ? 0.7 : 0.35,
          }}
            onClick={() => { if (i < step) setStep(i); }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              background: i === step ? C.accent : i < step ? C.ok : "rgba(255,255,255,0.04)",
              color: i <= step ? "#fff" : C.muted,
              border: i === step ? "none" : `1px solid ${i < step ? C.ok : C.border}`,
              transition: "all .2s",
            }}>
              {i < step ? "\u2713" : i + 1}
            </div>
            <span style={{
              fontSize: 12, fontWeight: i === step ? 600 : 400,
              color: i === step ? C.text : C.dim,
            }}>{label}</span>
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Security score preview */}
        {step >= 2 && (
          <div style={{
            ...glass(0), padding: 14, borderRadius: C.rx, textAlign: "center" as const,
          }}>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, fontWeight: 600 }}>
              SECURITY SCORE
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: scoreColor }}>
              {securityScore}
            </div>
            <div style={{
              height: 3, borderRadius: 2, background: C.border, marginTop: 8,
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${securityScore}%`,
                background: scoreColor, transition: "all .3s",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Right: step content */}
      <div style={{
        flex: 1, overflow: "auto", padding: "40px 48px",
        display: "flex", flexDirection: "column" as const,
      }}>
        <div style={{ maxWidth: 560, width: "100%" }}>

          {/* ── Step 0: Welcome + System Check ── */}
          {step === 0 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Welcome to OpenClaw
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                Let's set up your secure AI workspace. This wizard will configure everything
                automatically — cryptographic keys, gateway settings, security gates, and
                your first AI agent. Takes about 2 minutes.
              </p>

              {/* System check */}
              <div style={{ ...glass(0), padding: 20, borderRadius: C.rs, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>System Check</div>
                {checking ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.dim }}>
                    <Spinner size={16} /> <span style={{ fontSize: 13 }}>Scanning hardware...</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                    {[
                      {
                        label: "Platform",
                        value: `${detection.platform.os === "darwin" ? "macOS" : detection.platform.os === "win32" ? "Windows" : "Linux"} (${detection.platform.arch})`,
                        ok: true,
                      },
                      {
                        label: "CPU",
                        value: hardware?.cpu ?? "Detected",
                        ok: true,
                      },
                      {
                        label: "Memory",
                        value: hardware ? `${hardware.ram_gb} GB` : "Detected",
                        ok: (hardware?.ram_gb ?? 0) >= 4,
                      },
                      {
                        label: "GPU",
                        value: hardware?.gpus?.length ? hardware.gpus.map(g => g.name).join(", ") : "None detected",
                        ok: true,
                      },
                      {
                        label: "OpenClaw Binary",
                        value: detection.binary_found ? `Found (${detection.binary_version ?? "unknown version"})` : "Not found — will download",
                        ok: true,
                      },
                    ].map(row => (
                      <div key={row.label} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 0", borderBottom: `1px solid ${C.border}`,
                      }}>
                        <span style={{ fontSize: 12, color: C.dim }}>{row.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, color: C.text, fontFamily: C.mono, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {row.value}
                          </span>
                          <Dot color={row.ok ? C.ok : C.warn} size={6} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <InfoBox>
                <strong>What we'll configure:</strong> Gateway connection, cryptographic signing keys,
                security gates, agent identity, and tool permissions. Everything is stored
                locally and encrypted.
              </InfoBox>

              <NavButtons onBack={onBack} onNext={goNext} nextLabel="Let's Begin"
                backLabel="Cancel" nextDisabled={checking} />
            </div>
          )}

          {/* ── Step 1: Environment ── */}
          {step === 1 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Where will OpenClaw run?
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                This helps us choose the right defaults for your setup.
              </p>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <OptionCard selected={environment === "local"} onClick={() => setEnvironment("local")}
                  icon="&#128187;" title="This Computer"
                  desc="Running on your personal machine. Best for development and personal use."
                  badge="Most Common" />
                <OptionCard selected={environment === "cloud"} onClick={() => setEnvironment("cloud")}
                  icon="&#9729;&#65039;" title="Cloud Server"
                  desc="Running on a remote server or VM. We'll configure for headless operation." />
                <OptionCard selected={environment === "device"} onClick={() => setEnvironment("device")}
                  icon="&#129302;" title="Edge Device"
                  desc="Running on a Raspberry Pi, NUC, or similar. We'll optimize for limited resources." />
              </div>

              <NavButtons onBack={goBack} onNext={goNext} />
            </div>
          )}

          {/* ── Step 2: Security Posture ── */}
          {step === 2 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Choose your security posture
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                This controls how strictly OpenClaw gates sensitive operations.
                You can always adjust individual gates later.
              </p>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <OptionCard selected={securityLevel === "cautious"} onClick={() => setSecurityLevel("cautious")}
                  icon="&#128737;&#65039;" title="Cautious"
                  desc="Maximum protection. 12 gates active. Every sensitive action requires explicit approval. Best for production or if you're new to AI agents."
                  badge="Recommended" />
                <OptionCard selected={securityLevel === "balanced"} onClick={() => setSecurityLevel("balanced")}
                  icon="&#9878;&#65039;" title="Balanced"
                  desc="Smart protection. 8 gates active. Common operations are allowed, dangerous ones are gated. Good for experienced users." />
                <OptionCard selected={securityLevel === "trusted"} onClick={() => setSecurityLevel("trusted")}
                  icon="&#9889;" title="Trusted"
                  desc="Minimal friction. 3 critical gates only. The agent has broad autonomy. Only for advanced users in isolated environments."
                  warn="Only recommended if you fully understand the risks" />
              </div>

              <NavButtons onBack={goBack} onNext={goNext} />
            </div>
          )}

          {/* ── Step 3: Network ── */}
          {step === 3 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Network configuration
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                How should other devices reach your OpenClaw gateway?
              </p>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <OptionCard selected={bindAddress === "localhost"} onClick={() => setBindAddress("localhost")}
                  icon="&#128274;" title="Localhost Only (127.0.0.1)"
                  desc="Only this computer can connect. Most secure. Use SSH tunneling for remote access."
                  badge="Recommended" />
                <OptionCard selected={bindAddress === "private"} onClick={() => setBindAddress("private")}
                  icon="&#127968;" title="Private Network (0.0.0.0)"
                  desc="Devices on your WiFi/LAN can connect. Safe if your network is trusted."
                  warn="Not recommended on public WiFi or shared networks" />
                <OptionCard selected={bindAddress === "tailscale"} onClick={() => setBindAddress("tailscale")}
                  icon="&#128279;" title="Tailscale VPN"
                  desc="Encrypted mesh network. Access from anywhere securely. Requires a free Tailscale account." />
              </div>

              <DangerBox>
                <strong>Never expose to the public internet.</strong> Binding to 0.0.0.0 without
                firewall rules means anyone on your network can access your AI agent.
                OpenClaw generates a strong token, but defense in depth matters.
              </DangerBox>

              <NavButtons onBack={goBack} onNext={goNext} />
            </div>
          )}

          {/* ── Step 4: Authentication ── */}
          {step === 4 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Cryptographic authentication
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                OpenClaw uses <strong>Signed Prompt Architecture</strong> — every message you
                send is cryptographically signed with your private key. This is generated
                automatically and stored in your OS keychain.
              </p>

              <div style={{ ...glass(0), padding: 20, borderRadius: C.rs, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: keyGenerated ? C.okSoft : `${C.accent}10`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20,
                  }}>
                    {keyGenerated ? "\u2713" : "\u{1F511}"}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {keyGenerated ? "Key Generated" : "SPA Signing Key"}
                    </div>
                    <div style={{ fontSize: 11, color: C.dim }}>
                      {keyGenerated ? "ECDSA P-384 \u2022 Stored in OS Keychain" : "ECDSA P-384 \u2022 Hardware-backed encryption"}
                    </div>
                  </div>
                </div>

                {!keyGenerated ? (
                  <Btn onClick={generateKey} disabled={generatingKey} style={{ width: "100%", padding: "12px 0" }}>
                    {generatingKey ? "Generating..." : "Generate Signing Key"}
                  </Btn>
                ) : keyResult && (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                    {[
                      { l: "Key ID", v: keyResult.key_id },
                      { l: "Fingerprint", v: keyResult.fingerprint },
                      { l: "Algorithm", v: "ECDSA P-384" },
                      { l: "Storage", v: "OS Keychain (safeStorage)" },
                      { l: "Max Auth Level", v: "admin" },
                    ].map(r => (
                      <div key={r.l} style={{
                        display: "flex", justifyContent: "space-between", padding: "5px 0",
                        borderBottom: `1px solid ${C.border}`, fontSize: 12,
                      }}>
                        <span style={{ color: C.dim }}>{r.l}</span>
                        <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <InfoBox>
                <strong>Gateway token</strong> is generated automatically during installation —
                a 32-byte cryptographically random string. You never need to choose or remember it.
              </InfoBox>

              <NavButtons onBack={goBack} onNext={goNext}
                nextDisabled={!keyGenerated} nextLabel={keyGenerated ? "Continue" : "Generate key first"} />
            </div>
          )}

          {/* ── Step 5: Agent Identity ── */}
          {step === 5 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Name your first agent
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                This is your AI assistant's identity. You can create more agents later.
              </p>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: C.dim }}>
                  Agent Name
                </div>
                <Input value={agentName} onChange={setAgentName} placeholder="Atlas" />
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: C.dim }}>
                Personality
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {([
                  { id: "professional" as const, icon: "&#128188;", title: "Professional", desc: "Clear, concise, and focused on results" },
                  { id: "friendly" as const, icon: "&#128075;", title: "Friendly", desc: "Warm, approachable, uses analogies and encouragement" },
                  { id: "direct" as const, icon: "&#9889;", title: "Direct", desc: "Blunt, efficient, maximum signal, no filler" },
                  { id: "thoughtful" as const, icon: "&#129504;", title: "Thoughtful", desc: "Nuanced, explores tradeoffs, careful reasoning" },
                ]).map(p => (
                  <OptionCard key={p.id} selected={personality === p.id}
                    onClick={() => setPersonality(p.id)}
                    icon={p.icon} title={p.title} desc={p.desc} />
                ))}
              </div>

              <NavButtons onBack={goBack} onNext={goNext}
                nextDisabled={!agentName.trim()} />
            </div>
          )}

          {/* ── Step 6: Tool Permissions ── */}
          {step === 6 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Tool permissions
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                Action gates control which tools require elevated authorization.
                We've pre-selected gates based on your security posture
                ({securityLevel}). You can customize individual gates after setup.
              </p>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <OptionCard selected={gatePreset === "cautious"} onClick={() => setGatePreset("cautious")}
                  icon="&#128737;&#65039;" title="Cautious (12 gates)"
                  desc="File write, file delete, shell exec, HTTP requests, database queries, email, payments, user data, API keys, system config, network scan, process management"
                  badge={securityLevel === "cautious" ? "Matched" : undefined} />
                <OptionCard selected={gatePreset === "balanced"} onClick={() => setGatePreset("balanced")}
                  icon="&#9878;&#65039;" title="Balanced (8 gates)"
                  desc="File delete, shell exec, email, payments, API keys, system config, network scan, process management"
                  badge={securityLevel === "balanced" ? "Matched" : undefined} />
                <OptionCard selected={gatePreset === "trusted"} onClick={() => setGatePreset("trusted")}
                  icon="&#9889;" title="Trusted (3 gates)"
                  desc="Only payments, API key access, and system config require elevation"
                  badge={securityLevel === "trusted" ? "Matched" : undefined} />
                <OptionCard selected={gatePreset === "none"} onClick={() => setGatePreset("none")}
                  icon="&#9940;" title="No gates"
                  desc="All tools are available at standard authorization. Not recommended."
                  warn="Agent can perform any action without explicit approval" />
              </div>

              <NavButtons onBack={goBack} onNext={goNext} />
            </div>
          )}

          {/* ── Step 7: Review ── */}
          {step === 7 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Review your configuration
              </h2>
              <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 24 }}>
                Everything looks good? Let's install.
              </p>

              {/* Security score banner */}
              <div style={{
                ...glass(1), padding: "18px 24px", borderRadius: C.rs, marginBottom: 20,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                border: `1px solid ${scoreColor}25`,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Security Score</div>
                  <div style={{ fontSize: 11, color: C.dim }}>
                    {securityScore >= 80 ? "Excellent — fortress-level protection" :
                     securityScore >= 60 ? "Good — solid protection with reasonable flexibility" :
                     securityScore >= 40 ? "Moderate — consider tightening some settings" :
                     "Low — increase security for production use"}
                  </div>
                </div>
                <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor }}>{securityScore}</div>
              </div>

              {/* Config summary */}
              <div style={{ ...glass(0), padding: 20, borderRadius: C.rs, marginBottom: 16 }}>
                {[
                  { label: "Environment", value: environment === "local" ? "Local Machine" : environment === "cloud" ? "Cloud Server" : "Edge Device" },
                  { label: "Security Level", value: securityLevel.charAt(0).toUpperCase() + securityLevel.slice(1) },
                  { label: "Network Binding", value: bindAddress === "localhost" ? "127.0.0.1 (localhost)" : bindAddress === "private" ? "0.0.0.0 (all interfaces)" : "Tailscale VPN" },
                  { label: "Gateway Port", value: String(gatewayPort) },
                  { label: "Gateway Auth", value: "256-bit token (auto-generated)" },
                  { label: "Signing Key", value: keyResult ? `${keyResult.key_id.slice(0, 12)}... (ECDSA P-384)` : "Pending" },
                  { label: "Agent Name", value: agentName },
                  { label: "Personality", value: personality.charAt(0).toUpperCase() + personality.slice(1) },
                  { label: "Gate Preset", value: gatePreset === "none" ? "No gates" : `${gatePreset} (${gatePreset === "cautious" ? 12 : gatePreset === "balanced" ? 8 : 3} gates)` },
                  { label: "Key Storage", value: "OS Keychain (AES-256-GCM)" },
                  { label: "Audit Logging", value: "Enabled (tamper-evident hash chain)" },
                ].map(r => (
                  <div key={r.label} style={{
                    display: "flex", justifyContent: "space-between", padding: "7px 0",
                    borderBottom: `1px solid ${C.border}`, fontSize: 12,
                  }}>
                    <span style={{ color: C.dim }}>{r.label}</span>
                    <span style={{ color: C.text, fontWeight: 500 }}>{r.value}</span>
                  </div>
                ))}
              </div>

              {bindAddress === "private" && (
                <DangerBox>
                  <strong>Private network binding selected.</strong> Ensure your network
                  firewall blocks external access to port {gatewayPort}. Consider using
                  Tailscale for secure remote access instead.
                </DangerBox>
              )}

              <NavButtons onBack={goBack} onNext={() => { goNext(); runInstall(); }}
                nextLabel="Install OpenClaw" />
            </div>
          )}

          {/* ── Step 8: Install & Verify ── */}
          {step === 8 && (
            <div style={{ animation: "fadeIn .3s ease" }}>
              {!installResult && !installError && (
                <>
                  <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    Installing OpenClaw...
                  </h2>
                  <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 28 }}>
                    Sit back — we're setting up your secure AI workspace.
                  </p>

                  {/* Progress bar */}
                  <div style={{ ...glass(0), padding: 24, borderRadius: C.rs, marginBottom: 20 }}>
                    <div style={{
                      height: 6, borderRadius: 3, background: C.border,
                      overflow: "hidden", marginBottom: 16,
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 3, background: C.grad,
                        width: `${Math.max(5, installProgress?.percent ?? 5)}%`,
                        transition: "width .5s ease",
                      }} />
                    </div>

                    {/* Step log */}
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                      {["detect", "download", "configure", "start", "verify", "complete"].map(s => {
                        const isActive = installProgress?.step === s;
                        const isDone = installProgress && ["detect", "download", "configure", "start", "verify", "complete"]
                          .indexOf(installProgress.step) > ["detect", "download", "configure", "start", "verify", "complete"].indexOf(s);

                        return (
                          <div key={s} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            opacity: isActive ? 1 : isDone ? 0.6 : 0.3,
                            transition: "opacity .3s",
                          }}>
                            {isDone ? (
                              <div style={{ width: 20, height: 20, borderRadius: "50%", background: C.okSoft, display: "flex", alignItems: "center", justifyContent: "center", color: C.ok, fontSize: 11, fontWeight: 700 }}>&#10003;</div>
                            ) : isActive ? (
                              <Spinner size={16} />
                            ) : (
                              <div style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.border}` }} />
                            )}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400 }}>
                                {s === "detect" ? "Detecting installation" :
                                 s === "download" ? "Downloading OpenClaw" :
                                 s === "configure" ? "Generating configuration" :
                                 s === "start" ? "Starting gateway" :
                                 s === "verify" ? "Verifying connection" :
                                 "Finishing up"}
                              </div>
                              {isActive && installProgress?.message && (
                                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                                  {installProgress.message}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Success */}
              {installResult && installResult.success && (
                <div style={{ textAlign: "center" as const }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: "50%", margin: "0 auto 24px",
                    background: C.okSoft, border: `2px solid ${C.ok}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 32, color: C.ok, animation: "scaleIn .3s ease",
                  }}>&#10003;</div>

                  <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    OpenClaw is Ready
                  </h2>
                  <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginBottom: 28 }}>
                    Your secure AI workspace is fully configured. Every prompt is
                    cryptographically signed and verified.
                  </p>

                  <div style={{ ...glass(0), padding: 20, borderRadius: C.rs, marginBottom: 20, textAlign: "left" as const }}>
                    {[
                      { l: "Gateway", v: installResult.gateway_url },
                      { l: "Agent", v: installResult.agent_name },
                      { l: "Security Score", v: `${installResult.security_score}/100` },
                      { l: "Signing Key", v: keyResult?.key_id?.slice(0, 16) ?? "Active" },
                      { l: "Config", v: installResult.config_path },
                    ].map(r => (
                      <div key={r.l} style={{
                        display: "flex", justifyContent: "space-between", padding: "6px 0",
                        borderBottom: `1px solid ${C.border}`, fontSize: 12,
                      }}>
                        <span style={{ color: C.dim }}>{r.l}</span>
                        <span style={{
                          color: C.text, fontFamily: C.mono, fontSize: 11,
                          maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis",
                        }}>{r.v}</span>
                      </div>
                    ))}
                  </div>

                  <Btn onClick={() => onComplete(installResult)}
                    style={{ width: "100%", padding: "14px 0", fontSize: 15 }}>
                    Open Dashboard
                  </Btn>
                </div>
              )}

              {/* Error */}
              {installError && (
                <div>
                  <div style={{
                    width: 72, height: 72, borderRadius: "50%", margin: "0 auto 24px",
                    background: C.errSoft, border: `2px solid ${C.err}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 32, color: C.err,
                  }}>&#10007;</div>

                  <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, textAlign: "center" as const }}>
                    Installation Failed
                  </h2>

                  <div style={{
                    ...glass(0), padding: 16, borderRadius: C.rs, marginBottom: 20,
                    background: C.errSoft, border: `1px solid ${C.err}30`,
                  }}>
                    <div style={{ fontSize: 13, color: C.err, fontWeight: 600, marginBottom: 6 }}>Error</div>
                    <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, fontFamily: C.mono }}>
                      {installError}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn v="g" onClick={() => setStep(7)} style={{ flex: 1 }}>Back to Review</Btn>
                    <Btn onClick={() => { setInstallError(null); setInstallProgress(null); runInstall(); }}
                      style={{ flex: 1 }}>Retry</Btn>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
