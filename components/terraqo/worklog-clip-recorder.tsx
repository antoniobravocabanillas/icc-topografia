"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Video } from "lucide-react";
import { WORKLOG_CLIP_LIMIT } from "@/lib/terraqo/worklog-clip-types";

export function WorklogClipRecorder({ onFile, onBusy, onError }: {
  onFile: (file: File) => void; onBusy: (busy: boolean) => void; onError: (message: string) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const requesting = useRef(false);
  const [mode, setMode] = useState<"audio" | "video" | "requesting" | null>(null);
  const latest = useRef(onFile);
  useEffect(() => { latest.current = onFile; }, [onFile]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  useEffect(() => {
    if (live.current) live.current.srcObject = stream.current;
  }, [mode]);

  async function start(kind: "audio" | "video") {
    if (requesting.current) return;
    requesting.current = true;
    onBusy(true);
    onError("");
    setMode("requesting");
    function finish() {
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
      recorder.current = null;
      requesting.current = false;
      if (mounted.current) { setMode(null); onBusy(false); }
    }
    try {
      const formats = kind === "audio" ? ["audio/webm;codecs=opus", "audio/mp4"] :
        ["video/webm;codecs=vp8,opus", "video/mp4;codecs=avc1,mp4a.40.2"];
      const mimeType = typeof MediaRecorder !== "undefined" && formats.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType || !navigator.mediaDevices?.getUserMedia)
        throw new Error("Este navegador no permite esta grabación. Puedes adjuntar un archivo MP4 o WebM.");
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true,
        video: kind === "video" ? { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } } : false });
      if (!mounted.current) { finish(); return; }
      const recording = new MediaRecorder(stream.current, { mimeType, audioBitsPerSecond: 48000, videoBitsPerSecond: 600000 });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let bytes = 0;
      let failed = false;
      recording.ondataavailable = ({ data }) => {
        bytes += data.size;
        if (bytes <= WORKLOG_CLIP_LIMIT) chunks.push(data);
        // Leave room for the final chunk when stopping near the hosting limit.
        if (bytes > WORKLOG_CLIP_LIMIT - 192 * 1024 && recording.state === "recording") recording.stop();
      };
      recording.onerror = () => {
        failed = true;
        if (mounted.current) onError("Se interrumpió la grabación. Inténtalo de nuevo.");
      };
      recording.onstop = () => {
        finish();
        if (!mounted.current || failed) return;
        if (!bytes || bytes > WORKLOG_CLIP_LIMIT) { onError("La grabación está vacía o supera los 3 MB."); return; }
        const type = recording.mimeType.split(";")[0].toLowerCase();
        latest.current(new File(chunks, `${kind}-${Date.now()}.${type.split("/")[1]}`, { type }));
      };
      recording.start(250);
      setMode(kind);
    } catch (error) {
      finish();
      if (mounted.current) onError(error instanceof DOMException ? "No se pudo acceder al dispositivo. Revisa el permiso de cámara o micrófono." :
        error instanceof Error ? error.message : "No se pudo iniciar la grabación.");
    }
  }
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold";
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {mode ? <button type="button" className={button} disabled={mode === "requesting"} onClick={() => {
        if (recorder.current?.state === "recording") recorder.current.stop();
      }}><Square size={16} />{mode === "requesting" ? "Esperando permiso…" : "Detener grabación"}</button> : <>
        <button type="button" className={button} onClick={() => void start("audio")}><Mic size={18} />Grabar audio</button>
        <button type="button" className={button} onClick={() => void start("video")}><Video size={18} />Grabar video</button>
      </>}
    </div>
    {mode === "video" && <video ref={live} autoPlay muted playsInline aria-label="Cámara en directo" className="max-h-48 rounded-lg" />}
  </div>;
}
