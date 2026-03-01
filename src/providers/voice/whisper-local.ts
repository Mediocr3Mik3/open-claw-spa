/**
 * openclaw-spa — Whisper.cpp Local STT Adapter
 *
 * Runs Whisper speech-to-text locally via whisper.cpp CLI or whisper-node bindings.
 * No API key required — fully offline, fully private.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { BaseSTTAdapter } from "./base-stt-adapter.js";
import type {
  AudioInput,
  TranscriptionResult,
  TranscriptionOptions,
  STTProviderHealth,
} from "./types.js";

const execFileAsync = promisify(execFile);

export interface WhisperLocalConfig {
  /** Path to the whisper.cpp main binary (e.g. /usr/local/bin/whisper-cpp) */
  binary_path?: string;
  /** Path to the GGML model file (e.g. ~/.openclaw-spa/models/ggml-base.en.bin) */
  model_path?: string;
  /** Model size to use: tiny, base, small, medium, large-v3 */
  model_size?: string;
  /** Number of threads (default: 4) */
  threads?: number;
  /** Custom whisper-cpp arguments */
  extra_args?: string[];
}

const DEFAULT_CONFIG: WhisperLocalConfig = {
  model_size: "base",
  threads: 4,
};

export class WhisperLocalAdapter extends BaseSTTAdapter {
  readonly id = "whisper-local" as const;
  readonly name = "Whisper.cpp (Local)";
  readonly type = "local" as const;
  readonly supportsStreaming = false;
  readonly supportsRealtime = false;

  private config: WhisperLocalConfig;

  constructor(config?: Partial<WhisperLocalConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async transcribe(
    audio: AudioInput,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    const start = Date.now();
    const binaryPath = this.config.binary_path ?? await this.findBinary();

    if (!binaryPath) {
      throw new Error(
        "whisper.cpp binary not found. Install it from https://github.com/ggerganov/whisper.cpp " +
        "or set the binary path in voice settings."
      );
    }

    // Write audio to temp file
    const tmpPath = join(tmpdir(), `openclaw-voice-${randomUUID()}.wav`);
    const buf = audio.data instanceof ArrayBuffer ? Buffer.from(audio.data) : audio.data;
    await writeFile(tmpPath, buf);

    try {
      const args: string[] = [
        "-m", this.config.model_path ?? await this.defaultModelPath(),
        "-f", tmpPath,
        "-t", String(this.config.threads ?? 4),
        "--output-txt",
        "--no-timestamps",
      ];

      if (options?.language) args.push("-l", options.language);
      if (options?.task === "translate") args.push("--translate");
      if (this.config.extra_args) args.push(...this.config.extra_args);

      const { stdout } = await execFileAsync(binaryPath, args, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const text = stdout.trim().replace(/^\[.*?\]\s*/gm, "").trim();

      return {
        text,
        language: options?.language ?? "en",
        confidence: undefined, // whisper.cpp doesn't output confidence by default
        processing_time_ms: Date.now() - start,
        provider_id: this.id,
        model: this.config.model_size ?? "base",
      };
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  async ping(): Promise<STTProviderHealth> {
    try {
      const binary = this.config.binary_path ?? await this.findBinary();
      if (!binary) return { available: false, error: "whisper.cpp binary not found" };

      const start = Date.now();
      await execFileAsync(binary, ["--help"], { timeout: 5000 }).catch(() => {});
      return { available: true, latency_ms: Date.now() - start, model_loaded: true };
    } catch (e) {
      return { available: false, error: String(e) };
    }
  }

  async listModels(): Promise<string[]> {
    return ["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large-v3"];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async findBinary(): Promise<string | null> {
    const candidates = [
      "/usr/local/bin/whisper-cpp",
      "/usr/local/bin/whisper",
      "/opt/homebrew/bin/whisper-cpp",
      "/opt/homebrew/bin/whisper",
      join(process.env.HOME ?? "~", ".local", "bin", "whisper-cpp"),
    ];

    for (const p of candidates) {
      try {
        await execFileAsync(p, ["--help"], { timeout: 3000 });
        return p;
      } catch {
        // not found, try next
      }
    }
    return null;
  }

  private async defaultModelPath(): Promise<string> {
    const home = process.env.HOME ?? "~";
    const size = this.config.model_size ?? "base";
    return join(home, ".openclaw-spa", "models", `ggml-${size}.bin`);
  }
}
