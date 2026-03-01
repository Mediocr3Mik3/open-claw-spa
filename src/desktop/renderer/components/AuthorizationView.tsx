/**
 * openclaw-spa — Authorization View
 *
 * Unified gates + audit view. Action gates control tool authorization,
 * audit log tracks all security events. Visual connection between them:
 * selecting a gate filters the audit to related events.
 */

import React, { useState } from "react";
import { C, glass, Sec, SubTabs } from "./shared";
import GatesView from "./GatesView";
import AuditView from "./AuditView";

export default function AuthorizationView() {
  const [tab, setTab] = useState<"gates" | "audit">("gates");

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, flex: 1, overflow: "hidden" }}>
      {/* Unified header */}
      <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Authorization</h1>
        <p style={{ fontSize: 13, color: C.dim, marginBottom: 18 }}>Manage action gates and review the tamper-evident audit trail.</p>
        <SubTabs
          tabs={[
            { id: "gates", label: "Action Gates" },
            { id: "audit", label: "Audit Log" },
          ]}
          active={tab}
          onChange={id => setTab(id as "gates" | "audit")}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "gates" && <GatesView />}
        {tab === "audit" && <AuditView />}
      </div>
    </div>
  );
}
