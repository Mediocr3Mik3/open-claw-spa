/**
 * openclaw-spa — Skill CLI Commands
 *
 * Implements `skill install`, `skill list`, `skill remove`, `skill update`
 * as CLI subcommands. Resolves skills from ClawHub or raw GitHub URLs,
 * validates trust scores, and manages local skill installations.
 *
 * Trust tier thresholds (from src/skills/types.ts):
 *   Trusted   >= 80   — code audited, verified author
 *   Community >= 50   — positive reviews, moderate adoption
 *   New       >= 30   — recently published
 *   Untrusted  < 30   — install at your own risk
 *   Blocked    = 0    — flagged for security concerns
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import type { SkillManifest, SkillTrustInfo, TrustTier, InstalledSkill } from "../skills/types.js";

// ─── Constants ──────────────────────────────────────────────────────────

const SPA_DIR = path.join(os.homedir(), ".openclaw-spa");
const SKILLS_DIR = path.join(SPA_DIR, "skills");
const SKILLS_INDEX = path.join(SKILLS_DIR, "installed.json");
const CLAWHUB_API = "https://hub.openclaw.ai/api/v1/skills";

// ─── Trust helpers ──────────────────────────────────────────────────────

function getTrustTier(score: number): TrustTier {
  if (score >= 80) return "trusted";
  if (score >= 50) return "community";
  if (score >= 30) return "new";
  if (score > 0) return "untrusted";
  return "blocked";
}

function tierColor(tier: TrustTier): string {
  switch (tier) {
    case "trusted":   return "\x1b[32m";  // green
    case "community": return "\x1b[36m";  // cyan
    case "new":       return "\x1b[33m";  // yellow
    case "untrusted": return "\x1b[31m";  // red
    case "blocked":   return "\x1b[41m";  // red bg
  }
}

// ─── Filesystem helpers ─────────────────────────────────────────────────

function ensureDirs(): void {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function loadInstalledSkills(): InstalledSkill[] {
  if (!fs.existsSync(SKILLS_INDEX)) return [];
  try {
    return JSON.parse(fs.readFileSync(SKILLS_INDEX, "utf-8"));
  } catch {
    return [];
  }
}

function saveInstalledSkills(skills: InstalledSkill[]): void {
  ensureDirs();
  fs.writeFileSync(SKILLS_INDEX, JSON.stringify(skills, null, 2));
}

// ─── HTTP helper ────────────────────────────────────────────────────────

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = (currentUrl: string, redirects: number = 0): void => {
      if (redirects > 5) { reject(new Error("Too many redirects")); return; }
      https.get(currentUrl, { headers: { "User-Agent": "openclaw-spa-cli" }, timeout: 15000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${currentUrl}`));
          return;
        }
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => resolve(data));
      }).on("error", reject);
    };
    request(url);
  });
}

// ─── Resolve skill manifest ────────────────────────────────────────────

async function resolveSkill(nameOrUrl: string): Promise<{ manifest: SkillManifest; trust: SkillTrustInfo } | null> {
  // GitHub URL: fetch manifest.json from repo
  if (nameOrUrl.startsWith("https://github.com/")) {
    try {
      // Convert github.com URL to raw content URL
      const rawUrl = nameOrUrl
        .replace("github.com", "raw.githubusercontent.com")
        .replace(/\/?$/, "/main/manifest.json");
      const data = await httpGet(rawUrl);
      const manifest: SkillManifest = JSON.parse(data);

      // GitHub-sourced skills get a baseline trust score
      const trust: SkillTrustInfo = {
        skill_id: manifest.id,
        trust_score: 25,
        install_count: 0,
        review_count: 0,
        average_rating: 0,
        audit_count: 0,
        code_audited: false,
        author_verified: false,
        vulnerabilities: [],
        tier: "untrusted",
      };

      return { manifest, trust };
    } catch (err: any) {
      console.error(`  Failed to fetch manifest from GitHub: ${err.message}`);
      return null;
    }
  }

  // ClawHub: query the registry API
  try {
    const data = await httpGet(`${CLAWHUB_API}/${encodeURIComponent(nameOrUrl)}`);
    const result = JSON.parse(data);
    return {
      manifest: result.manifest ?? result,
      trust: result.trust ?? {
        skill_id: nameOrUrl,
        trust_score: result.trust_score ?? 0,
        install_count: 0,
        review_count: 0,
        average_rating: 0,
        audit_count: 0,
        code_audited: false,
        author_verified: false,
        vulnerabilities: [],
        tier: getTrustTier(result.trust_score ?? 0),
      },
    };
  } catch (err: any) {
    console.error(`  Failed to resolve skill "${nameOrUrl}" from ClawHub: ${err.message}`);
    return null;
  }
}

// ─── Commands ───────────────────────────────────────────────────────────

export async function cmdSkillInstall(nameOrUrl: string): Promise<void> {
  if (!nameOrUrl) {
    console.error("  Usage: skill install <skill-name-or-github-url>");
    process.exit(1);
  }

  console.log(`\n  Resolving skill: ${nameOrUrl}...`);

  const result = await resolveSkill(nameOrUrl);
  if (!result) {
    console.error("  Could not resolve skill. Check the name or URL and try again.");
    process.exit(1);
  }

  const { manifest, trust } = result;
  const tier = getTrustTier(trust.trust_score);
  const color = tierColor(tier);

  console.log(`\n  Skill:   ${manifest.name} v${manifest.version}`);
  console.log(`  Author:  ${manifest.author.name}${manifest.author.verified ? " ✓" : ""}`);
  console.log(`  Trust:   ${color}${tier.toUpperCase()}\x1b[0m (score: ${trust.trust_score})`);
  console.log(`  License: ${manifest.license}`);

  // Block if score is 0 / Blocked
  if (trust.trust_score === 0 || tier === "blocked") {
    console.error(`\n  \x1b[31m✘ BLOCKED\x1b[0m — This skill has been flagged for security concerns.`);
    console.error("  Installation is not allowed.");
    process.exit(1);
  }

  // Warn if trust < 50
  if (trust.trust_score < 50) {
    console.log(`\n  \x1b[33m⚠ WARNING:\x1b[0m Trust score is below 50. Install at your own risk.`);
  }

  // Install: download manifest into skills dir
  ensureDirs();
  const skillDir = path.join(SKILLS_DIR, manifest.id);
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(skillDir, "trust.json"), JSON.stringify(trust, null, 2));

  // Register in installed index
  const installed = loadInstalledSkills();
  const existing = installed.findIndex(s => s.manifest.id === manifest.id);
  const entry: InstalledSkill = {
    manifest,
    trust,
    config: manifest.default_config ?? {},
    enabled: true,
    installed_at: new Date().toISOString(),
    approved_gates: [],
    enabled_for_agents: [],
  };

  if (existing >= 0) {
    installed[existing] = entry;
  } else {
    installed.push(entry);
  }
  saveInstalledSkills(installed);

  console.log(`\n  \x1b[32m✔\x1b[0m Installed to ${skillDir}`);

  // Print gate requirements
  if (manifest.required_gates && manifest.required_gates.length > 0) {
    console.log("\n  Gate requirements:");
    for (const gate of manifest.required_gates) {
      console.log(`    ${gate.level.padEnd(9)} ${gate.tool.padEnd(20)} ${gate.reason}`);
    }
  }

  console.log();
}

export function cmdSkillList(): void {
  const installed = loadInstalledSkills();

  if (installed.length === 0) {
    console.log("\n  No skills installed.");
    console.log("  Install one: npx tsx src/cli/main.ts skill install <name>\n");
    return;
  }

  console.log(`\n  ${installed.length} skill(s) installed:\n`);

  for (const s of installed) {
    const tier = getTrustTier(s.trust.trust_score);
    const color = tierColor(tier);
    const status = s.enabled ? "\x1b[32m●\x1b[0m" : "\x1b[31m○\x1b[0m";
    console.log(`  ${status} ${s.manifest.name.padEnd(30)} v${s.manifest.version.padEnd(10)} ${color}${tier.toUpperCase().padEnd(10)}\x1b[0m score:${s.trust.trust_score}`);
  }
  console.log();
}

export function cmdSkillRemove(skillName: string): void {
  if (!skillName) {
    console.error("  Usage: skill remove <skill-name>");
    process.exit(1);
  }

  const installed = loadInstalledSkills();
  const idx = installed.findIndex(s => s.manifest.id === skillName || s.manifest.name === skillName);

  if (idx < 0) {
    console.error(`  Skill "${skillName}" is not installed.`);
    process.exit(1);
  }

  const skill = installed[idx]!;
  const skillDir = path.join(SKILLS_DIR, skill.manifest.id);

  // Remove directory
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  // Remove from index
  installed.splice(idx, 1);
  saveInstalledSkills(installed);

  console.log(`\n  \x1b[32m✔\x1b[0m Removed ${skill.manifest.name} (${skill.manifest.id})\n`);
}

export async function cmdSkillUpdate(skillName: string): Promise<void> {
  if (!skillName) {
    console.error("  Usage: skill update <skill-name>");
    process.exit(1);
  }

  const installed = loadInstalledSkills();
  const idx = installed.findIndex(s => s.manifest.id === skillName || s.manifest.name === skillName);

  if (idx < 0) {
    console.error(`  Skill "${skillName}" is not installed.`);
    process.exit(1);
  }

  const current = installed[idx]!;
  console.log(`\n  Checking for updates to ${current.manifest.name}...`);

  // Re-resolve from source
  const source = current.manifest.repository ?? current.manifest.id;
  const result = await resolveSkill(source);

  if (!result) {
    console.error("  Could not fetch latest version.");
    process.exit(1);
  }

  const { manifest, trust } = result;
  const tier = getTrustTier(trust.trust_score);

  if (manifest.version === current.manifest.version) {
    console.log(`  Already on latest version: v${manifest.version}`);
    return;
  }

  // Re-validate trust
  if (trust.trust_score === 0 || tier === "blocked") {
    console.error(`\n  \x1b[31m✘ BLOCKED\x1b[0m — This skill has been flagged. Update aborted.`);
    process.exit(1);
  }

  if (trust.trust_score < 50) {
    console.log(`  \x1b[33m⚠ WARNING:\x1b[0m New version trust score is below 50.`);
  }

  // Update
  const skillDir = path.join(SKILLS_DIR, manifest.id);
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(skillDir, "trust.json"), JSON.stringify(trust, null, 2));

  installed[idx] = {
    ...current,
    manifest,
    trust,
    installed_at: new Date().toISOString(),
  };
  saveInstalledSkills(installed);

  const color = tierColor(tier);
  console.log(`\n  \x1b[32m✔\x1b[0m Updated ${manifest.name}: v${current.manifest.version} → v${manifest.version}`);
  console.log(`  Trust: ${color}${tier.toUpperCase()}\x1b[0m (score: ${trust.trust_score})\n`);
}
