"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Files,
  FolderOpen,
  NotebookPen,
  ShieldCheck,
} from "lucide-react";
import { hasWorklogLocalDraft } from "@/lib/terraqo/worklog-local-draft";

export function TrajectoryActions({
  profileId,
  workCases,
  endorsements,
}: {
  profileId: string;
  workCases: boolean;
  endorsements: boolean;
}) {
  const [draftProfile, setDraftProfile] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const exists =
          localStorage.getItem(`terraqo:draft-consent:${profileId}`) === "1" &&
          (await hasWorklogLocalDraft(`professional:${profileId}:worklog`));
        if (active) setDraftProfile(exists ? profileId : null);
      } catch {
        if (active) setDraftProfile(null);
      }
    }
    void read();
    window.addEventListener("pageshow", read);
    return () => {
      active = false;
      window.removeEventListener("pageshow", read);
    };
  }, [profileId]);
  const hasDraft = draftProfile === profileId;
  return (
    <section
      aria-labelledby="trajectory-title"
      className="rounded-2xl border border-[#294057] bg-[#091827] p-5 text-white sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 id="trajectory-title" className="text-2xl font-bold">
            Mi trayectoria
          </h2>
          {hasDraft && (
            <p className="mt-1 text-sm text-[#b8cde2]">
              Tienes un borrador guardado en este dispositivo.
            </p>
          )}
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#255da6] px-4 font-semibold hover:bg-[#316bb6]"
          href="/portal/bitacora#registrar-trabajo"
        >
          <NotebookPen size={18} />
          {hasDraft ? "Continuar borrador" : "Registrar trabajo"}
          <ArrowRight size={16} />
        </Link>
      </div>
      <nav
        aria-label="Trabajo documentado"
        className="mt-4 flex flex-wrap gap-x-5 border-t border-[#294057] pt-2 text-sm text-[#cee0f2]"
      >
        {workCases && (
          <Link
            className="inline-flex min-h-11 items-center gap-2 hover:underline"
            href="/portal/bitacora#organizar-trabajo"
          >
            <FolderOpen size={16} />
            Organizar trabajos
          </Link>
        )}
        {endorsements && (
          <Link
            className="inline-flex min-h-11 items-center gap-2 hover:underline"
            href="/portal/respaldos"
          >
            <ShieldCheck size={16} />
            Solicitar respaldo
          </Link>
        )}
        <Link
          className="inline-flex min-h-11 items-center gap-2 hover:underline"
          href="/portal/documentos"
        >
          <Files size={16} />
          Mis documentos
        </Link>
      </nav>
    </section>
  );
}
