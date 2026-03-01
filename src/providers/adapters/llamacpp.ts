/**
 * openclaw-spa — llama.cpp Adapter
 *
 * Connects to a llama-server instance via OpenAI-compatible REST API.
 * Fastest raw performance, most control over inference parameters.
 */

import { BaseLLMAdapter } from "../base-adapter.js";
import type {
  ChatMessage,
  CompletionOptions,
  StreamChunk,
  ProviderHealth,
  TokenUsage,
} from "../types.js";

export interface LlamaCppConfig {
  endpoint: string;            // default: http://localhost:8080
  model?: string;              // display name only — server has one model loaded
  timeout_ms?: number;
}

export class LlamaCppAdapter extends BaseLLMAdapter {
  readonly id = "llamacpp";
  readonly name = "llama.cpp (Local)";
  readonly type = "local" as const;

  private endpoint: string;
  private timeout: number;

  constructor(config: LlamaCppConfig) {
    super();
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this._activeModel = config.model ?? "default";
    this.timeout = config.timeout_ms ?? 60_000;
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this._activeModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 4096,
      top_p: options?.top_p,
      stop: options?.stop,
    };

    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`llama.cpp error ${response.status}: ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from llama.cpp");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          yield { text: "", done: true };
          return;
        }
        try {
          const data = JSON.parse(payload);
          const delta = data.choices?.[0]?.delta?.content ?? "";
          const finish = data.choices?.[0]?.finish_reason;
          const usage: TokenUsage | undefined = data.usage
            ? {
                input_tokens: data.usage.prompt_tokens ?? 0,
                output_tokens: data.usage.completion_tokens ?? 0,
              }
            : undefined;
          yield { text: delta, done: finish === "stop", usage };
        } catch { /* skip */ }
      }
    }
  }

  async ping(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { available: false, latency_ms: Date.now() - start, error: `HTTP ${response.status}` };
      }
      const data = await response.json() as { status?: string };
      return {
        available: data.status === "ok" || data.status === "no slot available",
        latency_ms: Date.now() - start,
        model_loaded: data.status === "ok",
      };
    } catch (err) {
      return { available: false, latency_ms: Date.now() - start, error: String(err) };
    }
  }

  async listAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return [];
      const data = await response.json() as { data?: { id: string }[] };
      return data.data?.map(m => m.id) ?? [];
    } catch {
      return [];
    }
  }

  estimateCost(): number | null {
    return null;
  }
}
