/**
 * openclaw-spa — Groq Adapter
 *
 * Connects to Groq's ultra-fast inference API.
 * Built on the OpenAI adapter since Groq uses an OpenAI-compatible API.
 */

import { OpenAIAdapter, type OpenAIConfig } from "./openai.js";

export interface GroqConfig {
  api_key: string;
  model: string;               // e.g. "llama-3.1-70b-versatile"
  timeout_ms?: number;
}

export class GroqAdapter extends OpenAIAdapter {
  constructor(config: GroqConfig) {
    const openaiConfig: OpenAIConfig = {
      api_key: config.api_key,
      model: config.model,
      base_url: "https://api.groq.com/openai/v1",
      timeout_ms: config.timeout_ms ?? 30_000,
    };
    super(openaiConfig, { id: "groq", name: "Groq" });
  }

  override async listAvailableModels(): Promise<string[]> {
    return [
      "llama-3.1-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ];
  }
}
