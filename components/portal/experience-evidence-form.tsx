"use client";

import { useState, type FormHTMLAttributes, type ReactNode } from "react";
import { uploadExperienceEvidenceFiles } from "@/lib/terraqo/experience-evidence-upload";

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
};

export function ExperienceEvidenceForm({ action, children, ...props }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setError(null);
    const files = formData.getAll("evidenceFiles").filter((value): value is File => value instanceof File && value.size > 0);
    try {
      const receipts = await uploadExperienceEvidenceFiles(files, setStatus);
      formData.delete("evidenceFiles");
      receipts.forEach((receipt) => formData.append("evidenceUploadReceipt", receipt));
      setStatus(files.length ? "Confirmando la experiencia…" : null);
      await action(formData);
    } catch (caught) {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "No se pudo cargar la evidencia.");
    }
  }

  return <form action={submit} {...props}>{children}{status ? <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">{status}</p> : null}{error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{error}</p> : null}</form>;
}
