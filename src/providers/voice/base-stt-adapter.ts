/**
 * openclaw-spa — Base STT Adapter
 *
 * Abstract class that all speech-to-text provider adapters implement.
 * Follows the same pattern as BaseLLMAdapter for consistency.
 */

import type {
  AudioInput,
  TranscriptionResult,
  TranscriptionOptions,
  STTProviderId,
  STTProviderType,
  STTProviderHealth,
  RealtimeSTTConfig,
  RealtimeTranscriptionCallback,
} from "./types.js";

export abstract class BaseSTTAdapter {
  abstract readonly id: STTProviderId;
  abstract readonly name: string;
  abstract readonly type: STTProviderType;
  abstract readonly supportsStreaming: boolean;
  abstract readonly supportsRealtime: boolean;

  /**
   * Transcribe audio to text — primary interface.
   */
  abstract transcribe(
    audio: AudioInput,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;

  /**
   * Health check — is the provider available and ready?
   */
  abstract ping(): Promise<STTProviderHealth>;

  /**
   * Start a realtime transcription session (for phone calls / live mic).
   * Returns a cleanup function to stop the session.
   * Override in providers that support realtime.
   */
  async startRealtime(
    _config: RealtimeSTTConfig,
    _onEvent: RealtimeTranscriptionCallback,
  ): Promise<() => void> {
    throw new Error(`${this.name} does not support realtime transcription`);
  }

  /**
   * List available models for this provider.
   */
  abstract listModels(): Promise<string[]>;

  /**
   * Provider-specific cleanup.
   */
  async dispose(): Promise<void> {
    // Default: no-op. Override if needed.
  }
}
