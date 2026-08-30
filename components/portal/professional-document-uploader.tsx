"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BadgeCheck, Download, Eye, FileBadge2, FileText, IdCard, Loader2, LockKeyhole, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ProfessionalDocument = {
  id: string;
  type: "CV" | "DNI_FRONT" | "DNI_BACK" | "CERTIFICATE" | "PROFESSIONAL_LICENSE" | "CRIMINAL_RECORD" | "MEDICAL_EXAM" | "BANK_CERTIFICATE" | "OTHER";
  fileName: string;
  contentType: string;
  size: number;
  reviewStatus: "SUBMITTED" | "VERIFIED" | "REJECTED";
  reviewNote: string | null;
  uploadedAt: Date | string;
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
    description: "Tus documentos fueron recibidos y estan siendo revisados por Terraqo."
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
  const privateFormRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<"cv" | "identity" | "document" | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [preview, setPreview] = useState<ProfessionalDocument | null>(null);
  const latestCv = documents.find((document) => document.type === "CV");
  const statusCopy = identityCopy[identityStatus];

  async function upload(form: HTMLFormElement, purpose: "cv" | "identity" | "document") {
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

  const labels: Record<ProfessionalDocument["type"], string> = {
    CV: "CV profesional",
    DNI_FRONT: "DNI por delante",
    DNI_BACK: "DNI por detras",
    CERTIFICATE: "Antecedentes policiales",
    PROFESSIONAL_LICENSE: "Certiadulto",
    CRIMINAL_RECORD: "Antecedentes penales",
    MEDICAL_EXAM: "SCTR",
    BANK_CERTIFICATE: "Constancia bancaria",
    OTHER: "Otro documento",
  };
  const privateDocuments = documents.filter((document) => !["CV", "DNI_FRONT", "DNI_BACK"].includes(document.type));

  return (
    <div id="documentos-datos" className="grid scroll-mt-24 gap-6 xl:grid-cols-2">
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
            <div className="grid gap-2 rounded-md border bg-muted/35 p-3 text-sm font-semibold sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <span className="truncate">{latestCv.fileName}</span>
              <button type="button" onClick={() => setPreview(latestCv)} className="inline-flex items-center gap-1 text-primary"><Eye className="h-4 w-4" /> Previsualizar</button>
              <a href={`/api/terraqo/professional-documents/${latestCv.id}`} className="inline-flex items-center gap-1 text-primary"><Download className="h-4 w-4" /> Descargar</a>
            </div>
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
            <p>El DNI es privado. Solo tu cuenta y el equipo autorizado de Terraqo pueden consultarlo para validar tu identidad.</p>
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

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileBadge2 className="h-5 w-5 text-primary" /> Documentos y datos profesionales</CardTitle>
          <CardDescription className="mt-2 max-w-3xl">Organiza antecedentes penales, antecedentes policiales, Certiadulto y SCTR. Tu expediente pertenece a tu perfil personal y permanece privado; no necesitas estar vinculado a una empresa.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form ref={privateFormRef} className="grid content-start gap-3 rounded-lg border bg-muted/20 p-4" onSubmit={(event) => { event.preventDefault(); void upload(event.currentTarget, "document"); }}>
            <label className="grid gap-2 text-sm font-semibold">Categoria
              <select name="documentType" required className="h-11 rounded-md border bg-background px-3 font-normal">
                <option value="CRIMINAL_RECORD">Antecedentes penales</option>
                <option value="CERTIFICATE">Antecedentes policiales</option>
                <option value="PROFESSIONAL_LICENSE">Certiadulto</option>
                <option value="MEDICAL_EXAM">SCTR</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">Archivo para expediente
              <input name="documentFile" type="file" accept="image/jpeg,image/png,image/webp,.pdf" required className="rounded-md border bg-background p-3 font-normal" />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">PDF, JPG, PNG o WEBP, maximo 10 MB. No ingreses numeros de cuenta en texto libre; utiliza una constancia emitida por tu entidad bancaria.</p>
            <Button type="submit" disabled={busy !== null}>{busy === "document" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Agregar al expediente</Button>
          </form>

          <div className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-2">
              {privateDocuments.map((document) => (
                <article key={document.id} className="flex min-h-28 flex-col justify-between rounded-lg border bg-background p-4">
                  <div><p className="text-xs font-bold uppercase text-primary">{labels[document.type]}</p><p className="mt-2 truncate text-sm font-semibold">{document.fileName}</p><p className="mt-1 text-xs text-muted-foreground">{document.reviewStatus === "VERIFIED" ? "Verificado" : document.reviewStatus === "REJECTED" ? "Requiere correccion" : "Pendiente de revision"}</p></div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => setPreview(document)} className="inline-flex items-center gap-2 text-sm font-bold text-primary"><Eye className="h-4 w-4" /> Ver dentro del portal</button>
                    <a href={`/api/terraqo/professional-documents/${document.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-primary"><Download className="h-4 w-4" /> Descargar</a>
                  </div>
                </article>
              ))}
            </div>
            {!privateDocuments.length ? <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aun no agregaste documentos complementarios a tu expediente.</div> : null}
          </div>
        </CardContent>
      </Card>

      {feedback ? (
        <p className={`rounded-md border p-3 text-sm font-medium xl:col-span-2 ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} role="status">
          {feedback.message}
        </p>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${labels[preview.type]}`}>
          <div className="flex h-[min(860px,92vh)] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4"><div className="min-w-0"><p className="text-xs font-bold uppercase text-primary">{labels[preview.type]}</p><p className="truncate font-semibold">{preview.fileName}</p></div><button type="button" onClick={() => setPreview(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border" aria-label="Cerrar vista previa"><X className="h-5 w-5" /></button></div>
            <div className="min-h-0 flex-1 bg-slate-100 p-3">
              {preview.contentType.startsWith("image/") ? (
                <img
                  src={`/api/terraqo/professional-documents/${preview.id}?inline=1`}
                  alt={preview.fileName}
                  className="h-full w-full rounded-md bg-white object-contain"
                />
              ) : preview.contentType === "application/pdf" ? (
                <object
                  data={`/api/terraqo/professional-documents/${preview.id}?inline=1`}
                  type="application/pdf"
                  className="h-full w-full rounded-md bg-white"
                >
                  <div className="grid h-full place-items-center p-8 text-center">
                    <div>
                      <FileText className="mx-auto h-12 w-12 text-primary" />
                      <p className="mt-4 font-semibold">Tu navegador no pudo mostrar el PDF dentro del portal.</p>
                      <Button asChild className="mt-4"><a href={`/api/terraqo/professional-documents/${preview.id}`}>Descargar archivo protegido</a></Button>
                    </div>
                  </div>
                </object>
              ) : (
                <div className="grid h-full place-items-center p-8 text-center"><div><FileText className="mx-auto h-12 w-12 text-primary" /><p className="mt-4 font-semibold">Este formato no puede representarse directamente en el navegador.</p><Button asChild className="mt-4"><a href={`/api/terraqo/professional-documents/${preview.id}`}>Descargar archivo protegido</a></Button></div></div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
