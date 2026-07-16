"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/terraqo/user-avatar";

export function ProfessionalPhotoUploader({ name, image }: { name: string; image?: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.set("photo", file);
      const response = await fetch("/api/terraqo/profile-photo", { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos actualizar la foto.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No pudimos actualizar la foto.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative shrink-0">
      <UserAvatar name={name} image={image} size="xl" className="border-4 border-white shadow-xl" />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-primary text-white shadow-lg transition hover:bg-primary/90 disabled:opacity-60"
        title="Actualizar foto de perfil"
        aria-label="Actualizar foto de perfil"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </button>
      {feedback ? <p className="absolute left-0 top-full mt-2 w-56 rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">{feedback}</p> : null}
    </div>
  );
}
