"use client";

import { Loader2, Mic, MicOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { convertBlobToWav16k, pickSupportedAudioMimeType } from "@/lib/audio-wav";
import { cn } from "@/lib/utils";
import speechApi from "@/services/speech.service";

type RecState = "idle" | "recording" | "processing";

const MIN_RECORD_MS = 250;

export default function QuickAskMicButton({
  className,
  target = "/ai-assistant",
}: {
  className?: string;
  target?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<RecState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  // True khi user thả tay trước lúc recorder bắt đầu — sẽ stop ngay sau khi start
  const pendingStopRef = useRef<boolean>(false);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
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

  useEffect(() => () => cleanup(), [cleanup]);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      setState("processing");
      try {
        const wav = await convertBlobToWav16k(blob);
        const file = new File([wav], "quick-ask.wav", { type: "audio/wav" });
        const result = await speechApi.transcribe(file);
        const text = result.text.trim();
        if (!text) {
          toast.error("Không nhận diện được nội dung");
          return;
        }
        router.push(`${target}?ask=${encodeURIComponent(text)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Lỗi xử lý âm thanh";
        toast.error(message);
      } finally {
        setState("idle");
      }
    },
    [router, target]
  );

  const startRecording = useCallback(async () => {
    if (state !== "idle") return;
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
          setState("idle");
          return;
        }
        void transcribeBlob(blob);
      };
      recorder.onerror = () => {
        cleanup();
        setState("idle");
        toast.error("Lỗi MediaRecorder khi ghi âm");
      };
      startedAtRef.current = performance.now();
      recorder.start();
      setState("recording");
      // Nếu user đã nhả tay trước khi getUserMedia resolve → stop ngay
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        try {
          recorder.stop();
        } catch {
          /* noop */
        }
      }
    } catch (error) {
      cleanup();
      setState("idle");
      const code = (error as { name?: string }).name;
      const msg =
        code === "NotAllowedError"
          ? "Vui lòng cấp quyền micro cho trình duyệt"
          : error instanceof Error
            ? error.message
            : "Không thể truy cập microphone";
      toast.error(msg);
    }
  }, [cleanup, state, stopTracks, transcribeBlob]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try {
      recorder.stop();
    } catch {
      /* noop */
    }
  }, []);

  const isRecording = state === "recording";
  const isProcessing = state === "processing";

  return (
    <div className={cn("fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2", className)}>
      {isRecording && (
        <span className="animate-pulse rounded-full bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-600 shadow-md dark:bg-red-500/10 dark:text-red-300">
          Đang ghi âm... thả ra để gửi
        </span>
      )}
      {isProcessing && (
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-600 shadow-md dark:bg-blue-500/10 dark:text-blue-300">
          Đang xử lý...
        </span>
      )}
      <button
        aria-label={
          isRecording
            ? "Đang ghi âm — thả ra để gửi"
            : isProcessing
              ? "Đang xử lý giọng nói"
              : "Hỏi nhanh AI bằng giọng nói"
        }
        className={cn(
          "grid size-16 select-none touch-none place-items-center rounded-full shadow-2xl transition-all",
          "focus:outline-none focus:ring-4 focus:ring-[#007AFF]/30",
          isRecording && "scale-110 animate-pulse bg-red-500 text-white shadow-red-500/50",
          isProcessing && "cursor-not-allowed bg-blue-400 text-white",
          !isRecording &&
            !isProcessing &&
            "bg-[#007AFF] text-white hover:scale-105 hover:bg-[#0A66E0]"
        )}
        disabled={isProcessing}
        onPointerCancel={() => {
          if (isRecording) stopRecording();
          else pendingStopRef.current = true;
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          if (state !== "idle") return;
          pendingStopRef.current = false;
          (event.target as HTMLElement).setPointerCapture(event.pointerId);
          void startRecording();
        }}
        onPointerLeave={() => {
          if (isRecording) stopRecording();
          else pendingStopRef.current = true;
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          try {
            (event.target as HTMLElement).releasePointerCapture(event.pointerId);
          } catch {
            /* noop */
          }
          if (isRecording) stopRecording();
          else pendingStopRef.current = true;
        }}
        style={{ touchAction: "none" }}
        title="Nhấn giữ để hỏi nhanh AI"
        type="button"
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={28} />
        ) : isRecording ? (
          <MicOff size={28} />
        ) : (
          <Mic size={28} />
        )}
      </button>
    </div>
  );
}
