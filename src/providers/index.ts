/**
 * openclaw-spa — Providers Module Barrel Export
 *
 * LLM provider abstraction layer: hardware profiling, model recommendations,
 * provider adapters, active provider management, API key vault, spend tracking.
 */

// Types
export type {
  HardwareProfile,
  CPUInfo,
  RAMInfo,
  GPUInfo,
  GPUVendor,
  DiskInfo,
  RuntimeInfo,
  ModelDefinition,
  QuantizationOption,
  ModelStrength,
  ModelRecommendation,
  RecommendationTier,
  HardwareRecommendations,
  ProviderType,
  ProviderDefinition,
  CompletionOptions,
  ToolDefinition,
  StreamChunk,
  TokenUsage,
  ChatMessage,
  ProviderHealth,
  SwitchResult,
  VaultEntry,
  VaultKeyFormat,
  SpendRecord,
  SpendSummary,
  BudgetConfig,
  RoutingRule,
  RoutingCondition,
  ProviderEvent,
  ProviderEventType,
  ProviderEventCallback,
} from "./types.js";

// Hardware profiler
export { profileHardware, quickProfile } from "./hardware-profiler.js";

// Model database & recommendation engine
export {
  LOCAL_MODELS,
  API_MODELS,
  ALL_MODELS,
  generateRecommendations,
  findModel,
  findModelsByProvider,
  findModelsByStrength,
  estimateCost,
} from "./model-database.js";

// Base adapter
export { BaseLLMAdapter } from "./base-adapter.js";

// Provider adapters
export {
  OllamaAdapter,
  LlamaCppAdapter,
  AnthropicAdapter,
  OpenAIAdapter,
  GroqAdapter,
} from "./adapters/index.js";

// Provider registry
export {
  PROVIDER_REGISTRY,
  getProviderDef,
  getLocalProviders,
  getApiProviders,
  getAllProviderIds,
} from "./registry.js";

// Active provider manager
export {
  ActiveProviderManager,
  activeProvider,
  type ProviderStatus,
} from "./active-provider.js";

// Context adapter
export {
  toOpenAIFormat,
  toAnthropicFormat,
  adaptContext,
  truncateContext,
} from "./context-adapter.js";

// API key vault
export {
  APIKeyVault,
  KEY_FORMATS,
  type VaultBackend,
} from "./vault.js";

// Spend tracker
export { SpendTracker } from "./spend-tracker.js";
