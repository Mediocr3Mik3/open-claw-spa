/**
 * openclaw-spa — Zero State Screen
 *
 * Displayed when OpenClaw is not detected on the system.
 * Two paths: "Begin Installation" or "Connect to Existing Gateway".
 * Marble-themed with ambient animation.
 */

import React, { useState, useEffect } from "react";
import { C, glass, injectCSS, Btn, Input, Spinner } from "./shared";

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

interface ZeroStateProps {
  detection: DetectionResult;
  onBeginInstall: () => void;
  onConnectExisting: (url: string) => void;
  onRetry: () => void;
}

export default function ZeroState({ detection, onBeginInstall, onConnectExisting, onRetry }: ZeroStateProps) {
  const [showConnect, setShowConnect] = useState(false);
  const [gwUrl, setGwUrl] = useState("ws://localhost:3210/ws");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  useEffect(() => { injectCSS(); }, []);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.spa.installer.detect(gwUrl);
      setTestResult(result.gateway_reachable);
      if (result.gateway_reachable) {
        setTimeout(() => onConnectExisting(gwUrl), 800);
      }
    } catch {
      setTestResult(false);
    }
    setTesting(false);
  };

  const statusMessages: Record<string, { icon: string; title: string; sub: string; action: string }> = {
    not_installed: {
      icon: "\u{1F9E9}",
      title: "OpenClaw Not Found",
      sub: "Your secure AI workspace is ready to be created. We'll handle everything — no command line needed.",
      action: "Begin Installation",
    },
    installed_not_running: {
      icon: "\u{1F4E6}",
      title: "OpenClaw Found, Gateway Offline",
      sub: `Binary detected at ${detection.binary_path ?? "unknown path"}${detection.binary_version ? ` (${detection.binary_version})` : ""}. The gateway isn't running yet.`,
      action: "Start & Configure",
    },
    running_not_configured: {
      icon: "\u26A1",
      title: "Gateway Running, Setup Needed",
      sub: "OpenClaw gateway is reachable. Let's finish setting up your secure workspace.",
      action: "Complete Setup",
    },
  };

  const info = statusMessages[detection.status] ?? statusMessages.not_installed;
  const isNotInstalled = detection.status === "not_installed";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", width: "100vw",
      background: "transparent", color: C.text, fontFamily: C.font,
      position: "relative", overflow: "hidden",
    }}>
      {/* Ambient marble gradient background */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.06,
        background: `radial-gradient(ellipse at 20% 50%, ${C.accent}, transparent 70%), radial-gradient(ellipse at 80% 20%, rgba(52,211,153,0.4), transparent 60%), radial-gradient(ellipse at 50% 80%, rgba(251,191,36,0.3), transparent 60%)`,
        animation: "fadeIn 1.5s ease",
      }} />

      {/* Floating orbs */}
      <div style={{
        position: "absolute", width: 300, height: 300, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.accent}08, transparent 70%)`,
        top: "10%", left: "15%",
        animation: "pulse 8s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", width: 200, height: 200, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(52,211,153,0.04), transparent 70%)`,
        bottom: "15%", right: "20%",
        animation: "pulse 6s ease-in-out infinite",
      }} />

      {/* Main content card */}
      <div style={{
        position: "relative", zIndex: 1, maxWidth: 520, width: "100%",
        padding: "48px 44px", textAlign: "center" as const,
        animation: "scaleIn .4s ease",
      }}>
        {/* Logo */}
        <div style={{
          width: 80, height: 80, borderRadius: 20, margin: "0 auto 28px",
          background: `linear-gradient(135deg, ${C.accent}12, rgba(52,211,153,0.08))`,
          border: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36,
        }}>
          <span style={{
            background: C.grad,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: -1,
          }}>OC</span>
        </div>

        {/* Status icon */}
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.9 }}>{info.icon}</div>

        {/* Title */}
        <h1 style={{
          fontSize: 26, fontWeight: 700, marginBottom: 10,
          letterSpacing: -0.5, lineHeight: 1.2,
        }}>{info.title}</h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 14, color: C.dim, lineHeight: 1.7,
          marginBottom: 32, maxWidth: 400, margin: "0 auto 32px",
        }}>{info.sub}</p>

        {/* Platform badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 16px", borderRadius: 20,
          background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
          fontSize: 11, color: C.muted, marginBottom: 28,
        }}>
          <span>{detection.platform.os === "darwin" ? "macOS" : detection.platform.os === "win32" ? "Windows" : "Linux"}</span>
          <span style={{ opacity: 0.3 }}>&middot;</span>
          <span>{detection.platform.arch}</span>
          {detection.binary_found && (
            <>
              <span style={{ opacity: 0.3 }}>&middot;</span>
              <span style={{ color: C.ok }}>Binary found</span>
            </>
          )}
        </div>

        {/* Primary action */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 20 }}>
          <button onClick={onBeginInstall} style={{
            width: "100%", padding: "14px 0", borderRadius: C.rs,
            background: C.grad, color: "#fff", border: "none",
            fontSize: 15, fontWeight: 600, letterSpacing: 0.2,
            transition: "all .15s", cursor: "pointer",
          }}>{info.action}</button>

          {isNotInstalled && (
            <button onClick={() => setShowConnect(!showConnect)} style={{
              width: "100%", padding: "12px 0", borderRadius: C.rs,
              background: "rgba(255,255,255,0.03)", color: C.dim,
              border: `1px solid ${C.border}`,
              fontSize: 13, fontWeight: 600, transition: "all .15s",
              cursor: "pointer",
            }}>
              {showConnect ? "Back" : "Already installed? Connect Now"}
            </button>
          )}
        </div>

        {/* Connect to existing gateway */}
        {showConnect && (
          <div style={{
            ...glass(0), padding: 20, borderRadius: C.rs,
            textAlign: "left" as const, animation: "fadeIn .2s ease",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
              Gateway URL
            </div>
            <Input value={gwUrl} onChange={setGwUrl} placeholder="ws://localhost:3210/ws"
              style={{ marginBottom: 12 }}
              onKeyDown={e => { if (e.key === "Enter") testConnection(); }} />

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn onClick={testConnection} disabled={testing || !gwUrl.trim()} style={{ flex: 1 }}>
                {testing ? "Testing..." : "Test Connection"}
              </Btn>
              {testResult === true && (
                <span style={{ fontSize: 12, color: C.ok, fontWeight: 600 }}>&#10003; Connected</span>
              )}
              {testResult === false && (
                <span style={{ fontSize: 12, color: C.err, fontWeight: 600 }}>&#10007; Unreachable</span>
              )}
            </div>

            {testResult === false && (
              <div style={{
                marginTop: 10, padding: "10px 14px", borderRadius: C.rx,
                background: C.errSoft, color: C.err, fontSize: 11, lineHeight: 1.5,
              }}>
                Could not reach the gateway. Make sure OpenClaw is running and the URL is correct.
              </div>
            )}
          </div>
        )}

        {/* Retry button */}
        <button onClick={onRetry} style={{
          background: "none", border: "none", color: C.muted,
          fontSize: 11, marginTop: 16, cursor: "pointer",
          textDecoration: "underline" as const,
        }}>Re-scan system</button>

        {/* Footer */}
        <div style={{
          marginTop: 36, fontSize: 10, color: C.muted, opacity: 0.5,
          lineHeight: 1.6,
        }}>
          OpenClaw &middot; Signed Prompt Architecture<br />
          Every prompt cryptographically verified
        </div>
      </div>
    </div>
  );
}
