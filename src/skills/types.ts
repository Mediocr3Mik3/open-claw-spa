/**
 * openclaw-spa — Skills Framework Types
 *
 * Skills are community-contributed capability packages that extend what
 * OpenClaw agents can do. Every skill must meet a community trust threshold
 * before it can be installed. Skills are sandboxed and gated by SPA.
 *
 * Trust model:
 *   1. Skills are published to a registry with a manifest
 *   2. Community members review, audit, and vote on skills
 *   3. Only skills above the trust threshold can be installed
 *   4. Installed skills are sandboxed — they declare required gates
 *   5. Users must approve each gate level the skill requires
 */

// ─── Skill Manifest ─────────────────────────────────────────────────────

export interface SkillManifest {
  /** Unique skill identifier (reverse-domain: com.openclaw.web-search) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description (one line) */
  summary: string;
  /** Full description (markdown) */
  description: string;
  /** Semantic version */
  version: string;
  /** Author info */
  author: SkillAuthor;
  /** Category for browsing */
  category: SkillCategory;
  /** Tags for search */
  tags: string[];
  /** Icon URL or emoji */
  icon?: string;
  /** Repository URL */
  repository?: string;
  /** License identifier (SPDX) */
  license: string;
  /** Minimum OpenClaw SPA version required */
  min_spa_version?: string;
  /** Tools/actions this skill registers */
  tools: SkillToolDefinition[];
  /** Gate levels this skill requires */
  required_gates: SkillGateRequirement[];
  /** Configuration schema (JSON Schema) */
  config_schema?: Record<string, unknown>;
  /** Default configuration values */
  default_config?: Record<string, unknown>;
  /** Dependencies on other skills */
  dependencies?: string[];
  /** Published timestamp */
  published_at: string;
  /** Last updated timestamp */
  updated_at: string;
}

export interface SkillAuthor {
  name: string;
  email?: string;
  url?: string;
  /** Verified author (signed their publish with a known key) */
  verified: boolean;
}

export type SkillCategory =
  | "productivity"
  | "development"
  | "research"
  | "communication"
  | "data"
  | "media"
  | "security"
  | "automation"
  | "integration"
  | "other";

export interface SkillToolDefinition {
  /** Tool name (namespaced: skill_id.tool_name) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Parameter schema */
  parameters: Record<string, unknown>;
  /** Required auth level to invoke this tool */
  required_level: "standard" | "elevated" | "admin";
}

export interface SkillGateRequirement {
  /** The gate/tool this skill needs access to */
  tool: string;
  /** Why the skill needs this gate */
  reason: string;
  /** Required auth level */
  level: "standard" | "elevated" | "admin";
}

// ─── Trust & Review System ──────────────────────────────────────────────

export interface SkillTrustInfo {
  /** Skill ID */
  skill_id: string;
  /** Overall trust score (0-100) */
  trust_score: number;
  /** Number of installs */
  install_count: number;
  /** Number of reviews */
  review_count: number;
  /** Average rating (1-5) */
  average_rating: number;
  /** Number of security audits passed */
  audit_count: number;
  /** Has the code been audited by a trusted reviewer? */
  code_audited: boolean;
  /** Is the author verified? */
  author_verified: boolean;
  /** Known vulnerabilities */
  vulnerabilities: SkillVulnerability[];
  /** Trust tier derived from score */
  tier: TrustTier;
  /** Last audit timestamp */
  last_audited?: string;
}

export type TrustTier =
  | "trusted"       // score >= 80, audited, verified author
  | "community"     // score >= 50, multiple reviews
  | "new"           // score < 50, few reviews
  | "untrusted"     // flagged or no reviews
  | "blocked";      // known malicious

/** Minimum trust score to allow installation */
export const TRUST_INSTALL_THRESHOLD = 50;

/** Minimum trust score for auto-approval (no user prompt) */
export const TRUST_AUTO_THRESHOLD = 80;

export interface SkillVulnerability {
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  reported_at: string;
  resolved: boolean;
  cve?: string;
}

export interface SkillReview {
  reviewer_id: string;
  reviewer_name: string;
  rating: number; // 1-5
  comment: string;
  verified_install: boolean; // Did this reviewer actually install the skill?
  created_at: string;
}

// ─── Installed Skills ───────────────────────────────────────────────────

export interface InstalledSkill {
  /** Skill manifest */
  manifest: SkillManifest;
  /** Trust info at time of install */
  trust: SkillTrustInfo;
  /** User's configuration overrides */
  config: Record<string, unknown>;
  /** Whether the skill is currently enabled */
  enabled: boolean;
  /** When the user installed it */
  installed_at: string;
  /** Which gate approvals the user granted */
  approved_gates: string[];
  /** Agents that have this skill enabled */
  enabled_for_agents: string[];
}

// ─── Registry API ───────────────────────────────────────────────────────

export interface SkillSearchParams {
  query?: string;
  category?: SkillCategory;
  tags?: string[];
  min_trust_score?: number;
  sort_by?: "trust_score" | "install_count" | "updated_at" | "rating";
  page?: number;
  per_page?: number;
}

export interface SkillSearchResult {
  skills: (SkillManifest & { trust: SkillTrustInfo })[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Events ─────────────────────────────────────────────────────────────

export type SkillEventType =
  | "skill_installed"
  | "skill_removed"
  | "skill_enabled"
  | "skill_disabled"
  | "skill_updated"
  | "skill_gate_approved"
  | "skill_gate_denied"
  | "skill_trust_changed"
  | "skill_vulnerability_found";

export interface SkillEvent {
  type: SkillEventType;
  skill_id: string;
  detail: string;
  timestamp: string;
}
