/**
 * openclaw-spa — OpenAI Adapter
 *
 * Connects to OpenAI's Chat Completions API with streaming support.
 * Also compatible with any OpenAI-compatible endpoint (Groq, Together, etc.)
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

export interface OpenAIConfig {
  api_key: string;
  model: string;
  base_url?: string;           // default: https://api.openai.com/v1
  organization?: string;
  timeout_ms?: number;
  max_retries?: number;
}

export class OpenAIAdapter extends BaseLLMAdapter {
  readonly id: string;
  readonly name: string;
  readonly type = "api" as const;

  private apiKey: string;
  private baseUrl: string;
  private organization: string | undefined;
  private timeout: number;
  private maxRetries: number;

  constructor(config: OpenAIConfig, overrides?: { id?: string; name?: string }) {
    super();
    this.id = overrides?.id ?? "openai";
    this.name = overrides?.name ?? "OpenAI";
    this.apiKey = config.api_key;
    this._activeModel = config.model;
    this.baseUrl = (config.base_url ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.organization = config.organization;
    this.timeout = config.timeout_ms ?? 120_000;
    this.maxRetries = config.max_retries ?? 2;
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this._activeModel,
      messages: this.convertMessages(messages, options?.system_prompt),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options?.temperature !== undefined) body["temperature"] = options.temperature;
    if (options?.max_tokens !== undefined) body["max_tokens"] = options.max_tokens;
    if (options?.top_p !== undefined) body["top_p"] = options.top_p;
    if (options?.stop) body["stop"] = options.stop;

    if (options?.tools?.length) {
      body["tools"] = options.tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
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
        if (msg.includes("429") || msg.includes("500") || msg.includes("503")) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastError ?? new Error(`${this.name} request failed after retries`);
  }

  private async *doStream(body: Record<string, unknown>): AsyncGenerator<StreamChunk> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };
    if (this.organization) headers["OpenAI-Organization"] = this.organization;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`${this.name} error ${response.status}: ${errBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error(`No response body from ${this.name}`);

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
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
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

  private convertMessages(messages: ChatMessage[], systemPrompt?: string): unknown[] {
    const result: unknown[] = [];
    if (systemPrompt) {
      result.push({ role: "system", content: systemPrompt });
    }
    for (const msg of messages) {
      result.push({ role: msg.role, content: msg.content });
    }
    return result;
  }

  async ping(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${this.apiKey}`,
      };
      if (this.organization) headers["OpenAI-Organization"] = this.organization;

      const response = await fetch(`${this.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      return {
        available: response.ok,
        latency_ms: Date.now() - start,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      return { available: false, latency_ms: Date.now() - start, error: String(err) };
    }
  }

  async listAvailableModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${this.apiKey}`,
      };
      const response = await fetch(`${this.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return [];
      const data = await response.json() as { data?: { id: string }[] };
      return data.data?.map(m => m.id) ?? [];
    } catch {
      return [];
    }
  }

  estimateCost(inputTokens: number, outputTokens: number): number | null {
    const model = findModel(this._activeModel);
    return model ? estimateCost(model, inputTokens, outputTokens) : null;
  }
}
