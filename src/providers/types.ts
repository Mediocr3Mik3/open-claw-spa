/**
 * openclaw-spa — LLM Provider Types
 *
 * Defines the contract for hardware profiling, model recommendations,
 * provider abstraction, vault management, and spend tracking.
 */

// ─── Hardware Profile ───────────────────────────────────────────────────

export interface CPUInfo {
  model: string;
  cores: number;
  threads: number;
  architecture: "x64" | "arm64" | "arm" | "unknown";
  features: string[];       // e.g. ["avx2", "avx512", "neon"]
  speed_mhz: number;
}

export interface RAMInfo {
  total_gb: number;
  available_gb: number;
  speed_mhz: number | null;
}

export type GPUVendor = "nvidia" | "amd" | "apple" | "intel" | "unknown";

export interface GPUInfo {
  name: string;
  vendor: GPUVendor;
  vram_gb: number;
  compute_capability?: string;   // NVIDIA sm_XX
  cuda_version?: string;
  rocm_version?: string;
  metal_support?: boolean;
  unified_memory?: boolean;      // Apple Silicon
}

export interface DiskInfo {
  available_gb: number;
  type: "nvme" | "ssd" | "hdd" | "unknown";
  read_speed_mbps?: number;
  write_speed_mbps?: number;
}

export interface RuntimeInfo {
  name: string;
  version: string | null;
  path: string | null;
  running: boolean;
  endpoint?: string;            // e.g. "http://localhost:11434"
}

export interface HardwareProfile {
  cpu: CPUInfo;
  ram: RAMInfo;
  gpus: GPUInfo[];
  disk: DiskInfo;
  os: {
    platform: NodeJS.Platform;
    release: string;
    arch: string;
  };
  runtimes: RuntimeInfo[];
  battery?: {
    charging: boolean;
    percent: number;
  };
  timestamp: string;
}

// ─── Model Database ─────────────────────────────────────────────────────

export type ModelStrength =
  | "reasoning"
  | "code"
  | "long-context"
  | "fast-response"
  | "creative"
  | "instruction-following"
  | "multilingual"
  | "multimodal"
  | "math"
  | "simple-qa";

export interface ModelDefinition {
  id: string;
  label: string;
  provider_id: string;
  parameter_count_b: number;     // billions
  context_window: number;
  strengths: ModelStrength[];
  quantizations: QuantizationOption[];
  estimated_cost_per_1k_input?: number;   // USD, null for local
  estimated_cost_per_1k_output?: number;
  release_date?: string;
}

export interface QuantizationOption {
  name: string;                  // e.g. "Q4_K_M", "Q8_0", "FP16"
  size_gb: number;               // on-disk/in-memory size
  quality_tier: "low" | "medium" | "high" | "lossless";
  speed_modifier: number;        // 1.0 = baseline, higher = faster
}

// ─── Recommendations ────────────────────────────────────────────────────

export type RecommendationTier = "best_performance" | "sweet_spot" | "fast_lean" | "not_recommended";

export interface ModelRecommendation {
  model: ModelDefinition;
  quantization: QuantizationOption;
  tier: RecommendationTier;
  estimated_tokens_per_second: number;
  fits_in_memory: boolean;
  needs_ram_offload: boolean;
  reason: string;
}

export interface HardwareRecommendations {
  profile: HardwareProfile;
  preferred_runtime: RuntimeInfo | null;
  recommendations: ModelRecommendation[];
  warnings: string[];
  summary: string;
}

// ─── Provider Abstraction ───────────────────────────────────────────────

export type ProviderType = "local" | "api";

export interface ProviderDefinition {
  id: string;
  name: string;
  type: ProviderType;
  requires_vault_key: boolean;
  vault_key_names: string[];        // e.g. ["ANTHROPIC_API_KEY"]
  default_endpoint?: string;
  models: ModelDefinition[];
  icon?: string;
}

export interface CompletionOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  system_prompt?: string;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StreamChunk {
  text: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ProviderHealth {
  available: boolean;
  latency_ms: number;
  model_loaded?: boolean;
  error?: string;
}

export interface SwitchResult {
  success: boolean;
  previous_provider?: string;
  previous_model?: string;
  current_provider: string;
  current_model: string;
  latency_ms?: number;
  reason?: string;
}

// ─── Vault ──────────────────────────────────────────────────────────────

export interface VaultEntry {
  provider_id: string;
  key_name: string;
  key_present: boolean;
  last_used?: string;
  last_validated?: string;
  format_valid?: boolean;
}

export interface VaultKeyFormat {
  provider_id: string;
  key_name: string;
  prefix?: string;
  pattern?: RegExp;
  min_length?: number;
  max_length?: number;
  description: string;
}

// ─── Spend Tracking ─────────────────────────────────────────────────────

export interface SpendRecord {
  timestamp: string;
  provider_id: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  session_id?: string;
}

export interface SpendSummary {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_provider: Record<string, { cost_usd: number; tokens: number }>;
  by_model: Record<string, { cost_usd: number; tokens: number }>;
  period_start: string;
  period_end: string;
}

export interface BudgetConfig {
  monthly_limit_usd: number;
  warn_at_percent: number;        // e.g. 80 = warn at 80%
  force_local_at_percent: number; // e.g. 100 = switch to local at 100%
  enabled: boolean;
}

// ─── Routing ────────────────────────────────────────────────────────────

export interface RoutingRule {
  id: string;
  priority: number;
  provider_id: string;
  model_id: string;
  condition?: RoutingCondition;
  enabled: boolean;
}

export interface RoutingCondition {
  type: "tag" | "budget_exceeded" | "provider_down" | "always";
  tag?: string;             // e.g. "code", "fast"
  provider_id?: string;     // for "provider_down" condition
}

// ─── Events ─────────────────────────────────────────────────────────────

export type ProviderEventType =
  | "provider_switched"
  | "provider_health_changed"
  | "model_downloaded"
  | "model_deleted"
  | "budget_warning"
  | "budget_exceeded"
  | "vault_key_added"
  | "vault_key_removed"
  | "secret_leak_detected";

export interface ProviderEvent {
  type: ProviderEventType;
  provider_id?: string;
  model_id?: string;
  detail: string;
  timestamp: string;
}

export type ProviderEventCallback = (event: ProviderEvent) => void;
