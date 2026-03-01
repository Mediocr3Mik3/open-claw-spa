/**
 * openclaw-spa — Base LLM Adapter
 *
 * Abstract class that all provider adapters implement.
 * OpenClaw only ever calls this interface — never talks to providers directly.
 */

import type {
  ChatMessage,
  CompletionOptions,
  StreamChunk,
  ProviderHealth,
  TokenUsage,
  ProviderType,
} from "./types.js";

export abstract class BaseLLMAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly type: ProviderType;

  protected _activeModel: string = "";

  /**
   * Stream completion — primary interface. All providers must implement this.
   */
  abstract stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk>;

  /**
   * Non-streaming convenience wrapper. Collects all chunks into a string.
   */
  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<{
    text: string;
    usage: TokenUsage | null;
  }> {
    let result = "";
    let lastUsage: TokenUsage | null = null;
    for await (const chunk of this.stream(messages, options)) {
      result += chunk.text;
      if (chunk.usage) lastUsage = chunk.usage;
    }
    return { text: result, usage: lastUsage };
  }

  /**
   * Health check — called before every provider switch and during polling.
   */
  abstract ping(): Promise<ProviderHealth>;

  /**
   * List models available from this provider right now.
   * Local providers query the runtime; API providers return static lists.
   */
  abstract listAvailableModels(): Promise<string[]>;

  /**
   * Set the active model for this provider.
   */
  setModel(modelId: string): void {
    this._activeModel = modelId;
  }

  /**
   * Get the currently active model.
   */
  getActiveModel(): string {
    return this._activeModel;
  }

  /**
   * Estimate cost for a given token count. Returns null for local providers.
   */
  abstract estimateCost(inputTokens: number, outputTokens: number): number | null;

  /**
   * Provider-specific cleanup (close connections, etc.)
   */
  async dispose(): Promise<void> {
    // Default: no-op. Override if needed.
  }
}
