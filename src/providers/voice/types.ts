/**
 * openclaw-spa — Voice / Speech-to-Text Types
 *
 * Defines the contract for STT providers (Whisper.cpp, OpenAI Whisper API,
 * WhisperFlo, and future open-source alternatives) and the voice-to-signed-prompt
 * pipeline that converts audio into cryptographically verified SPA envelopes.
 */

// ─── STT Provider Types ─────────────────────────────────────────────────

export type STTProviderId =
  | "whisper-local"      // Whisper.cpp running locally
  | "whisper-api"        // OpenAI Whisper API (cloud)
  | "whisperflo"         // WhisperFlo service
  | "vosk"               // Vosk (offline, lightweight)
  | "deepgram"           // Deepgram API
  | "assemblyai"         // AssemblyAI API
  | "custom";            // User-provided endpoint

export type STTProviderType = "local" | "api";

export interface STTProviderDefinition {
  id: STTProviderId;
  name: string;
  type: STTProviderType;
  description: string;
  requires_api_key: boolean;
  vault_key_name?: string;
  supports_streaming: boolean;
  supports_realtime: boolean;       // For future phone call support
  default_endpoint?: string;
  supported_formats: AudioFormat[];
  max_audio_duration_seconds?: number;
  icon?: string;
}

// ─── Audio Types ────────────────────────────────────────────────────────

export type AudioFormat = "wav" | "mp3" | "m4a" | "ogg" | "webm" | "flac" | "opus";

export interface AudioInput {
  /** Raw audio buffer */
  data: Buffer | ArrayBuffer;
  /** MIME type of the audio */
  mime_type: string;
  /** Duration in seconds (if known) */
  duration_seconds?: number;
  /** Sample rate in Hz (if known) */
  sample_rate?: number;
  /** Number of channels (if known) */
  channels?: number;
  /** Original filename (if uploaded) */
  filename?: string;
}

export interface AudioRecordingConfig {
  /** Sample rate in Hz (default: 16000 for Whisper) */
  sample_rate: number;
  /** Number of channels (default: 1 — mono) */
  channels: number;
  /** Bits per sample (default: 16) */
  bits_per_sample: number;
  /** Max recording duration in seconds (default: 120) */
  max_duration_seconds: number;
  /** Silence detection threshold (0-1, default: 0.01) */
  silence_threshold: number;
  /** Auto-stop after silence duration in ms (default: 2000) */
  silence_timeout_ms: number;
}

export const DEFAULT_RECORDING_CONFIG: AudioRecordingConfig = {
  sample_rate: 16000,
  channels: 1,
  bits_per_sample: 16,
  max_duration_seconds: 120,
  silence_threshold: 0.01,
  silence_timeout_ms: 2000,
};

// ─── Transcription ──────────────────────────────────────────────────────

export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** Detected language (ISO 639-1) */
  language?: string;
  /** Confidence score 0-1 */
  confidence?: number;
  /** Word-level timestamps (if available) */
  words?: TranscriptionWord[];
  /** Processing duration in ms */
  processing_time_ms: number;
  /** Which provider produced this */
  provider_id: STTProviderId;
  /** Model used (e.g. "whisper-large-v3", "whisper-tiny") */
  model?: string;
}

export interface TranscriptionWord {
  word: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface TranscriptionOptions {
  /** Target language hint (ISO 639-1) */
  language?: string;
  /** Task: "transcribe" (same language) or "translate" (to English) */
  task?: "transcribe" | "translate";
  /** Model size/variant hint */
  model?: string;
  /** Prompt hint for better accuracy */
  initial_prompt?: string;
  /** Return word-level timestamps */
  word_timestamps?: boolean;
  /** Temperature for sampling (0 = deterministic) */
  temperature?: number;
}

// ─── Streaming / Realtime (future: phone calls) ─────────────────────────

export interface RealtimeSTTConfig {
  /** Provider to use for realtime transcription */
  provider_id: STTProviderId;
  /** Language hint */
  language?: string;
  /** Interim results (partial transcriptions before utterance complete) */
  interim_results?: boolean;
  /** VAD (Voice Activity Detection) sensitivity */
  vad_sensitivity?: "low" | "medium" | "high";
  /** Max utterance duration before forced finalization */
  max_utterance_seconds?: number;
}

export interface RealtimeTranscriptionEvent {
  type: "interim" | "final" | "error" | "silence";
  text?: string;
  confidence?: number;
  is_final: boolean;
  timestamp: string;
  error?: string;
}

export type RealtimeTranscriptionCallback = (event: RealtimeTranscriptionEvent) => void;

// ─── Voice Pipeline ─────────────────────────────────────────────────────

export interface VoicePipelineConfig {
  /** Primary STT provider */
  primary_provider: STTProviderId;
  /** Fallback provider if primary fails */
  fallback_provider?: STTProviderId;
  /** Auto-sign transcribed text if source is verified */
  auto_sign_verified: boolean;
  /** Require user confirmation before signing */
  require_confirmation: boolean;
  /** Default auth level for voice-initiated prompts */
  default_auth_level: "standard" | "elevated";
  /** Enable voice activity detection */
  vad_enabled: boolean;
}

export const DEFAULT_VOICE_PIPELINE_CONFIG: VoicePipelineConfig = {
  primary_provider: "whisper-local",
  fallback_provider: undefined,
  auto_sign_verified: true,
  require_confirmation: true,
  default_auth_level: "standard",
  vad_enabled: true,
};

// ─── Voice Source Verification ──────────────────────────────────────────

export interface VoiceSourceVerification {
  /** Is the voice source verified (e.g. local mic, registered device)? */
  verified: boolean;
  /** Source type */
  source: "local_mic" | "uploaded_file" | "channel_attachment" | "phone_call" | "unknown";
  /** Device ID if local */
  device_id?: string;
  /** Channel identity if from messaging */
  channel_sender_id?: string;
  /** SPA key_id if the source maps to a registered identity */
  spa_key_id?: string;
}

// ─── Phone Call Types (future-facing) ───────────────────────────────────

export interface PhoneCallConfig {
  /** SIP/WebRTC provider */
  provider: "twilio" | "vonage" | "daily" | "livekit" | "custom";
  /** Phone number (E.164) */
  phone_number?: string;
  /** Fast-response model for conversation (e.g. small local model) */
  fast_model: { provider_id: string; model_id: string };
  /** Deep-thinking model for complex tasks (e.g. Claude, GPT-4) */
  deep_model: { provider_id: string; model_id: string };
  /** Max call duration in minutes */
  max_duration_minutes: number;
  /** Enable call recording */
  record_calls: boolean;
  /** TTS provider for agent speech */
  tts_provider?: "elevenlabs" | "openai" | "local" | "piper";
}

export interface PhoneCallSession {
  id: string;
  started_at: string;
  ended_at?: string;
  caller_id?: string;
  agent_id: string;
  transcript: { role: "user" | "agent"; text: string; timestamp: string }[];
  status: "ringing" | "active" | "on_hold" | "ended";
  duration_seconds?: number;
}

// ─── STT Provider Health ────────────────────────────────────────────────

export interface STTProviderHealth {
  available: boolean;
  latency_ms?: number;
  model_loaded?: boolean;
  error?: string;
}

// ─── Events ─────────────────────────────────────────────────────────────

export type VoiceEventType =
  | "transcription_complete"
  | "transcription_failed"
  | "voice_prompt_signed"
  | "voice_prompt_unsigned"
  | "recording_started"
  | "recording_stopped"
  | "phone_call_started"
  | "phone_call_ended"
  | "stt_provider_switched";

export interface VoiceEvent {
  type: VoiceEventType;
  provider_id?: STTProviderId;
  detail: string;
  timestamp: string;
}
