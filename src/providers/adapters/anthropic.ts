/**
 * openclaw-spa — Anthropic Adapter
 *
 * Connects to Anthropic's Messages API with streaming, prompt caching,
 * and automatic cache_control marking for long system prompts.
 */

import { BaseLLMAdapter } from "../base-adapter.js";
import type {
  ChatMessage,
  CompletionOptions,
  StreamChunk,
  ProviderHealth,
  TokenUsage,
} from "../types.js";
import { estimateCost, findModel } from "../model-database.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const CACHE_THRESHOLD = 1000; // Characters — system prompts longer than this get cache_control

export interface AnthropicConfig {
  api_key: string;
  model: string;               // e.g. "claude-sonnet-4-20250514"
  timeout_ms?: number;
  max_retries?: number;
}

export class AnthropicAdapter extends BaseLLMAdapter {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly type = "api" as const;

  private apiKey: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: AnthropicConfig) {
    super();
    this.apiKey = config.api_key;
    this._activeModel = config.model;
    this.timeout = config.timeout_ms ?? 120_000;
    this.maxRetries = config.max_retries ?? 2;
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk> {
    // Convert to Anthropic message format
    const { system, anthropicMessages } = this.convertMessages(messages, options?.system_prompt);

    const body: Record<string, unknown> = {
      model: this._activeModel,
      messages: anthropicMessages,
      max_tokens: options?.max_tokens ?? 4096,
      stream: true,
    };

    if (system) body["system"] = system;
    if (options?.temperature !== undefined) body["temperature"] = options.temperature;
    if (options?.top_p !== undefined) body["top_p"] = options.top_p;
    if (options?.stop) body["stop_sequences"] = options.stop;

    // Tool use support
    if (options?.tools?.length) {
      body["tools"] = options.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        yield* this.doStream(body);
        return;
      } catch (err) {
        lastError = err as Error;
        const msg = String(err);
        // Retry on rate limit or server errors
        if (msg.includes("529") || msg.includes("500") || msg.includes("503")) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastError ?? new Error("Anthropic request failed after retries");
  }

  private async *doStream(body: Record<string, unknown>): AsyncGenerator<StreamChunk> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic error ${response.status}: ${errBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Anthropic");

    const decoder = new TextDecoder();
    let buffer = "";
    let totalInput = 0;
    let totalOutput = 0;
    let cacheRead = 0;
    let cacheWrite = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);

        try {
          const event = JSON.parse(payload);

          switch (event.type) {
            case "message_start":
              totalInput = event.message?.usage?.input_tokens ?? 0;
              cacheRead = event.message?.usage?.cache_read_input_tokens ?? 0;
              cacheWrite = event.message?.usage?.cache_creation_input_tokens ?? 0;
              break;

            case "content_block_delta":
              if (event.delta?.type === "text_delta") {
                yield { text: event.delta.text, done: false };
              }
              break;

            case "message_delta":
              totalOutput = event.usage?.output_tokens ?? totalOutput;
              yield {
                text: "",
                done: true,
                usage: {
                  input_tokens: totalInput,
                  output_tokens: totalOutput,
                  cache_read_tokens: cacheRead || undefined,
                  cache_write_tokens: cacheWrite || undefined,
                },
              };
              break;

            case "error":
              throw new Error(`Anthropic stream error: ${JSON.stringify(event.error)}`);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Anthropic")) throw err;
          /* skip parse errors */
        }
      }
    }
  }

  private convertMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): { system: unknown; anthropicMessages: unknown[] } {
    // Extract system messages and merge with explicit system_prompt
    const systemParts: string[] = [];
    if (systemPrompt) systemParts.push(systemPrompt);

    const anthropicMessages: unknown[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
        continue;
      }
      anthropicMessages.push({
        role: msg.role === "tool" ? "user" : msg.role,
        content: msg.content,
      });
    }

    // Build system with cache_control if long enough
    let system: unknown = undefined;
    if (systemParts.length > 0) {
      const combined = systemParts.join("\n\n");
      if (combined.length >= CACHE_THRESHOLD) {
        system = [
          { type: "text", text: combined, cache_control: { type: "ephemeral" } },
        ];
      } else {
        system = combined;
      }
    }

    return { system, anthropicMessages };
  }

  async ping(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      // Light request — count tokens on a trivial message
      const response = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: this._activeModel,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      return {
        available: response.ok || response.status === 400, // 400 = valid key, bad request
        latency_ms: Date.now() - start,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      return { available: false, latency_ms: Date.now() - start, error: String(err) };
    }
  }

  async listAvailableModels(): Promise<string[]> {
    return [
      "claude-opus-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-3-5-haiku-20241022",
    ];
  }

  estimateCost(inputTokens: number, outputTokens: number): number | null {
    const model = findModel(this._activeModel);
    return model ? estimateCost(model, inputTokens, outputTokens) : null;
  }
}
