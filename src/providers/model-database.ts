/**
 * openclaw-spa — Model Database & Recommendation Engine
 *
 * Static model catalog with sizing data. Maps hardware profiles to
 * tiered model recommendations. Updated as new models ship.
 */

import type {
  ModelDefinition,
  QuantizationOption,
  HardwareProfile,
  HardwareRecommendations,
  ModelRecommendation,
  RecommendationTier,
  RuntimeInfo,
} from "./types.js";

// ─── Quantization Presets ───────────────────────────────────────────────

const Q4_K_M = (size_gb: number): QuantizationOption => ({
  name: "Q4_K_M", size_gb, quality_tier: "medium", speed_modifier: 1.3,
});
const Q6_K = (size_gb: number): QuantizationOption => ({
  name: "Q6_K", size_gb, quality_tier: "high", speed_modifier: 1.1,
});
const Q8_0 = (size_gb: number): QuantizationOption => ({
  name: "Q8_0", size_gb, quality_tier: "high", speed_modifier: 1.0,
});
const FP16 = (size_gb: number): QuantizationOption => ({
  name: "FP16", size_gb, quality_tier: "lossless", speed_modifier: 0.7,
});

// ─── Model Catalog ──────────────────────────────────────────────────────

export const LOCAL_MODELS: ModelDefinition[] = [
  // Llama 3.1 family
  {
    id: "llama3.1:8b", label: "Llama 3.1 8B", provider_id: "ollama",
    parameter_count_b: 8, context_window: 128_000,
    strengths: ["reasoning", "code", "instruction-following"],
    quantizations: [Q4_K_M(4.7), Q6_K(6.6), Q8_0(8.5), FP16(16)],
  },
  {
    id: "llama3.1:70b", label: "Llama 3.1 70B", provider_id: "ollama",
    parameter_count_b: 70, context_window: 128_000,
    strengths: ["reasoning", "code", "long-context", "creative"],
    quantizations: [Q4_K_M(38), Q6_K(54), Q8_0(70)],
  },
  // Mistral / Mixtral
  {
    id: "mistral:7b", label: "Mistral 7B", provider_id: "ollama",
    parameter_count_b: 7, context_window: 32_000,
    strengths: ["fast-response", "instruction-following"],
    quantizations: [Q4_K_M(4.1), Q8_0(7.7)],
  },
  {
    id: "mixtral:8x7b", label: "Mixtral 8x7B", provider_id: "ollama",
    parameter_count_b: 47, context_window: 32_000,
    strengths: ["reasoning", "multilingual", "code"],
    quantizations: [Q4_K_M(26), Q8_0(47)],
  },
  // Phi-3
  {
    id: "phi3:mini", label: "Phi-3 Mini 3.8B", provider_id: "ollama",
    parameter_count_b: 3.8, context_window: 128_000,
    strengths: ["fast-response", "simple-qa", "math"],
    quantizations: [Q4_K_M(2.3), Q8_0(4.1)],
  },
  {
    id: "phi3:medium", label: "Phi-3 Medium 14B", provider_id: "ollama",
    parameter_count_b: 14, context_window: 128_000,
    strengths: ["reasoning", "code", "math"],
    quantizations: [Q4_K_M(7.9), Q8_0(14.4)],
  },
  // CodeLlama
  {
    id: "codellama:34b", label: "Code Llama 34B", provider_id: "ollama",
    parameter_count_b: 34, context_window: 16_000,
    strengths: ["code"],
    quantizations: [Q4_K_M(19), Q8_0(35)],
  },
  // Gemma 2
  {
    id: "gemma2:9b", label: "Gemma 2 9B", provider_id: "ollama",
    parameter_count_b: 9, context_window: 8_000,
    strengths: ["reasoning", "instruction-following", "multilingual"],
    quantizations: [Q4_K_M(5.4), Q8_0(9.8)],
  },
  {
    id: "gemma2:27b", label: "Gemma 2 27B", provider_id: "ollama",
    parameter_count_b: 27, context_window: 8_000,
    strengths: ["reasoning", "code", "multilingual"],
    quantizations: [Q4_K_M(15.7), Q8_0(28)],
  },
  // Qwen 2.5
  {
    id: "qwen2.5:72b", label: "Qwen 2.5 72B", provider_id: "ollama",
    parameter_count_b: 72, context_window: 128_000,
    strengths: ["reasoning", "code", "long-context", "multilingual", "math"],
    quantizations: [Q4_K_M(40), Q8_0(72)],
  },
  {
    id: "qwen2.5:32b", label: "Qwen 2.5 32B", provider_id: "ollama",
    parameter_count_b: 32, context_window: 128_000,
    strengths: ["reasoning", "code", "math"],
    quantizations: [Q4_K_M(18), Q8_0(33)],
  },
  // DeepSeek
  {
    id: "deepseek-coder-v2:16b", label: "DeepSeek Coder V2 16B", provider_id: "ollama",
    parameter_count_b: 16, context_window: 128_000,
    strengths: ["code", "reasoning", "math"],
    quantizations: [Q4_K_M(9.1), Q8_0(16.5)],
  },
];

export const API_MODELS: ModelDefinition[] = [
  // Anthropic
  {
    id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider_id: "anthropic",
    parameter_count_b: 0, context_window: 200_000,
    strengths: ["reasoning", "code", "long-context", "creative", "instruction-following"],
    quantizations: [],
    estimated_cost_per_1k_input: 0.003, estimated_cost_per_1k_output: 0.015,
  },
  {
    id: "claude-opus-4-20250514", label: "Claude Opus 4", provider_id: "anthropic",
    parameter_count_b: 0, context_window: 200_000,
    strengths: ["reasoning", "code", "long-context", "creative", "math"],
    quantizations: [],
    estimated_cost_per_1k_input: 0.015, estimated_cost_per_1k_output: 0.075,
  },
  {
    id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", provider_id: "anthropic",
    parameter_count_b: 0, context_window: 200_000,
    strengths: ["fast-response", "code", "instruction-following"],
    quantizations: [],
    estimated_cost_per_1k_input: 0.0008, estimated_cost_per_1k_output: 0.004,
  },
  // OpenAI
  {
    id: "gpt-4o", label: "GPT-4o", provider_id: "openai",
    parameter_count_b: 0, context_window: 128_000,
    strengths: ["reasoning", "multimodal", "code", "creative"],
    quantizations: [],
    estimated_cost_per_1k_input: 0.0025, estimated_cost_per_1k_output: 0.01,
  },
  {
    id: "gpt-4o-mini", label: "GPT-4o Mini", provider_id: "openai",
    parameter_count_b: 0, context_window: 128_000,
    strengths: ["fast-response", "instruction-following"],
    quantizations: [],
    estimated_cost_per_1k_input: 0.00015, estimated_cost_per_1k_output: 0.0006,
  },
  // Groq
  {
    id: "llama-3.1-70b-versatile", label: "Llama 3.1 70B (Groq)", provider_id: "groq",
    parameter_count_b: 70, context_window: 128_000,
    strengths: ["fast-response", "reasoning", "code"],
    quantizations: [],
    estimated_cost_per_1k_input: 0.00059, estimated_cost_per_1k_output: 0.00079,
  },
  {
    id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq)", provider_id: "groq",
    parameter_count_b: 8, context_window: 128_000,
    strengths: ["fast-response", "simple-qa"],
    quantizations: [],
    estimated_cost_per_1k_input: 0.00005, estimated_cost_per_1k_output: 0.00008,
  },
];

export const ALL_MODELS: ModelDefinition[] = [...LOCAL_MODELS, ...API_MODELS];

// ─── Recommendation Engine ──────────────────────────────────────────────

function getUsableMemoryGB(profile: HardwareProfile): {
  gpu_vram_gb: number;
  total_memory_gb: number;
  is_unified: boolean;
  is_cpu_only: boolean;
} {
  const gpus = profile.gpus.filter(g => g.vendor !== "unknown");

  // Apple Silicon: unified memory — GPU can use most of system RAM
  if (gpus.some(g => g.unified_memory)) {
    const total = profile.ram.total_gb;
    return {
      gpu_vram_gb: total * 0.75, // Metal can use ~75% of unified memory
      total_memory_gb: total,
      is_unified: true,
      is_cpu_only: false,
    };
  }

  // Discrete GPU
  const best_gpu = gpus.reduce((best, g) => g.vram_gb > (best?.vram_gb ?? 0) ? g : best, gpus[0]);
  if (best_gpu && best_gpu.vram_gb > 0) {
    return {
      gpu_vram_gb: best_gpu.vram_gb,
      total_memory_gb: best_gpu.vram_gb + profile.ram.available_gb,
      is_unified: false,
      is_cpu_only: false,
    };
  }

  // CPU only
  return {
    gpu_vram_gb: 0,
    total_memory_gb: profile.ram.available_gb,
    is_unified: false,
    is_cpu_only: true,
  };
}

function estimateTokensPerSecond(
  model: ModelDefinition,
  quant: QuantizationOption,
  mem: ReturnType<typeof getUsableMemoryGB>,
  profile: HardwareProfile,
): number {
  // Base rate depends on model size
  let base: number;
  if (model.parameter_count_b <= 3) base = 100;
  else if (model.parameter_count_b <= 8) base = 60;
  else if (model.parameter_count_b <= 14) base = 35;
  else if (model.parameter_count_b <= 34) base = 18;
  else if (model.parameter_count_b <= 72) base = 10;
  else base = 6;

  // Quantization speed boost
  base *= quant.speed_modifier;

  // GPU acceleration multiplier
  if (!mem.is_cpu_only) {
    if (mem.is_unified) base *= 1.2;         // Apple Silicon efficient
    else if (quant.size_gb <= mem.gpu_vram_gb) base *= 1.5; // Fits in VRAM
    else base *= 0.8;                         // RAM offload penalty
  } else {
    base *= 0.4;                              // CPU-only is slow
  }

  // Battery penalty for laptops
  if (profile.battery && !profile.battery.charging) {
    base *= 0.7;
  }

  return Math.round(base);
}

function scoreModel(
  model: ModelDefinition,
  quant: QuantizationOption,
  mem: ReturnType<typeof getUsableMemoryGB>,
  profile: HardwareProfile,
): ModelRecommendation | null {
  const fits_in_vram = quant.size_gb <= mem.gpu_vram_gb;
  const fits_in_total = quant.size_gb <= mem.total_memory_gb * 0.85; // Leave 15% headroom
  const needs_ram_offload = !fits_in_vram && fits_in_total;

  if (!fits_in_total) return null; // Can't run this at all

  const tps = estimateTokensPerSecond(model, quant, mem, profile);

  // Determine tier
  let tier: RecommendationTier;
  let reason: string;

  if (fits_in_vram && tps >= 30) {
    tier = "fast_lean";
    reason = `Fits entirely in ${mem.is_unified ? "unified memory" : "VRAM"}, fast inference at ~${tps} tok/s`;
  } else if (fits_in_vram && tps >= 15) {
    tier = "sweet_spot";
    reason = `Good balance of quality and speed at ~${tps} tok/s`;
  } else if (fits_in_total && tps >= 8) {
    tier = "best_performance";
    reason = needs_ram_offload
      ? `Highest quality available, needs RAM offload (~${tps} tok/s)`
      : `High quality at ~${tps} tok/s`;
  } else {
    tier = "not_recommended";
    reason = `Too slow for interactive use (~${tps} tok/s)`;
  }

  // CPU-only penalty: downgrade tiers
  if (mem.is_cpu_only && model.parameter_count_b > 13) {
    tier = "not_recommended";
    reason = "CPU-only: models above 13B are too slow for interactive use";
  }

  return {
    model,
    quantization: quant,
    tier,
    estimated_tokens_per_second: tps,
    fits_in_memory: fits_in_total,
    needs_ram_offload,
    reason,
  };
}

function findPreferredRuntime(runtimes: RuntimeInfo[]): RuntimeInfo | null {
  // Priority: Ollama > llama.cpp > LM Studio > LocalAI
  const priority = ["ollama", "llama.cpp", "lm-studio", "localai"];
  for (const name of priority) {
    const rt = runtimes.find(r => r.name === name);
    if (rt) return rt;
  }
  return null;
}

export function generateRecommendations(profile: HardwareProfile): HardwareRecommendations {
  const mem = getUsableMemoryGB(profile);
  const warnings: string[] = [];

  // Generate all viable model + quant combinations
  const recommendations: ModelRecommendation[] = [];
  for (const model of LOCAL_MODELS) {
    for (const quant of model.quantizations) {
      const rec = scoreModel(model, quant, mem, profile);
      if (rec && rec.tier !== "not_recommended") {
        recommendations.push(rec);
      }
    }
  }

  // Sort: sweet_spot first, then best_performance, then fast_lean
  const tierOrder: Record<RecommendationTier, number> = {
    sweet_spot: 0, best_performance: 1, fast_lean: 2, not_recommended: 3,
  };
  recommendations.sort((a, b) => {
    const td = tierOrder[a.tier] - tierOrder[b.tier];
    if (td !== 0) return td;
    // Within same tier, prefer higher quality (larger model, better quant)
    return b.model.parameter_count_b - a.model.parameter_count_b;
  });

  // Deduplicate: keep best quant per model
  const seen = new Set<string>();
  const deduped = recommendations.filter(r => {
    const key = `${r.model.id}:${r.tier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Limit to top 6
  const top = deduped.slice(0, 6);

  // Warnings
  if (mem.is_cpu_only) {
    warnings.push("No GPU detected — inference will be CPU-only and significantly slower.");
  }
  if (profile.ram.available_gb < 4) {
    warnings.push("Less than 4GB RAM available — close other applications for better performance.");
  }
  if (profile.disk.available_gb < 20) {
    warnings.push("Low disk space — some models require 10-40GB of storage.");
  }
  if (profile.battery && !profile.battery.charging && profile.battery.percent < 30) {
    warnings.push("Low battery — plug in for better sustained inference performance.");
  }

  const preferred = findPreferredRuntime(profile.runtimes);
  if (!preferred) {
    warnings.push("No local LLM runtime detected. Install Ollama for the easiest experience.");
  }

  // Build summary
  const gpuDesc = profile.gpus.length > 0 && profile.gpus[0].vendor !== "unknown"
    ? `${profile.gpus[0].name} (${profile.gpus[0].vram_gb}GB${profile.gpus[0].unified_memory ? " unified" : ""})`
    : "No GPU";
  const bestModel = top.find(r => r.tier === "sweet_spot") ?? top[0];
  const summary = bestModel
    ? `${gpuDesc}, ${profile.ram.total_gb}GB RAM → Recommended: ${bestModel.model.label} ${bestModel.quantization.name} (~${bestModel.estimated_tokens_per_second} tok/s)`
    : `${gpuDesc}, ${profile.ram.total_gb}GB RAM → No suitable local models found`;

  return {
    profile,
    preferred_runtime: preferred,
    recommendations: top,
    warnings,
    summary,
  };
}

// ─── Model Lookup Helpers ───────────────────────────────────────────────

export function findModel(modelId: string): ModelDefinition | undefined {
  return ALL_MODELS.find(m => m.id === modelId);
}

export function findModelsByProvider(providerId: string): ModelDefinition[] {
  return ALL_MODELS.filter(m => m.provider_id === providerId);
}

export function findModelsByStrength(strength: string): ModelDefinition[] {
  return ALL_MODELS.filter(m => m.strengths.includes(strength as any));
}

export function estimateCost(
  model: ModelDefinition,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!model.estimated_cost_per_1k_input) return null;
  return (
    (inputTokens / 1000) * model.estimated_cost_per_1k_input +
    (outputTokens / 1000) * (model.estimated_cost_per_1k_output ?? 0)
  );
}
