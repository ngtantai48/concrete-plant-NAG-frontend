"use client";

import { Loader2, Mic, MicOff, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { convertBlobToWav16k, pickSupportedAudioMimeType } from "@/lib/audio-wav";
import { cn } from "@/lib/utils";
import chatApi from "@/services/chat.service";

type Phase = "idle" | "recording" | "sending" | "ready" | "error";

const MIN_RECORD_MS = 250;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function QuickAskMicButton({ className }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [transcribedText, setTranscribedText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const sessionIdRef = useRef<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const pendingStopRef = useRef<boolean>(false);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  const releaseAudio = useCallback(() => {
    clearAutoCloseTimer();
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
    setIsPlaying(false);
  }, [clearAutoCloseTimer]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const cleanupRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    }
    stopTracks();
    mediaRecorderRef.current = null;
  }, [stopTracks]);

  const resetAll = useCallback(() => {
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    cleanupRecording();
    releaseAudio();
    setPhase("idle");
    setTranscribedText("");
    setErrorMsg("");
    sessionIdRef.current = "";
  }, [cleanupRecording, releaseAudio]);

  useEffect(() => () => resetAll(), [resetAll]);

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
    resetAll();
  }, [resetAll]);

  // Ref để playAudio.onended có thể gọi closeOverlay mà không tạo circular dep
  const closeOverlayRef = useRef(closeOverlay);
  useEffect(() => {
    closeOverlayRef.current = closeOverlay;
  }, [closeOverlay]);

  const playAudio = useCallback(
    async (blob: Blob) => {
      releaseAudio();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current !== audio) return;
        setIsPlaying(false);
        // Auto-đóng overlay 800ms sau khi audio phát xong (cho user thấy state idle)
        clearAutoCloseTimer();
        autoCloseTimerRef.current = window.setTimeout(() => {
          autoCloseTimerRef.current = null;
          closeOverlayRef.current?.();
        }, 800);
      };
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        setIsPlaying(false);
        // Cũng auto-close khi audio lỗi để không kẹt phase 'ready'
        clearAutoCloseTimer();
        autoCloseTimerRef.current = window.setTimeout(() => {
          autoCloseTimerRef.current = null;
          closeOverlayRef.current?.();
        }, 800);
      };
      try {
        await audio.play();
        if (audioRef.current === audio) setIsPlaying(true);
      } catch (error) {
        if (audioRef.current === audio) setIsPlaying(false);
        const message = error instanceof Error ? error.message : "Không phát được audio";
        toast.error(message);
      }
    },
    [clearAutoCloseTimer, releaseAudio]
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
        if (result.transcript) setTranscribedText(result.transcript);
        setPhase("ready");
        void playAudio(result.audio);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        const msg = error instanceof Error ? error.message : "Lỗi voice chat";
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [playAudio]
  );

  const toggleReplay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    clearAutoCloseTimer();
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.currentTime = 0;
      void audio.play().then(() => setIsPlaying(true));
    }
  }, [clearAutoCloseTimer, isPlaying]);

  const startRecording = useCallback(async () => {
    // Phase check bị bỏ — caller (pointer down) đã resetAll khi cần,
    // và button đã disabled khi phase='sending'. Cho phép press lần 2/3
    // restart ngay không bị kẹt closure phase cũ.
    try {
      chunksRef.current = [];
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Trình duyệt không hỗ trợ ghi âm");
        return;
      }
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
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size === 0 || performance.now() - startedAtRef.current < MIN_RECORD_MS) {
          toast.error("Hãy nhấn giữ lâu hơn để ghi câu hỏi");
          setOverlayOpen(false);
          setPhase("idle");
          return;
        }
        void sendVoice(blob);
      };
      recorder.onerror = () => {
        cleanupRecording();
        setOverlayOpen(false);
        setPhase("idle");
        toast.error("Lỗi MediaRecorder khi ghi âm");
      };
      startedAtRef.current = performance.now();
      recorder.start();
      setPhase("recording");
      setOverlayOpen(true);
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        try {
          recorder.stop();
        } catch {
          /* noop */
        }
      }
    } catch (error) {
      cleanupRecording();
      setOverlayOpen(false);
      setPhase("idle");
      const code = (error as { name?: string }).name;
      const msg =
        code === "NotAllowedError"
          ? "Vui lòng cấp quyền micro cho trình duyệt"
          : error instanceof Error
            ? error.message
            : "Không thể truy cập microphone";
      toast.error(msg);
    }
  }, [cleanupRecording, sendVoice, stopTracks]);

  const stopRecordingButton = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try {
      recorder.stop();
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOverlay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeOverlay, overlayOpen]);

  const isButtonRecording = phase === "recording";
  const isButtonBusy = phase === "sending";

  return (
    <>
      <div className={cn("fixed bottom-6 right-6 z-40", className)}>
        <button
          aria-label={
            isButtonRecording
              ? "Đang ghi âm — thả ra để gửi"
              : isButtonBusy
                ? "Đang xử lý"
                : "Hỏi nhanh AI bằng giọng nói"
          }
          className={cn(
            "grid size-16 select-none touch-none place-items-center rounded-full shadow-2xl transition-all",
            "focus:outline-none focus:ring-4 focus:ring-[#007AFF]/30",
            isButtonRecording && "scale-110 animate-pulse bg-red-500 text-white shadow-red-500/50",
            isButtonBusy && "cursor-not-allowed bg-blue-400 text-white",
            !isButtonBusy &&
              !isButtonRecording &&
              "bg-[#007AFF] text-white hover:scale-105 hover:bg-[#0A66E0]"
          )}
          disabled={isButtonBusy}
          onPointerCancel={() => {
            if (isButtonRecording) stopRecordingButton();
            else pendingStopRef.current = true;
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            // Nếu lần trước còn dư state (ready/error/playing audio), reset trước
            // để cho phép press lần 2 ghi câu hỏi mới ngay lập tức.
            if (phase !== "idle") {
              resetAll();
            }
            pendingStopRef.current = false;
            (event.target as HTMLElement).setPointerCapture(event.pointerId);
            void startRecording();
          }}
          onPointerLeave={() => {
            if (isButtonRecording) stopRecordingButton();
            else pendingStopRef.current = true;
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            try {
              (event.target as HTMLElement).releasePointerCapture(event.pointerId);
            } catch {
              /* noop */
            }
            if (isButtonRecording) stopRecordingButton();
            else pendingStopRef.current = true;
          }}
          style={{ touchAction: "none" }}
          title="Nhấn giữ để hỏi nhanh AI"
          type="button"
        >
          {isButtonBusy ? (
            <Loader2 className="animate-spin" size={28} />
          ) : isButtonRecording ? (
            <MicOff size={28} />
          ) : (
            <Mic size={28} />
          )}
        </button>
      </div>

      {overlayOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end justify-center bg-black/55 backdrop-blur-sm p-4 sm:place-items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeOverlay();
          }}
          role="dialog"
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="border-b border-black/[0.06] px-5 py-3 dark:border-white/10">
              <h2 className="text-[13px] font-extrabold text-zinc-950 dark:text-zinc-50">
                Hỏi nhanh AI
              </h2>
              <p className="text-[11px] text-zinc-400">
                Voice in → voice out · tự đóng khi xong
              </p>
            </header>

            <div className="px-5 py-6">
              {phase === "recording" && (
                <div className="flex flex-col items-center py-4">
                  <div className="relative">
                    <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-red-400/30" />
                    <span className="absolute inset-0 -m-1 animate-pulse rounded-full bg-red-400/20" />
                    <span className="relative grid size-24 place-items-center rounded-full bg-gradient-to-br from-red-500 to-pink-500 text-white shadow-xl">
                      <Mic size={36} />
                    </span>
                  </div>
                  <p className="mt-5 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    Đang nghe... thả ra để gửi
                  </p>
                </div>
              )}

              {phase === "sending" && (
                <div className="flex flex-col items-center py-6">
                  <Loader2 className="text-[#007AFF]" size={32} strokeWidth={2.4} />
                  <p className="mt-4 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    Đang xử lý câu hỏi...
                  </p>
                  <p className="mt-1 text-center text-[11px] text-zinc-400">
                    Backend nhận diện + trả lời + tạo audio
                  </p>
                </div>
              )}

              {phase === "ready" && (
                <div className="space-y-4">
                  {transcribedText && (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2 text-[14px] leading-6 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                        {transcribedText}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#007AFF]/15 bg-[#007AFF]/[0.04] px-4 py-5 dark:border-[#6DB4FF]/20 dark:bg-[#007AFF]/10">
                    <button
                      aria-label={isPlaying ? "Tạm dừng" : "Phát lại"}
                      className="grid size-12 place-items-center rounded-full bg-[#007AFF] text-white shadow-md transition hover:bg-[#0A66E0]"
                      onClick={toggleReplay}
                      type="button"
                    >
                      {isPlaying ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <div className="text-[12px] text-zinc-600 dark:text-zinc-300">
                      <p className="font-semibold">
                        {isPlaying ? "Đang phát câu trả lời..." : "Đã phát xong"}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {isPlaying ? "Bấm để dừng" : "Tự đóng sau giây lát · hoặc bấm để nghe lại"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {phase === "error" && (
                <div className="flex flex-col items-center py-4">
                  <div className="grid size-12 place-items-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    <X size={24} />
                  </div>
                  <p className="mt-3 text-center text-sm font-semibold text-red-600 dark:text-red-300">
                    {errorMsg || "Đã xảy ra lỗi"}
                  </p>
                  <button
                    className="mt-4 rounded-full bg-[#007AFF] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#0A66E0]"
                    onClick={closeOverlay}
                    type="button"
                  >
                    Đóng
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
