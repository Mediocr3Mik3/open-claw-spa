/**
 * openclaw-spa — Multi-User Organization Support
 *
 * Manages organizations, members, and role-based access control.
 * Stored in SQLite alongside the audit log.
 *
 * Roles:
 *   - owner:    Full control. Can delete org, manage all members.
 *   - admin:    Can manage keys, adapters, and operators.
 *   - operator: Can use the bridge, see audit logs, manage own keys.
 *   - readonly: Can view dashboard and audit logs only.
 */

import Database from "better-sqlite3";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";

export type OrgRole = "owner" | "admin" | "operator" | "readonly";

export interface Organization {
  org_id: string;
  name: string;
  created_at: string;
}

export interface OrgMember {
  member_id: string;
  org_id: string;
  user_id: string;
  display_name: string;
  role: OrgRole;
  spa_key_id?: string;
  created_at: string;
  active: boolean;
}

export class OrgManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        org_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS org_members (
        member_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'readonly',
        spa_key_id TEXT,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (org_id) REFERENCES organizations(org_id),
        UNIQUE(org_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS policies (
        policy_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        rules TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (org_id) REFERENCES organizations(org_id)
      );
    `);
  }

  // ─── Organizations ─────────────────────────────────────────────────────

  createOrg(name: string): Organization {
    const org: Organization = {
      org_id: crypto.randomUUID(),
      name,
      created_at: new Date().toISOString(),
    };

    this.db.prepare(
      "INSERT INTO organizations (org_id, name, created_at) VALUES (?, ?, ?)"
    ).run(org.org_id, org.name, org.created_at);

    return org;
  }

  getOrg(orgId: string): Organization | null {
    return this.db.prepare("SELECT * FROM organizations WHERE org_id = ?").get(orgId) as Organization | null;
  }

  listOrgs(): Organization[] {
    return this.db.prepare("SELECT * FROM organizations ORDER BY created_at DESC").all() as Organization[];
  }

  // ─── Members ───────────────────────────────────────────────────────────

  addMember(orgId: string, userId: string, displayName: string, role: OrgRole, spaKeyId?: string): OrgMember {
    const member: OrgMember = {
      member_id: crypto.randomUUID(),
      org_id: orgId,
      user_id: userId,
      display_name: displayName,
      role,
      spa_key_id: spaKeyId,
      created_at: new Date().toISOString(),
      active: true,
    };

    this.db.prepare(`
      INSERT INTO org_members (member_id, org_id, user_id, display_name, role, spa_key_id, created_at, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(member.member_id, member.org_id, member.user_id, member.display_name, member.role, member.spa_key_id ?? null, member.created_at);

    return member;
  }

  getMember(orgId: string, userId: string): OrgMember | null {
    return this.db.prepare(
      "SELECT * FROM org_members WHERE org_id = ? AND user_id = ? AND active = 1"
    ).get(orgId, userId) as OrgMember | null;
  }

  listMembers(orgId: string): OrgMember[] {
    return this.db.prepare(
      "SELECT * FROM org_members WHERE org_id = ? AND active = 1 ORDER BY created_at"
    ).all(orgId) as OrgMember[];
  }

  updateMemberRole(memberId: string, newRole: OrgRole): boolean {
    const result = this.db.prepare(
      "UPDATE org_members SET role = ? WHERE member_id = ?"
    ).run(newRole, memberId);
    return result.changes > 0;
  }

  deactivateMember(memberId: string): boolean {
    const result = this.db.prepare(
      "UPDATE org_members SET active = 0 WHERE member_id = ?"
    ).run(memberId);
    return result.changes > 0;
  }

  bindKeyToMember(memberId: string, spaKeyId: string): boolean {
    const result = this.db.prepare(
      "UPDATE org_members SET spa_key_id = ? WHERE member_id = ?"
    ).run(spaKeyId, memberId);
    return result.changes > 0;
  }

  // ─── Policies ──────────────────────────────────────────────────────────

  createPolicy(orgId: string, name: string, description: string, rules: PolicyRules): string {
    const policyId = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO policies (policy_id, org_id, name, description, rules, created_at, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(policyId, orgId, name, description, JSON.stringify(rules), new Date().toISOString());
    return policyId;
  }

  getOrgPolicies(orgId: string): Array<{ policy_id: string; name: string; description: string; rules: PolicyRules; active: boolean }> {
    const rows = this.db.prepare(
      "SELECT * FROM policies WHERE org_id = ? AND active = 1"
    ).all(orgId) as Array<{ policy_id: string; name: string; description: string | null; rules: string; active: number }>;

    return rows.map((r) => ({
      policy_id: r.policy_id,
      name: r.name,
      description: r.description ?? "",
      rules: JSON.parse(r.rules) as PolicyRules,
      active: r.active === 1,
    }));
  }

  /**
   * Evaluate whether a member is allowed to perform an action based on org policies.
   */
  evaluatePolicy(orgId: string, userId: string, action: string, authLevel: string): PolicyDecision {
    const member = this.getMember(orgId, userId);
    if (!member) {
      return { allowed: false, reason: "User is not a member of this organization" };
    }

    if (!member.active) {
      return { allowed: false, reason: "Member account is deactivated" };
    }

    // Role-based baseline
    const roleCapabilities: Record<OrgRole, string[]> = {
      owner: ["*"],
      admin: ["key_manage", "adapter_manage", "member_manage", "audit_read", "message_send", "config_edit"],
      operator: ["message_send", "audit_read", "key_own"],
      readonly: ["audit_read", "dashboard_view"],
    };

    const caps = roleCapabilities[member.role] ?? [];
    if (!caps.includes("*") && !caps.includes(action)) {
      return { allowed: false, reason: `Role '${member.role}' does not have capability: ${action}` };
    }

    // Check org policies
    const policies = this.getOrgPolicies(orgId);
    for (const policy of policies) {
      for (const rule of policy.rules.deny ?? []) {
        if (this.ruleMatches(rule, member.role, action, authLevel)) {
          return { allowed: false, reason: `Denied by policy: ${policy.name} — ${rule.reason ?? "no reason"}` };
        }
      }
    }

    return { allowed: true };
  }

  private ruleMatches(rule: PolicyRule, role: OrgRole, action: string, authLevel: string): boolean {
    if (rule.roles && !rule.roles.includes(role)) return false;
    if (rule.actions && !rule.actions.includes(action) && !rule.actions.includes("*")) return false;
    if (rule.auth_levels && !rule.auth_levels.includes(authLevel)) return false;
    return true;
  }

  close(): void {
    this.db.close();
  }
}

// ─── Policy Types ──────────────────────────────────────────────────────────

export interface PolicyRule {
  roles?: OrgRole[];
  actions?: string[];
  auth_levels?: string[];
  reason?: string;
}

export interface PolicyRules {
  deny?: PolicyRule[];
  allow?: PolicyRule[];
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}
