/**
 * openclaw-spa — WhisperFlo STT Adapter
 *
 * Integration with WhisperFlo — a high-performance speech-to-text service.
 * Supports both cloud-hosted and self-hosted WhisperFlo instances.
 * Also serves as the template for any custom STT endpoint.
 */

import { BaseSTTAdapter } from "./base-stt-adapter.js";
import type {
  AudioInput,
  TranscriptionResult,
  TranscriptionOptions,
  STTProviderHealth,
  RealtimeSTTConfig,
  RealtimeTranscriptionCallback,
} from "./types.js";

export interface WhisperFloConfig {
  /** WhisperFlo API endpoint (e.g. https://api.whisperflo.com/v1 or self-hosted) */
  endpoint: string;
  /** API key (if required) */
  api_key?: string;
  /** Model to use (default: provider's default) */
  model?: string;
  /** Request timeout in ms */
  timeout_ms?: number;
  /** Enable WebSocket streaming (if supported) */
  use_websocket?: boolean;
}

const DEFAULT_CONFIG: WhisperFloConfig = {
  endpoint: "https://api.whisperflo.com/v1",
  timeout_ms: 60_000,
  use_websocket: false,
};

export class WhisperFloAdapter extends BaseSTTAdapter {
  readonly id = "whisperflo" as const;
  readonly name = "WhisperFlo";
  readonly type = "api" as const;
  readonly supportsStreaming = true;
  readonly supportsRealtime = true;

  private config: WhisperFloConfig;

  constructor(config?: Partial<WhisperFloConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setApiKey(key: string): void {
    this.config.api_key = key;
  }

  setEndpoint(url: string): void {
    this.config.endpoint = url;
  }

  async transcribe(
    audio: AudioInput,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    const start = Date.now();
    const buf = audio.data instanceof ArrayBuffer ? Buffer.from(audio.data) : audio.data;

    const boundary = `----WFBoundary${Date.now()}`;
    const parts: Buffer[] = [];

    const addField = (name: string, value: string) => {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      ));
    };
    const addFile = (name: string, fname: string, mime: string, data: Buffer) => {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${fname}"\r\nContent-Type: ${mime}\r\n\r\n`
      ));
      parts.push(data);
      parts.push(Buffer.from("\r\n"));
    };

    addFile("audio", audio.filename ?? "audio.wav", audio.mime_type, buf);
    if (options?.language) addField("language", options.language);
    if (options?.task) addField("task", options.task);
    if (this.config.model) addField("model", this.config.model);
    if (options?.word_timestamps) addField("word_timestamps", "true");
    if (options?.initial_prompt) addField("prompt", options.initial_prompt);

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const headers: Record<string, string> = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    };
    if (this.config.api_key) {
      headers["Authorization"] = `Bearer ${this.config.api_key}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout_ms ?? 60_000);

    try {
      const resp = await fetch(`${this.config.endpoint}/transcribe`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`WhisperFlo error ${resp.status}: ${errText}`);
      }

      const json = await resp.json() as any;

      const result: TranscriptionResult = {
        text: json.text ?? json.transcription ?? "",
        language: json.language,
        confidence: json.confidence,
        processing_time_ms: Date.now() - start,
        provider_id: this.id,
        model: json.model ?? this.config.model,
      };

      if (json.words) {
        result.words = json.words.map((w: any) => ({
          word: w.word ?? w.text,
          start_ms: Math.round((w.start ?? w.start_ms ?? 0) * (w.start_ms ? 1 : 1000)),
          end_ms: Math.round((w.end ?? w.end_ms ?? 0) * (w.end_ms ? 1 : 1000)),
          confidence: w.confidence ?? 1,
        }));
      }

      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Realtime transcription via WebSocket — for phone calls and live input.
   */
  async startRealtime(
    config: RealtimeSTTConfig,
    onEvent: RealtimeTranscriptionCallback,
  ): Promise<() => void> {
    // Dynamic import to avoid bundling ws in renderer
    const WS = (await import("ws")).default as any;

    const wsUrl = this.config.endpoint.replace(/^http/, "ws") + "/realtime";
    const ws = new WS(wsUrl, {
      headers: this.config.api_key ? { Authorization: `Bearer ${this.config.api_key}` } : {},
    }) as any;

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "config",
        language: config.language,
        interim_results: config.interim_results ?? true,
        vad_sensitivity: config.vad_sensitivity ?? "medium",
      }));
    });

    ws.on("message", (data: any) => {
      try {
        const msg = JSON.parse(String(data));
        onEvent({
          type: msg.is_final ? "final" : "interim",
          text: msg.text,
          confidence: msg.confidence,
          is_final: !!msg.is_final,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("error", (err: Error) => {
      onEvent({
        type: "error",
        is_final: false,
        timestamp: new Date().toISOString(),
        error: err.message,
      });
    });

    ws.on("close", () => {
      onEvent({
        type: "silence",
        is_final: true,
        timestamp: new Date().toISOString(),
      });
    });

    // Return cleanup function
    return () => {
      if (ws.readyState === 1 /* OPEN */) {
        ws.close();
      }
    };
  }

  async ping(): Promise<STTProviderHealth> {
    try {
      const start = Date.now();
      const headers: Record<string, string> = {};
      if (this.config.api_key) headers["Authorization"] = `Bearer ${this.config.api_key}`;

      const resp = await fetch(`${this.config.endpoint}/health`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const json = await resp.json().catch(() => ({})) as any;
      return {
        available: resp.ok,
        latency_ms: Date.now() - start,
        model_loaded: json.model_loaded ?? true,
      };
    } catch (e) {
      return { available: false, error: String(e) };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.config.api_key) headers["Authorization"] = `Bearer ${this.config.api_key}`;

      const resp = await fetch(`${this.config.endpoint}/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return [];
      const json = await resp.json() as any;
      return json.models ?? json.data?.map((m: any) => m.id) ?? [];
    } catch {
      return [];
    }
  }
}
