/**
 * openclaw-spa — Voice-to-Signed-Prompt Pipeline
 *
 * Converts audio input → transcribed text → cryptographically signed SPA envelope.
 * Handles source verification, provider fallback, and audit logging.
 */

import { BaseSTTAdapter } from "./base-stt-adapter.js";
import type {
  AudioInput,
  TranscriptionResult,
  TranscriptionOptions,
  VoicePipelineConfig,
  VoiceSourceVerification,
  STTProviderId,
  DEFAULT_VOICE_PIPELINE_CONFIG,
} from "./types.js";

export interface VoicePipelineResult {
  /** The transcribed text */
  text: string;
  /** Full transcription result from STT */
  transcription: TranscriptionResult;
  /** Source verification details */
  source: VoiceSourceVerification;
  /** Was the prompt auto-signed? */
  signed: boolean;
  /** SPA token (if signed) */
  token?: string;
  /** Key ID used for signing (if signed) */
  key_id?: string;
  /** Auth level of the signed prompt */
  auth_level?: string;
  /** Whether user confirmation was requested */
  confirmation_required: boolean;
}

export interface SigningDelegate {
  /** Sign a text prompt and return the SPA token */
  sign(text: string, keyId: string, authLevel: string): Promise<string>;
  /** Get the active signing key ID */
  getActiveKeyId(): string | null;
}

export class VoicePipeline {
  private providers = new Map<STTProviderId, BaseSTTAdapter>();
  private config: VoicePipelineConfig;
  private signingDelegate?: SigningDelegate;

  constructor(config?: Partial<VoicePipelineConfig>) {
    this.config = {
      primary_provider: "whisper-local",
      auto_sign_verified: true,
      require_confirmation: true,
      default_auth_level: "standard",
      vad_enabled: true,
      ...config,
    };
  }

  /**
   * Register an STT provider adapter.
   */
  registerProvider(adapter: BaseSTTAdapter): void {
    this.providers.set(adapter.id, adapter);
  }

  /**
   * Set the signing delegate (connects to SPA crypto layer).
   */
  setSigningDelegate(delegate: SigningDelegate): void {
    this.signingDelegate = delegate;
  }

  /**
   * Update pipeline configuration.
   */
  configure(config: Partial<VoicePipelineConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Process a voice memo: transcribe → verify source → optionally sign.
   */
  async processVoiceMemo(
    audio: AudioInput,
    source: VoiceSourceVerification,
    options?: TranscriptionOptions & { skip_signing?: boolean },
  ): Promise<VoicePipelineResult> {
    // 1. Transcribe with primary provider
    let transcription: TranscriptionResult;
    try {
      transcription = await this.transcribe(audio, options);
    } catch (primaryErr) {
      // 2. Fallback if configured
      if (this.config.fallback_provider) {
        const fallback = this.providers.get(this.config.fallback_provider);
        if (fallback) {
          transcription = await fallback.transcribe(audio, options);
        } else {
          throw primaryErr;
        }
      } else {
        throw primaryErr;
      }
    }

    if (!transcription.text.trim()) {
      return {
        text: "",
        transcription,
        source,
        signed: false,
        confirmation_required: false,
      };
    }

    // 3. Determine if we should auto-sign
    const shouldSign =
      !options?.skip_signing &&
      this.config.auto_sign_verified &&
      source.verified &&
      this.signingDelegate?.getActiveKeyId();

    const confirmationRequired =
      this.config.require_confirmation && shouldSign;

    // If confirmation required, don't sign yet — return text for user review
    if (confirmationRequired) {
      return {
        text: transcription.text,
        transcription,
        source,
        signed: false,
        confirmation_required: true,
      };
    }

    // 4. Sign if conditions met
    if (shouldSign && this.signingDelegate) {
      const keyId = this.signingDelegate.getActiveKeyId()!;
      try {
        const token = await this.signingDelegate.sign(
          transcription.text,
          keyId,
          this.config.default_auth_level,
        );
        return {
          text: transcription.text,
          transcription,
          source,
          signed: true,
          token,
          key_id: keyId,
          auth_level: this.config.default_auth_level,
          confirmation_required: false,
        };
      } catch {
        // Signing failed — return unsigned
        return {
          text: transcription.text,
          transcription,
          source,
          signed: false,
          confirmation_required: false,
        };
      }
    }

    return {
      text: transcription.text,
      transcription,
      source,
      signed: false,
      confirmation_required: false,
    };
  }

  /**
   * Transcribe audio using the primary provider.
   */
  async transcribe(
    audio: AudioInput,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    const provider = this.providers.get(this.config.primary_provider);
    if (!provider) {
      throw new Error(`STT provider "${this.config.primary_provider}" not registered`);
    }
    return provider.transcribe(audio, options);
  }

  /**
   * Get the health of all registered providers.
   */
  async healthCheck(): Promise<Record<string, { available: boolean; error?: string }>> {
    const results: Record<string, { available: boolean; error?: string }> = {};
    for (const [id, provider] of this.providers) {
      try {
        const health = await provider.ping();
        results[id] = { available: health.available, error: health.error };
      } catch (e) {
        results[id] = { available: false, error: String(e) };
      }
    }
    return results;
  }

  /**
   * List all registered providers.
   */
  listProviders(): { id: STTProviderId; name: string; type: string }[] {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
    }));
  }

  /**
   * Dispose all providers.
   */
  async dispose(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.dispose();
    }
    this.providers.clear();
  }
}
