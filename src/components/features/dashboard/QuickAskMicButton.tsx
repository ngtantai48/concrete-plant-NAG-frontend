"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { convertBlobToWav16k, pickSupportedAudioMimeType } from "@/lib/audio-wav";
import { cn } from "@/lib/utils";
import chatApi from "@/services/chat.service";

type Phase = "idle" | "recording" | "sending" | "playing";

const MIN_RECORD_MS = 250;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function QuickAskMicButton({ className }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("idle");

  const sessionIdRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const cleanupRecording = useCallback(
    (discard: boolean) => {
      discardRecordingRef.current = discard;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          stopTracks();
          mediaRecorderRef.current = null;
        }
        return;
      }
      stopTracks();
      mediaRecorderRef.current = null;
    },
    [stopTracks]
  );

  const resetAll = useCallback(() => {
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    cleanupRecording(true);
    releaseAudio();
    chunksRef.current = [];
    sessionIdRef.current = "";
    setPhase("idle");
  }, [cleanupRecording, releaseAudio]);

  useEffect(() => () => resetAll(), [resetAll]);

  const playAudio = useCallback(
    async (blob: Blob) => {
      releaseAudio();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current !== audio) return;
        releaseAudio();
        setPhase("idle");
      };
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        releaseAudio();
        setPhase("idle");
      };

      try {
        setPhase("playing");
        await audio.play();
      } catch (error) {
        releaseAudio();
        setPhase("idle");
        const message = error instanceof Error ? error.message : "Không phát được audio";
        toast.error(message);
      }
    },
    [releaseAudio]
  );

  const sendVoice = useCallback(
    async (blob: Blob) => {
      if (!sessionIdRef.current) sessionIdRef.current = uid("quick-voice");
      setPhase("sending");
      const controller = new AbortController();
      voiceAbortRef.current = controller;

      try {
        const wav = await convertBlobToWav16k(blob);
        const file = new File([wav], "quick-voice.wav", { type: "audio/wav" });
        const result = await chatApi.voiceChat(file, {
          sessionId: sessionIdRef.current,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        void playAudio(result.audio);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setPhase("idle");
        const message = error instanceof Error ? error.message : "Lỗi voice chat";
        toast.error(message);
      }
    },
    [playAudio]
  );

  const startRecording = useCallback(async () => {
    releaseAudio();
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    chunksRef.current = [];
    discardRecordingRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Trình duyệt không hỗ trợ ghi âm");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mimeType = pickSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTracks();
        mediaRecorderRef.current = null;

        if (discardRecordingRef.current) {
          chunksRef.current = [];
          return;
        }

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];

        if (blob.size === 0 || performance.now() - startedAtRef.current < MIN_RECORD_MS) {
          toast.error("Nói lâu hơn một chút rồi bấm Stop");
          setPhase("idle");
          return;
        }

        void sendVoice(blob);
      };
      recorder.onerror = () => {
        cleanupRecording(true);
        setPhase("idle");
        toast.error("Lỗi MediaRecorder khi ghi âm");
      };

      startedAtRef.current = performance.now();
      recorder.start();
      setPhase("recording");
    } catch (error) {
      cleanupRecording(true);
      setPhase("idle");
      const code = (error as { name?: string }).name;
      const message =
        code === "NotAllowedError"
          ? "Vui lòng cấp quyền micro cho trình duyệt"
          : error instanceof Error
            ? error.message
            : "Không thể truy cập microphone";
      toast.error(message);
    }
  }, [cleanupRecording, releaseAudio, sendVoice, stopTracks]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setPhase("idle");
      return;
    }
    discardRecordingRef.current = false;
    try {
      recorder.stop();
    } catch {
      cleanupRecording(true);
      setPhase("idle");
    }
  }, [cleanupRecording]);

  const onToggle = useCallback(() => {
    if (phase === "recording") {
      stopRecording();
      return;
    }
    if (phase === "sending") return;
    if (phase === "playing") {
      resetAll();
      return;
    }
    void startRecording();
  }, [phase, resetAll, startRecording, stopRecording]);

  return (
    <div className={cn("fixed bottom-6 right-6 z-40", className)}>
      <button
        aria-label={phase === "recording" ? "Dừng ghi âm" : "Bắt đầu nói chuyện nhanh"}
        className={cn(
          "flex size-14 select-none items-center justify-center rounded-full shadow-2xl transition-all",
          "focus:outline-none focus:ring-4",
          phase === "recording" &&
            "scale-105 bg-red-500 text-white shadow-red-500/45 focus:ring-red-500/30",
          phase === "sending" &&
            "cursor-not-allowed bg-slate-400 text-white shadow-slate-400/30 focus:ring-slate-400/30",
          phase === "playing" && "bg-zinc-900 text-white shadow-zinc-900/30 focus:ring-zinc-900/25",
          phase === "idle" &&
            "bg-[#007AFF] text-white hover:scale-105 hover:bg-[#0A66E0] focus:ring-[#007AFF]/30"
        )}
        disabled={phase === "sending"}
        onClick={onToggle}
        title={phase === "recording" ? "Bấm để dừng và gửi" : "Bấm để bắt đầu ghi âm"}
        type="button"
      >
        {phase === "sending" ? (
          <Loader2 className="animate-spin" size={22} />
        ) : phase === "recording" || phase === "playing" ? (
          <Square fill="currentColor" size={18} />
        ) : (
          <Mic size={22} />
        )}
      </button>
    </div>
  );
}
