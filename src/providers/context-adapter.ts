/**
 * openclaw-spa — Context Adapter
 *
 * Handles message format conversion between providers when switching
 * mid-conversation. Different providers have different message schemas:
 *   - OpenAI / Ollama / Groq / llama.cpp: OpenAI chat format
 *   - Anthropic: system message separate, no "system" role in messages
 *
 * This module ensures seamless conversation continuity across switches.
 */

import type { ChatMessage } from "./types.js";

// ─── Format Converters ──────────────────────────────────────────────────

/**
 * Convert a conversation history to OpenAI-compatible format.
 * Used by: OpenAI, Ollama, llama.cpp, Groq
 */
export function toOpenAIFormat(messages: ChatMessage[]): {
  system: string | undefined;
  messages: ChatMessage[];
} {
  const system: string[] = [];
  const converted: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system.push(msg.content);
    } else {
      converted.push({ ...msg });
    }
  }

  // OpenAI supports system as a regular message, but some providers prefer it separate
  return {
    system: system.length > 0 ? system.join("\n\n") : undefined,
    messages: converted,
  };
}

/**
 * Convert a conversation history to Anthropic format.
 * - System messages extracted separately
 * - No "system" role in messages array
 * - Consecutive same-role messages merged (Anthropic requirement)
 * - "tool" role messages converted to "user" with context
 */
export function toAnthropicFormat(messages: ChatMessage[]): {
  system: string | undefined;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  const system: string[] = [];
  const converted: { role: "user" | "assistant"; content: string }[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system.push(msg.content);
      continue;
    }

    const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";
    const content = msg.role === "tool"
      ? `[Tool Result: ${msg.name ?? "unknown"}]\n${msg.content}`
      : msg.content;

    // Merge consecutive same-role messages
    const last = converted[converted.length - 1];
    if (last && last.role === role) {
      last.content += "\n\n" + content;
    } else {
      converted.push({ role, content });
    }
  }

  // Anthropic requires messages to start with "user"
  if (converted.length > 0 && converted[0].role === "assistant") {
    converted.unshift({ role: "user", content: "[Conversation resumed]" });
  }

  // Anthropic requires alternating user/assistant
  const fixed: typeof converted = [];
  for (const msg of converted) {
    const last = fixed[fixed.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n\n" + msg.content;
    } else {
      fixed.push({ ...msg });
    }
  }

  return {
    system: system.length > 0 ? system.join("\n\n") : undefined,
    messages: fixed,
  };
}

// ─── Auto-Detect Adapter ────────────────────────────────────────────────

/**
 * Adapt conversation history for a target provider.
 * Automatically detects the format needed based on provider ID.
 */
export function adaptContext(
  messages: ChatMessage[],
  targetProviderId: string,
): ChatMessage[] {
  if (targetProviderId === "anthropic") {
    const { system, messages: converted } = toAnthropicFormat(messages);
    const result: ChatMessage[] = [];
    if (system) result.push({ role: "system", content: system });
    for (const m of converted) {
      result.push({ role: m.role, content: m.content });
    }
    return result;
  }

  // Default: OpenAI format (works for ollama, llamacpp, openai, groq)
  return messages;
}

/**
 * Truncate conversation history to fit within a token budget.
 * Keeps the system message + most recent messages.
 * Uses a rough 4-chars-per-token estimate.
 */
export function truncateContext(
  messages: ChatMessage[],
  maxTokens: number,
): ChatMessage[] {
  const CHARS_PER_TOKEN = 4;
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // Always keep system messages
  const system = messages.filter(m => m.role === "system");
  const nonSystem = messages.filter(m => m.role !== "system");

  let charCount = system.reduce((sum, m) => sum + m.content.length, 0);

  // Add messages from most recent backwards
  const kept: ChatMessage[] = [];
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msg = nonSystem[i];
    const cost = msg.content.length;
    if (charCount + cost > maxChars) break;
    charCount += cost;
    kept.unshift(msg);
  }

  return [...system, ...kept];
}
