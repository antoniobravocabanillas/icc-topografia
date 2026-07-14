"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BadgeCheck, FileText, IdCard, Loader2, LockKeyhole, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ProfessionalDocument = {
  id: string;
  type: "CV" | "DNI_FRONT" | "DNI_BACK";
  fileName: string;
  reviewStatus: "SUBMITTED" | "VERIFIED" | "REJECTED";
  reviewNote: string | null;
};

type ProfessionalDocumentUploaderProps = {
  identityStatus: "PENDING_DOCUMENTS" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
  identityNote: string | null;
  documents: ProfessionalDocument[];
};

const identityCopy = {
  PENDING_DOCUMENTS: {
    label: "Documentos pendientes",
    description: "Sube el frente y el reverso de tu DNI para solicitar la validacion de identidad."
  },
  UNDER_REVIEW: {
    label: "Identidad en revision",
    description: "Tus documentos fueron recibidos y estan siendo revisados por el workspace."
  },
  VERIFIED: {
    label: "Identidad verificada",
    description: "Tu identidad fue validada. El distintivo fortalece la confianza de tu perfil profesional."
  },
  REJECTED: {
    label: "Se requiere una nueva carga",
    description: "Revisa la observacion y vuelve a subir ambos lados del DNI."
  }
} as const;

export function ProfessionalDocumentUploader({ identityStatus, identityNote, documents }: ProfessionalDocumentUploaderProps) {
  const router = useRouter();
  const cvFormRef = useRef<HTMLFormElement>(null);
  const identityFormRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<"cv" | "identity" | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const latestCv = documents.find((document) => document.type === "CV");
  const statusCopy = identityCopy[identityStatus];

  async function upload(form: HTMLFormElement, purpose: "cv" | "identity") {
    setBusy(purpose);
    setFeedback(null);
    const formData = new FormData(form);
    formData.set("purpose", purpose);

    try {
      const response = await fetch("/api/terraqo/professional-documents", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "No pudimos cargar los documentos.");

      setFeedback({ type: "success", message: payload?.data?.message || "Documento cargado correctamente." });
      form.reset();
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No pudimos cargar los documentos."
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> CV profesional</CardTitle>
              <CardDescription className="mt-2">Actualiza el archivo que acompana tus postulaciones y tu CV vivo.</CardDescription>
            </div>
            {latestCv ? <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">Cargado</span> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestCv ? (
            <a
              href={`/api/terraqo/professional-documents/${latestCv.id}`}
              className="flex items-center justify-between rounded-md border bg-muted/35 p-3 text-sm font-semibold hover:border-primary"
            >
              <span className="truncate">{latestCv.fileName}</span>
              <span className="text-primary">Ver archivo</span>
            </a>
          ) : null}
          <form ref={cvFormRef} className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void upload(event.currentTarget, "cv"); }}>
            <label className="grid gap-2 text-sm font-semibold">
              PDF, DOC o DOCX (maximo 10 MB)
              <input name="cvFile" type="file" accept=".pdf,.doc,.docx" required className="rounded-md border bg-background p-3 font-normal" />
            </label>
            <Button type="submit" disabled={busy !== null}>
              {busy === "cv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {latestCv ? "Reemplazar CV" : "Subir CV"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className={identityStatus === "VERIFIED" ? "border-emerald-300" : undefined}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {identityStatus === "VERIFIED" ? <BadgeCheck className="h-5 w-5 text-emerald-600" /> : <IdCard className="h-5 w-5 text-primary" />}
                Verificacion de identidad
              </CardTitle>
              <CardDescription className="mt-2">{statusCopy.description}</CardDescription>
            </div>
            <span className="rounded-md border px-2.5 py-1 text-xs font-bold">{statusCopy.label}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>El DNI es privado. Solo tu cuenta y los responsables autorizados del workspace pueden consultarlo para validar identidad.</p>
          </div>
          {identityNote ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Observacion: {identityNote}</p> : null}
          {identityStatus !== "VERIFIED" ? (
            <form ref={identityFormRef} className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void upload(event.currentTarget, "identity"); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  DNI por delante
                  <input name="dniFront" type="file" accept="image/jpeg,image/png,image/webp,.pdf" required className="rounded-md border bg-background p-3 font-normal" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  DNI por detras
                  <input name="dniBack" type="file" accept="image/jpeg,image/png,image/webp,.pdf" required className="rounded-md border bg-background p-3 font-normal" />
                </label>
              </div>
              <Button type="submit" variant="outline" disabled={busy !== null}>
                {busy === "identity" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <IdCard className="mr-2 h-4 w-4" />}
                {identityStatus === "UNDER_REVIEW" ? "Reemplazar documentos" : "Solicitar verificacion"}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {feedback ? (
        <p className={`rounded-md border p-3 text-sm font-medium xl:col-span-2 ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} role="status">
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
