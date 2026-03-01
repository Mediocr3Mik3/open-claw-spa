/**
 * openclaw-spa — OpenAI Whisper API STT Adapter
 *
 * Cloud-based speech-to-text via OpenAI's Whisper API.
 * Requires an OpenAI API key stored in the vault.
 */

import { BaseSTTAdapter } from "./base-stt-adapter.js";
import type {
  AudioInput,
  TranscriptionResult,
  TranscriptionOptions,
  STTProviderHealth,
} from "./types.js";

export interface WhisperAPIConfig {
  /** OpenAI API key (pulled from vault at runtime) */
  api_key?: string;
  /** API base URL (default: https://api.openai.com/v1) */
  base_url?: string;
  /** Model to use (default: whisper-1) */
  model?: string;
  /** Request timeout in ms */
  timeout_ms?: number;
}

export class WhisperAPIAdapter extends BaseSTTAdapter {
  readonly id = "whisper-api" as const;
  readonly name = "OpenAI Whisper API";
  readonly type = "api" as const;
  readonly supportsStreaming = false;
  readonly supportsRealtime = false;

  private config: WhisperAPIConfig;

  constructor(config?: Partial<WhisperAPIConfig>) {
    super();
    this.config = {
      base_url: "https://api.openai.com/v1",
      model: "whisper-1",
      timeout_ms: 60_000,
      ...config,
    };
  }

  setApiKey(key: string): void {
    this.config.api_key = key;
  }

  async transcribe(
    audio: AudioInput,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    if (!this.config.api_key) {
      throw new Error("OpenAI API key not configured. Add it in Settings → LLM & Models.");
    }

    const start = Date.now();
    const buf = audio.data instanceof ArrayBuffer ? Buffer.from(audio.data) : audio.data;

    // Build multipart form data manually (no external dep)
    const boundary = `----OpenClawBoundary${Date.now()}`;
    const ext = this.mimeToExt(audio.mime_type);
    const filename = audio.filename ?? `audio.${ext}`;

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

    addFile("file", filename, audio.mime_type, buf);
    addField("model", this.config.model ?? "whisper-1");
    if (options?.language) addField("language", options.language);
    if (options?.initial_prompt) addField("prompt", options.initial_prompt);
    if (options?.temperature !== undefined) addField("temperature", String(options.temperature));
    if (options?.word_timestamps) addField("timestamp_granularities[]", "word");
    if (options?.word_timestamps) addField("response_format", "verbose_json");

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const endpoint = options?.task === "translate" ? "translations" : "transcriptions";
    const url = `${this.config.base_url}/audio/${endpoint}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout_ms ?? 60_000);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.api_key}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`Whisper API error ${resp.status}: ${errText}`);
      }

      const json = await resp.json() as any;

      const result: TranscriptionResult = {
        text: json.text ?? "",
        language: json.language,
        processing_time_ms: Date.now() - start,
        provider_id: this.id,
        model: this.config.model ?? "whisper-1",
      };

      if (json.words) {
        result.words = json.words.map((w: any) => ({
          word: w.word,
          start_ms: Math.round((w.start ?? 0) * 1000),
          end_ms: Math.round((w.end ?? 0) * 1000),
          confidence: w.confidence ?? 1,
        }));
      }

      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async ping(): Promise<STTProviderHealth> {
    if (!this.config.api_key) {
      return { available: false, error: "API key not configured" };
    }
    try {
      const start = Date.now();
      const resp = await fetch(`${this.config.base_url}/models`, {
        headers: { "Authorization": `Bearer ${this.config.api_key}` },
        signal: AbortSignal.timeout(5000),
      });
      return { available: resp.ok, latency_ms: Date.now() - start };
    } catch (e) {
      return { available: false, error: String(e) };
    }
  }

  async listModels(): Promise<string[]> {
    return ["whisper-1"];
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      "audio/wav": "wav", "audio/wave": "wav", "audio/x-wav": "wav",
      "audio/mp3": "mp3", "audio/mpeg": "mp3",
      "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a",
      "audio/ogg": "ogg", "audio/webm": "webm", "audio/flac": "flac",
      "audio/opus": "opus",
    };
    return map[mime] ?? "wav";
  }
}
