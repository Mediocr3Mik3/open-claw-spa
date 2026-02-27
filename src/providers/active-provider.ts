/**
 * openclaw-spa — Active Provider Manager
 *
 * Singleton that manages the currently active LLM provider.
 * All OpenClaw requests flow through this slot. Switching models
 * means atomically swapping what's in the slot — no restart needed.
 *
 * Features:
 *   - Ping-before-commit: failed switch leaves current provider intact
 *   - Subscriber pattern: UI, audit, SPA bridge all react simultaneously
 *   - Health polling: 30s background checks with status broadcasting
 *   - Routing rules: priority-based fallback and tag-based overrides
 *   - Budget awareness: auto-switch to local when spend cap hit
 */

import { BaseLLMAdapter } from "./base-adapter.js";
import { OllamaAdapter } from "./adapters/ollama.js";
import { LlamaCppAdapter } from "./adapters/llamacpp.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import { GroqAdapter } from "./adapters/groq.js";
import { getProviderDef } from "./registry.js";
import type {
  SwitchResult,
  ProviderHealth,
  ProviderEvent,
  ProviderEventCallback,
  RoutingRule,
  BudgetConfig,
} from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ProviderStatus {
  provider_id: string;
  provider_name: string;
  model_id: string;
  type: "local" | "api";
  health: ProviderHealth;
  last_checked: string;
}

interface VaultReader {
  get(key: string): string | undefined;
}

// ─── Active Provider Manager ────────────────────────────────────────────

export class ActiveProviderManager {
  private current: BaseLLMAdapter | null = null;
  private switching = false;
  private subscribers = new Set<ProviderEventCallback>();
  private healthCache = new Map<string, ProviderStatus>();
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private vault: VaultReader | null = null;
  private routingRules: RoutingRule[] = [];
  private budgetConfig: BudgetConfig | null = null;
  private currentMonthSpend = 0;

  // ─── Initialization ─────────────────────────────────────────────────

  /**
   * Attach a vault reader for API key lookups when instantiating adapters.
   */
  setVault(vault: VaultReader): void {
    this.vault = vault;
  }

  /**
   * Set routing rules for automatic provider selection.
   */
  setRoutingRules(rules: RoutingRule[]): void {
    this.routingRules = rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Set budget configuration for automatic local fallback.
   */
  setBudget(config: BudgetConfig, currentSpend: number): void {
    this.budgetConfig = config;
    this.currentMonthSpend = currentSpend;
  }

  /**
   * Update the current month's spend (called by SpendTracker).
   */
  updateSpend(totalUsd: number): void {
    this.currentMonthSpend = totalUsd;
    if (this.budgetConfig?.enabled && this.current?.type === "api") {
      const pct = (totalUsd / this.budgetConfig.monthly_limit_usd) * 100;
      if (pct >= this.budgetConfig.force_local_at_percent) {
        this.emit({
          type: "budget_exceeded",
          detail: `Monthly spend $${totalUsd.toFixed(2)} exceeds ${this.budgetConfig.force_local_at_percent}% of $${this.budgetConfig.monthly_limit_usd} limit. Switching to local.`,
          timestamp: new Date().toISOString(),
        });
        // Auto-switch to first available local provider
        this.switchToFirstLocal().catch(() => {});
      } else if (pct >= this.budgetConfig.warn_at_percent) {
        this.emit({
          type: "budget_warning",
          detail: `Monthly spend $${totalUsd.toFixed(2)} is at ${Math.round(pct)}% of $${this.budgetConfig.monthly_limit_usd} limit.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // ─── Switching ──────────────────────────────────────────────────────

  /**
   * Switch to a specific provider and model.
   * Pings first — if unreachable, the current provider stays active.
   */
  async switchTo(providerId: string, modelId: string): Promise<SwitchResult> {
    if (this.switching) {
      return {
        success: false,
        current_provider: this.current?.id ?? "none",
        current_model: this.current?.getActiveModel() ?? "none",
        reason: "Switch already in progress",
      };
    }

    this.switching = true;
    try {
      const adapter = this.createAdapter(providerId, modelId);
      if (!adapter) {
        return {
          success: false,
          current_provider: this.current?.id ?? "none",
          current_model: this.current?.getActiveModel() ?? "none",
          reason: `Unknown provider: ${providerId}`,
        };
      }

      // Ping before committing
      const health = await adapter.ping();
      if (!health.available) {
        return {
          success: false,
          current_provider: this.current?.id ?? "none",
          current_model: this.current?.getActiveModel() ?? "none",
          reason: `Provider unreachable: ${health.error ?? "unknown error"}`,
        };
      }

      // Budget check for API providers
      if (adapter.type === "api" && this.budgetConfig?.enabled) {
        const pct = (this.currentMonthSpend / this.budgetConfig.monthly_limit_usd) * 100;
        if (pct >= this.budgetConfig.force_local_at_percent) {
          return {
            success: false,
            current_provider: this.current?.id ?? "none",
            current_model: this.current?.getActiveModel() ?? "none",
            reason: `Budget exceeded — API providers blocked until next billing cycle`,
          };
        }
      }

      const previous = this.current;
      const prevId = previous?.id ?? "none";
      const prevModel = previous?.getActiveModel() ?? "none";

      this.current = adapter;

      // Notify subscribers
      this.emit({
        type: "provider_switched",
        provider_id: providerId,
        model_id: modelId,
        detail: `Switched from ${prevId}/${prevModel} to ${providerId}/${modelId} (${health.latency_ms}ms ping)`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        previous_provider: prevId,
        previous_model: prevModel,
        current_provider: providerId,
        current_model: modelId,
        latency_ms: health.latency_ms,
      };
    } finally {
      this.switching = false;
    }
  }

  /**
   * Switch to the first available local provider.
   */
  private async switchToFirstLocal(): Promise<SwitchResult> {
    const localProviders = ["ollama", "llamacpp"];
    for (const pid of localProviders) {
      const cached = this.healthCache.get(pid);
      if (cached?.health.available) {
        return this.switchTo(pid, cached.model_id);
      }
    }
    return {
      success: false,
      current_provider: this.current?.id ?? "none",
      current_model: this.current?.getActiveModel() ?? "none",
      reason: "No local providers available",
    };
  }

  /**
   * Get a provider for a specific task tag using routing rules.
   * Falls back to current provider if no rule matches.
   */
  async resolveForTag(tag: string): Promise<BaseLLMAdapter | null> {
    for (const rule of this.routingRules) {
      if (!rule.enabled) continue;
      if (rule.condition?.type === "tag" && rule.condition.tag === tag) {
        const adapter = this.createAdapter(rule.provider_id, rule.model_id);
        if (adapter) {
          const health = await adapter.ping();
          if (health.available) return adapter;
        }
      }
    }
    return this.current;
  }

  // ─── Adapter Factory ────────────────────────────────────────────────

  private createAdapter(providerId: string, modelId: string): BaseLLMAdapter | null {
    const def = getProviderDef(providerId);
    if (!def) return null;

    switch (providerId) {
      case "ollama":
        return new OllamaAdapter({
          endpoint: def.default_endpoint ?? "http://localhost:11434",
          model: modelId,
        });

      case "llamacpp":
        return new LlamaCppAdapter({
          endpoint: def.default_endpoint ?? "http://localhost:8080",
          model: modelId,
        });

      case "anthropic": {
        const key = this.vault?.get("ANTHROPIC_API_KEY");
        if (!key) return null;
        return new AnthropicAdapter({ api_key: key, model: modelId });
      }

      case "openai": {
        const key = this.vault?.get("OPENAI_API_KEY");
        if (!key) return null;
        return new OpenAIAdapter({
          api_key: key,
          model: modelId,
          organization: this.vault?.get("OPENAI_ORG_ID"),
        });
      }

      case "groq": {
        const key = this.vault?.get("GROQ_API_KEY");
        if (!key) return null;
        return new GroqAdapter({ api_key: key, model: modelId });
      }

      default:
        return null;
    }
  }

  // ─── Accessors ──────────────────────────────────────────────────────

  get(): BaseLLMAdapter | null {
    return this.current;
  }

  getStatus(): ProviderStatus | null {
    if (!this.current) return null;
    return this.healthCache.get(this.current.id) ?? null;
  }

  isReady(): boolean {
    return this.current !== null;
  }

  // ─── Health Polling ─────────────────────────────────────────────────

  /**
   * Start background health polling for all known providers.
   * @param intervalMs Polling interval (default: 30 seconds)
   */
  startHealthPolling(intervalMs = 30_000): void {
    if (this.healthInterval) return;
    this.pollAllProviders(); // Immediate first check
    this.healthInterval = setInterval(() => this.pollAllProviders(), intervalMs);
  }

  stopHealthPolling(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  private async pollAllProviders(): Promise<void> {
    const providerIds = ["ollama", "llamacpp", "anthropic", "openai", "groq"];

    const checks = providerIds.map(async (pid) => {
      try {
        const adapter = this.createAdapter(pid, this.healthCache.get(pid)?.model_id ?? "default");
        if (!adapter) {
          this.healthCache.set(pid, {
            provider_id: pid,
            provider_name: getProviderDef(pid)?.name ?? pid,
            model_id: "none",
            type: getProviderDef(pid)?.type ?? "api",
            health: { available: false, latency_ms: 0, error: "No API key configured" },
            last_checked: new Date().toISOString(),
          });
          return;
        }

        const health = await adapter.ping();
        const prev = this.healthCache.get(pid);
        const changed = prev && prev.health.available !== health.available;

        this.healthCache.set(pid, {
          provider_id: pid,
          provider_name: adapter.name,
          model_id: adapter.getActiveModel(),
          type: adapter.type,
          health,
          last_checked: new Date().toISOString(),
        });

        if (changed) {
          this.emit({
            type: "provider_health_changed",
            provider_id: pid,
            detail: health.available
              ? `${pid} is now available (${health.latency_ms}ms)`
              : `${pid} is now unavailable: ${health.error}`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch { /* swallow polling errors */ }
    });

    await Promise.allSettled(checks);
  }

  /**
   * Get health status for all providers (for UI display).
   */
  getAllStatuses(): ProviderStatus[] {
    return Array.from(this.healthCache.values());
  }

  // ─── Events ─────────────────────────────────────────────────────────

  subscribe(callback: ProviderEventCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private emit(event: ProviderEvent): void {
    for (const fn of this.subscribers) {
      try { fn(event); } catch { /* don't let subscriber errors break the manager */ }
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    this.stopHealthPolling();
    await this.current?.dispose();
    this.current = null;
    this.subscribers.clear();
    this.healthCache.clear();
  }
}

// ─── Singleton Export ───────────────────────────────────────────────────

export const activeProvider = new ActiveProviderManager();
