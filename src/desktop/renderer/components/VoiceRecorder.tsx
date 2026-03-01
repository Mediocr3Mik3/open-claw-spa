/**
 * openclaw-spa — Voice Recorder Component
 *
 * Elegant voice memo capture with waveform visualization.
 * Records audio → sends to STT pipeline → returns transcribed text.
 * Can optionally auto-sign the transcription as a verified SPA prompt.
 *
 * Design: A single mic button that expands into a recording strip.
 * Minimal, beautiful, zero-clutter.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { C, glass, Btn, Spinner } from "./shared";

interface VoiceRecorderProps {
  /** Called when transcription is ready */
  onTranscription: (text: string, meta: { provider: string; confidence?: number; duration_ms: number }) => void;
  /** Compact mode — just a mic icon button */
  compact?: boolean;
  /** Placeholder text when idle */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
}

type RecordingState = "idle" | "recording" | "processing" | "preview";

export default function VoiceRecorder({ onTranscription, compact, placeholder, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [amplitude, setAmplitude] = useState<number[]>([]);
  const [transcription, setTranscription] = useState("");
  const [error, setError] = useState("");

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const analyser = useRef<AnalyserNode | null>(null);
  const animFrame = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    setTranscription("");
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      stream.current = ms;

      // Set up audio analysis for waveform
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(ms);
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 64;
      source.connect(analyserNode);
      analyser.current = analyserNode;

      // Prefer webm/opus, fallback to whatever is available
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(ms, mimeType ? { mimeType } : undefined);
      audioChunks.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      recorder.onstop = () => processAudio();
      recorder.start(250); // collect chunks every 250ms
      mediaRecorder.current = recorder;

      setState("recording");
      setElapsed(0);
      setAmplitude([]);

      // Elapsed timer
      timer.current = setInterval(() => setElapsed(e => e + 1), 1000);

      // Waveform animation
      const updateWaveform = () => {
        if (!analyser.current) return;
        const data = new Uint8Array(analyser.current.frequencyBinCount);
        analyser.current.getByteFrequencyData(data);
        const bars = Array.from(data).slice(0, 24).map(v => v / 255);
        setAmplitude(bars);
        animFrame.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
    } catch (err) {
      setError("Microphone access denied. Check your system permissions.");
      setState("idle");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (animFrame.current) { cancelAnimationFrame(animFrame.current); animFrame.current = 0; }
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    if (stream.current) {
      stream.current.getTracks().forEach(t => t.stop());
      stream.current = null;
    }
    analyser.current = null;
  }, []);

  const cancelRecording = useCallback(() => {
    stopRecording();
    audioChunks.current = [];
    setState("idle");
    setAmplitude([]);
    setElapsed(0);
  }, [stopRecording]);

  const processAudio = useCallback(async () => {
    setState("processing");
    setAmplitude([]);
    try {
      const blob = new Blob(audioChunks.current, { type: audioChunks.current[0]?.type || "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const result = await window.spa.voice.transcribe({
        audio_base64: base64,
        mime_type: blob.type,
      });

      if (result.text.trim()) {
        setTranscription(result.text);
        setState("preview");
      } else {
        setError("No speech detected. Try again.");
        setState("idle");
      }
    } catch (err) {
      setError(`Transcription failed: ${err}`);
      setState("idle");
    }
  }, []);

  const confirmTranscription = useCallback(() => {
    onTranscription(transcription, {
      provider: "voice",
      duration_ms: elapsed * 1000,
    });
    setTranscription("");
    setState("idle");
    setElapsed(0);
  }, [transcription, elapsed, onTranscription]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ─── Compact Mode: Just a mic button ───────────────────────────────

  if (compact) {
    return (
      <div style={{ position: "relative", display: "inline-flex" }}>
        {state === "idle" && (
          <button
            onClick={startRecording}
            disabled={disabled}
            title={placeholder ?? "Voice memo"}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: `1px solid ${C.border}`,
              background: "transparent", color: C.muted, fontSize: 16, display: "flex",
              alignItems: "center", justifyContent: "center", transition: "all .15s",
              opacity: disabled ? 0.4 : 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
          >
            &#127908;
          </button>
        )}

        {state === "recording" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
            ...glass(1), borderRadius: 24, animation: "fadeIn .15s ease",
            border: `1px solid rgba(248,113,113,0.3)`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.err, animation: "pulse 1s ease-in-out infinite, recordPulse 1.5s ease-in-out infinite" }} />
            <span style={{ fontSize: 11, color: C.text, fontFamily: C.mono, minWidth: 32 }}>{formatTime(elapsed)}</span>
            <div style={{ display: "flex", gap: 1, alignItems: "center", height: 18 }}>
              {amplitude.slice(0, 12).map((a, i) => (
                <div key={i} style={{
                  width: 2, borderRadius: 1, background: C.err,
                  height: Math.max(3, a * 18), transition: "height 0.05s",
                  opacity: 0.6 + a * 0.4,
                }} />
              ))}
            </div>
            <button onClick={() => stopRecording()} style={{
              width: 24, height: 24, borderRadius: "50%", border: "none",
              background: C.errSoft, color: C.err, fontSize: 10, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>&#9632;</button>
            <button onClick={cancelRecording} style={{
              width: 24, height: 24, borderRadius: "50%", border: "none",
              background: "transparent", color: C.muted, fontSize: 12,
            }}>&times;</button>
          </div>
        )}

        {state === "processing" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
            ...glass(1), borderRadius: 24, animation: "fadeIn .15s ease",
          }}>
            <Spinner size={14} />
            <span style={{ fontSize: 11, color: C.dim }}>Transcribing...</span>
          </div>
        )}

        {state === "preview" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
            ...glass(1), borderRadius: 16, animation: "fadeIn .15s ease",
            maxWidth: 360,
          }}>
            <span style={{ fontSize: 12, color: C.text, flex: 1, lineHeight: 1.5 }}>
              {transcription.length > 80 ? transcription.slice(0, 80) + "..." : transcription}
            </span>
            <button onClick={confirmTranscription} style={{
              padding: "4px 12px", borderRadius: C.rx, border: "none",
              background: C.grad, color: "#fff", fontSize: 11, fontWeight: 600,
              whiteSpace: "nowrap" as const,
            }}>Send</button>
            <button onClick={() => { setState("idle"); setTranscription(""); }} style={{
              width: 22, height: 22, borderRadius: "50%", border: "none",
              background: "transparent", color: C.muted, fontSize: 12,
            }}>&times;</button>
          </div>
        )}

        {error && (
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6,
            padding: "6px 12px", background: C.errSoft, borderRadius: C.rx,
            fontSize: 10, color: C.err, whiteSpace: "nowrap" as const,
            animation: "fadeIn .15s ease",
          }}>{error}</div>
        )}
      </div>
    );
  }

  // ─── Full Mode: Expanded recorder strip ────────────────────────────

  return (
    <div style={{ animation: "fadeIn .2s ease" }}>
      {state === "idle" && (
        <button
          onClick={startRecording}
          disabled={disabled}
          style={{
            width: "100%", padding: "16px 20px", ...glass(1), borderRadius: C.r,
            border: `1px dashed ${C.border}`, color: C.dim, fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all .15s", opacity: disabled ? 0.4 : 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.dim; }}
        >
          <span style={{ fontSize: 20 }}>&#127908;</span>
          <span>{placeholder ?? "Record a voice memo"}</span>
        </button>
      )}

      {state === "recording" && (
        <div style={{
          padding: "16px 20px", ...glass(1), borderRadius: C.r,
          border: `1px solid rgba(248,113,113,0.2)`, animation: "fadeIn .15s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.err, animation: "pulse 1s ease-in-out infinite, recordPulse 1.5s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Recording</span>
            <span style={{ fontSize: 13, color: C.dim, fontFamily: C.mono }}>{formatTime(elapsed)}</span>
            <div style={{ flex: 1 }} />
            <Btn v="d" onClick={() => stopRecording()} style={{ padding: "6px 16px", fontSize: 12 }}>Stop</Btn>
            <button onClick={cancelRecording} style={{
              padding: "6px 12px", borderRadius: C.rx, border: `1px solid ${C.border}`,
              background: "transparent", color: C.dim, fontSize: 12, fontWeight: 600,
            }}>Cancel</button>
          </div>
          <div style={{ display: "flex", gap: 2, alignItems: "center", height: 32, padding: "0 4px" }}>
            {amplitude.map((a, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: 2, background: C.err,
                height: Math.max(4, a * 32), transition: "height 0.05s",
                opacity: 0.4 + a * 0.6,
              }} />
            ))}
          </div>
        </div>
      )}

      {state === "processing" && (
        <div style={{
          padding: "24px 20px", ...glass(1), borderRadius: C.r, textAlign: "center" as const,
          animation: "fadeIn .15s ease",
        }}>
          <Spinner size={20} />
          <div style={{ fontSize: 13, color: C.dim, marginTop: 10 }}>Transcribing your voice memo...</div>
        </div>
      )}

      {state === "preview" && (
        <div style={{
          padding: "16px 20px", ...glass(1), borderRadius: C.r, animation: "fadeIn .15s ease",
        }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
            Transcription Preview
          </div>
          <div style={{
            padding: "12px 16px", background: C.bg, borderRadius: C.rs,
            border: `1px solid ${C.border}`, fontSize: 14, color: C.text,
            lineHeight: 1.7, marginBottom: 12, maxHeight: 120, overflowY: "auto" as const,
          }}>
            {transcription}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setState("idle"); setTranscription(""); }} style={{
              padding: "8px 16px", borderRadius: C.rx, border: `1px solid ${C.border}`,
              background: "transparent", color: C.dim, fontSize: 12, fontWeight: 600,
            }}>Discard</button>
            <Btn onClick={confirmTranscription} style={{ padding: "8px 20px", fontSize: 12 }}>
              Send as Prompt
            </Btn>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: "10px 16px", background: C.errSoft, borderRadius: C.rx,
          fontSize: 12, color: C.err, marginTop: 8, animation: "fadeIn .15s ease",
        }}>{error}</div>
      )}
    </div>
  );
}
