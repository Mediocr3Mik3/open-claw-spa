/**
 * openclaw-spa — Spend Tracker
 *
 * Tracks token usage and estimated costs per provider, model, and session.
 * Persists to an NDJSON file for easy querying and dashboard display.
 * Integrates with ActiveProviderManager for budget-aware auto-switching.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  SpendRecord,
  SpendSummary,
  BudgetConfig,
  TokenUsage,
} from "./types.js";
import { estimateCost, findModel } from "./model-database.js";

const DEFAULT_BUDGET: BudgetConfig = {
  monthly_limit_usd: 50,
  warn_at_percent: 80,
  force_local_at_percent: 100,
  enabled: false,
};

export class SpendTracker {
  private filePath: string;
  private records: SpendRecord[] = [];
  private budget: BudgetConfig;
  private onBudgetUpdate?: (totalUsd: number) => void;

  constructor(opts: {
    data_dir: string;
    budget?: BudgetConfig;
    onBudgetUpdate?: (totalUsd: number) => void;
  }) {
    this.filePath = path.join(opts.data_dir, "spend-log.ndjson");
    this.budget = opts.budget ?? { ...DEFAULT_BUDGET };
    this.onBudgetUpdate = opts.onBudgetUpdate;

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.loadRecords();
  }

  // ─── Recording ────────────────────────────────────────────────────────

  /**
   * Record token usage from a completion. Auto-calculates estimated cost.
   */
  record(opts: {
    provider_id: string;
    model_id: string;
    usage: TokenUsage;
    session_id?: string;
  }): SpendRecord {
    const model = findModel(opts.model_id);
    const cost = model
      ? estimateCost(model, opts.usage.input_tokens, opts.usage.output_tokens) ?? 0
      : 0;

    const record: SpendRecord = {
      timestamp: new Date().toISOString(),
      provider_id: opts.provider_id,
      model_id: opts.model_id,
      input_tokens: opts.usage.input_tokens,
      output_tokens: opts.usage.output_tokens,
      estimated_cost_usd: cost,
      session_id: opts.session_id,
    };

    this.records.push(record);
    this.appendRecord(record);

    // Notify budget listeners
    if (this.onBudgetUpdate) {
      const monthTotal = this.getCurrentMonthSpend();
      this.onBudgetUpdate(monthTotal);
    }

    return record;
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  /**
   * Get spend summary for a time period.
   */
  getSummary(since?: string, until?: string): SpendSummary {
    const start = since ? new Date(since) : this.getMonthStart();
    const end = until ? new Date(until) : new Date();

    const filtered = this.records.filter(r => {
      const t = new Date(r.timestamp);
      return t >= start && t <= end;
    });

    const byProvider: Record<string, { cost_usd: number; tokens: number }> = {};
    const byModel: Record<string, { cost_usd: number; tokens: number }> = {};
    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;

    for (const r of filtered) {
      totalCost += r.estimated_cost_usd;
      totalInput += r.input_tokens;
      totalOutput += r.output_tokens;

      if (!byProvider[r.provider_id]) byProvider[r.provider_id] = { cost_usd: 0, tokens: 0 };
      byProvider[r.provider_id].cost_usd += r.estimated_cost_usd;
      byProvider[r.provider_id].tokens += r.input_tokens + r.output_tokens;

      if (!byModel[r.model_id]) byModel[r.model_id] = { cost_usd: 0, tokens: 0 };
      byModel[r.model_id].cost_usd += r.estimated_cost_usd;
      byModel[r.model_id].tokens += r.input_tokens + r.output_tokens;
    }

    return {
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      by_provider: byProvider,
      by_model: byModel,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    };
  }

  /**
   * Get current month's total spend in USD.
   */
  getCurrentMonthSpend(): number {
    const monthStart = this.getMonthStart();
    return this.records
      .filter(r => new Date(r.timestamp) >= monthStart)
      .reduce((sum, r) => sum + r.estimated_cost_usd, 0);
  }

  /**
   * Get daily spend for the last N days (for chart display).
   */
  getDailySpend(days = 30): { date: string; cost_usd: number; tokens: number }[] {
    const result: { date: string; cost_usd: number; tokens: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const dayRecords = this.records.filter(r => r.timestamp.startsWith(dateStr!));
      result.push({
        date: dateStr!,
        cost_usd: Math.round(dayRecords.reduce((s, r) => s + r.estimated_cost_usd, 0) * 10000) / 10000,
        tokens: dayRecords.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0),
      });
    }

    return result;
  }

  /**
   * Get recent records (for display).
   */
  getRecent(limit = 50): SpendRecord[] {
    return this.records.slice(-limit);
  }

  // ─── Budget ───────────────────────────────────────────────────────────

  getBudget(): BudgetConfig {
    return { ...this.budget };
  }

  setBudget(config: Partial<BudgetConfig>): void {
    Object.assign(this.budget, config);
  }

  /**
   * Check if budget is exceeded.
   */
  isBudgetExceeded(): boolean {
    if (!this.budget.enabled) return false;
    const pct = (this.getCurrentMonthSpend() / this.budget.monthly_limit_usd) * 100;
    return pct >= this.budget.force_local_at_percent;
  }

  /**
   * Get budget usage percentage (0-100+).
   */
  getBudgetUsagePercent(): number {
    if (!this.budget.enabled || this.budget.monthly_limit_usd <= 0) return 0;
    return Math.round((this.getCurrentMonthSpend() / this.budget.monthly_limit_usd) * 100);
  }

  // ─── Persistence ──────────────────────────────────────────────────────

  private loadRecords(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          this.records.push(JSON.parse(line) as SpendRecord);
        } catch { /* skip corrupt lines */ }
      }
    } catch { /* file doesn't exist or is unreadable */ }
  }

  private appendRecord(record: SpendRecord): void {
    try {
      fs.appendFileSync(this.filePath, JSON.stringify(record) + "\n");
    } catch { /* swallow write errors */ }
  }

  private getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Export all records as NDJSON string.
   */
  exportNDJSON(): string {
    return this.records.map(r => JSON.stringify(r)).join("\n");
  }
}
