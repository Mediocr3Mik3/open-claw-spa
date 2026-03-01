/**
 * openclaw-spa — Ollama Adapter
 *
 * Connects to a local Ollama instance via its REST API.
 * Supports streaming, model listing, and health checks.
 */

import { BaseLLMAdapter } from "../base-adapter.js";
import type {
  ChatMessage,
  CompletionOptions,
  StreamChunk,
  ProviderHealth,
  TokenUsage,
} from "../types.js";

export interface OllamaConfig {
  endpoint: string;            // default: http://localhost:11434
  model: string;               // e.g. "llama3.1:8b"
  timeout_ms?: number;
}

export class OllamaAdapter extends BaseLLMAdapter {
  readonly id = "ollama";
  readonly name = "Ollama (Local)";
  readonly type = "local" as const;

  private endpoint: string;
  private timeout: number;

  constructor(config: OllamaConfig) {
    super();
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this._activeModel = config.model;
    this.timeout = config.timeout_ms ?? 30_000;
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this._activeModel,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.max_tokens ?? 4096,
        top_p: options?.top_p,
        stop: options?.stop,
      },
    };

    if (options?.system_prompt) {
      body["system"] = options.system_prompt;
    }

    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Ollama");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const text = data.message?.content ?? "";
          const isDone = data.done === true;

          const usage: TokenUsage | undefined = isDone && data.eval_count
            ? {
                input_tokens: data.prompt_eval_count ?? 0,
                output_tokens: data.eval_count ?? 0,
              }
            : undefined;

          yield { text, done: isDone, usage };
        } catch { /* skip malformed lines */ }
      }
    }
  }

  async ping(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { available: false, latency_ms: Date.now() - start, error: `HTTP ${response.status}` };
      }
      const data = await response.json() as { models?: { name: string }[] };
      const modelLoaded = data.models?.some(m => m.name === this._activeModel || m.name.startsWith(this._activeModel));
      return { available: true, latency_ms: Date.now() - start, model_loaded: modelLoaded };
    } catch (err) {
      return { available: false, latency_ms: Date.now() - start, error: String(err) };
    }
  }

  async listAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return [];
      const data = await response.json() as { models?: { name: string }[] };
      return data.models?.map(m => m.name) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Pull a model from the Ollama registry. Returns a stream of progress events.
   */
  async *pullModel(modelName: string): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
    const response = await fetch(`${this.endpoint}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          yield {
            status: data.status ?? "unknown",
            completed: data.completed,
            total: data.total,
          };
        } catch { /* skip */ }
      }
    }
  }

  estimateCost(): number | null {
    return null; // Local — free
  }
}
