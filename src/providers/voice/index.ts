/**
 * openclaw-spa — Voice / STT Module Barrel Export
 */

export * from "./types.js";
export { BaseSTTAdapter } from "./base-stt-adapter.js";
export { WhisperLocalAdapter } from "./whisper-local.js";
export type { WhisperLocalConfig } from "./whisper-local.js";
export { WhisperAPIAdapter } from "./whisper-api.js";
export type { WhisperAPIConfig } from "./whisper-api.js";
export { WhisperFloAdapter } from "./whisperflo.js";
export type { WhisperFloConfig } from "./whisperflo.js";
export { VoicePipeline } from "./voice-pipeline.js";
export type { VoicePipelineResult, SigningDelegate } from "./voice-pipeline.js";
