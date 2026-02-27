/**
 * openclaw-spa — Provider Registry
 *
 * Static registry of all supported LLM providers. Used by the
 * ActiveProviderManager to instantiate adapters on demand.
 */

import type { ProviderDefinition } from "./types.js";
import { LOCAL_MODELS, API_MODELS } from "./model-database.js";

// ─── Provider Definitions ───────────────────────────────────────────────

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: "ollama",
    name: "Ollama (Local)",
    type: "local",
    requires_vault_key: false,
    vault_key_names: [],
    default_endpoint: "http://localhost:11434",
    models: LOCAL_MODELS.filter(m => m.provider_id === "ollama"),
    icon: "🦙",
  },
  {
    id: "llamacpp",
    name: "llama.cpp (Local)",
    type: "local",
    requires_vault_key: false,
    vault_key_names: [],
    default_endpoint: "http://localhost:8080",
    models: LOCAL_MODELS.filter(m => m.provider_id === "llamacpp"),
    icon: "⚡",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "api",
    requires_vault_key: true,
    vault_key_names: ["ANTHROPIC_API_KEY"],
    models: API_MODELS.filter(m => m.provider_id === "anthropic"),
    icon: "🧠",
  },
  {
    id: "openai",
    name: "OpenAI",
    type: "api",
    requires_vault_key: true,
    vault_key_names: ["OPENAI_API_KEY", "OPENAI_ORG_ID"],
    models: API_MODELS.filter(m => m.provider_id === "openai"),
    icon: "💎",
  },
  {
    id: "groq",
    name: "Groq",
    type: "api",
    requires_vault_key: true,
    vault_key_names: ["GROQ_API_KEY"],
    models: API_MODELS.filter(m => m.provider_id === "groq"),
    icon: "⚡",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────

export function getProviderDef(providerId: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === providerId);
}

export function getLocalProviders(): ProviderDefinition[] {
  return PROVIDER_REGISTRY.filter(p => p.type === "local");
}

export function getApiProviders(): ProviderDefinition[] {
  return PROVIDER_REGISTRY.filter(p => p.type === "api");
}

export function getAllProviderIds(): string[] {
  return PROVIDER_REGISTRY.map(p => p.id);
}
