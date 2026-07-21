"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Download, Eye, FileArchive, FileImage, FileText, FolderOpen, LockKeyhole, Share2, Trash2, UploadCloud } from "lucide-react";

type WorkspaceOption = { id: string; name: string };
type StoredFile = {
  id: string; userId: string; category: string; visibility: "PRIVATE" | "WORKSPACE"; title: string; description?: string | null;
  projectName?: string | null; fileName: string; contentType: string; size: number; createdAt: string;
  user?: { name: string | null; email: string; image: string | null };
};

const categories = [
  ["PLAN", "Planos y archivos técnicos"], ["REPORT", "Informes y reportes"], ["SPREADSHEET", "Hojas de cálculo"],
  ["PRESENTATION", "Presentaciones"], ["IMAGE", "Imágenes"], ["SOURCE_FILE", "Archivos de trabajo"],
  ["CONTRACT", "Contratos"], ["TEMPLATE", "Plantillas"], ["OTHER", "Otros"]
];

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ contentType, fileName }: { contentType: string; fileName: string }) {
  if (contentType.startsWith("image/")) return <FileImage className="h-5 w-5" />;
  if (fileName.toLowerCase().endsWith(".zip")) return <FileArchive className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export function PrivateFilesManager({ workspaces, userId, apiBase = "/api/terraqo" }: { workspaces: WorkspaceOption[]; userId?: string; apiBase?: string }) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [preview, setPreview] = useState<StoredFile | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const response = await fetch(`${apiBase}/files?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "No se pudieron cargar los archivos.");
    setFiles(payload.data);
  }, [apiBase, workspaceId]);
  useEffect(() => { load().catch((error) => setStatus(error.message)); }, [load]);
  const visible = useMemo(() => filter === "ALL" ? files : files.filter((file) => file.category === filter), [files, filter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("workspaceId", workspaceId);
    try {
      const response = await fetch(`${apiBase}/files`, { method: "POST", body: data });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "No se pudo cargar el archivo.");
      form.reset(); setStatus("Archivo guardado en tu espacio privado."); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo cargar el archivo."); }
    finally { setBusy(false); }
  }

  async function remove(file: StoredFile) {
    if (!confirm(`¿Eliminar “${file.title}” de forma permanente?`)) return;
    const response = await fetch(`${apiBase}/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) return setStatus("No se pudo eliminar el archivo.");
    setPreview(null); await load();
  }

  const canPreview = (file: StoredFile) => file.contentType.startsWith("image/") || file.contentType === "application/pdf" || file.contentType.startsWith("text/");

  return <div className="space-y-7">
    <section className="rounded-lg border border-[#d9e8e5] bg-white p-6 shadow-[0_20px_60px_rgba(9,50,58,0.07)] lg:p-9">
      <div className="grid gap-8 xl:grid-cols-[0.72fr_1.28fr]">
        <div>
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#e8f7f5] text-[#008f87]"><FolderOpen className="h-6 w-6" /></span>
          <p className="mt-6 font-mono text-xs font-bold uppercase tracking-[0.17em] text-[#008f87]">Repositorio de trabajo</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[#092731]">Tus archivos, ordenados por el trabajo que realizas.</h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-[#58717a]">Guarda planos, informes, imágenes, hojas de cálculo, presentaciones o archivos de cualquier especialidad. Tú decides si quedan privados o visibles para tu empresa vinculada.</p>
          <div className="mt-6 flex items-start gap-3 rounded-lg bg-[#f1f8f7] p-4 text-sm text-[#466069]"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#008f87]" /><p>Los archivos privados solo son visibles desde tu cuenta. Los compartidos pueden ser revisados por administradores autorizados del mismo workspace.</p></div>
        </div>
        <form onSubmit={submit} className="grid gap-4 rounded-lg border border-[#d6e5e2] bg-[#fbfdfd] p-5 sm:grid-cols-2 lg:p-6">
          <h3 className="font-display text-2xl font-bold sm:col-span-2">Agregar archivo</h3>
          {workspaces.length > 1 ? <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Espacio<select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-11 rounded-lg border bg-white px-3 font-normal">{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label> : null}
          <label className="grid gap-2 text-sm font-semibold">Título<input name="title" required maxLength={160} placeholder="Ej. Plano de replanteo" className="h-12 rounded-lg border px-4 font-normal outline-none focus:border-[#009c92]" /></label>
          <label className="grid gap-2 text-sm font-semibold">Categoría<select name="category" className="h-12 rounded-lg border bg-white px-3 font-normal">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-semibold">Proyecto o contexto <span className="font-normal text-[#789098]">(opcional)</span><input name="projectName" maxLength={160} placeholder="Proyecto, cliente o actividad" className="h-12 rounded-lg border px-4 font-normal outline-none focus:border-[#009c92]" /></label>
          <label className="grid gap-2 text-sm font-semibold">Quién puede verlo<select name="visibility" className="h-12 rounded-lg border bg-white px-3 font-normal"><option value="PRIVATE">Solo yo</option><option value="WORKSPACE">Mi empresa vinculada</option></select></label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Descripción <span className="font-normal text-[#789098]">(opcional)</span><textarea name="description" maxLength={1000} placeholder="Qué contiene y para qué se utiliza" className="min-h-24 rounded-lg border p-4 font-normal outline-none focus:border-[#009c92]" /></label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Archivo<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.avif,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.zip" className="min-h-12 rounded-lg border bg-white p-2 text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-[#e8f7f5] file:px-4 file:py-2 file:font-semibold file:text-[#08736e]" /><small className="font-normal text-[#789098]">Máximo 35 MB. No se admiten ejecutables.</small></label>
          <button disabled={busy || !workspaceId} className="min-h-12 rounded-lg bg-[#009c92] px-5 font-semibold text-white transition hover:bg-[#007f78] disabled:opacity-50 sm:col-span-2"><UploadCloud className="mr-2 inline h-4 w-4" />{busy ? "Cargando..." : "Guardar archivo"}</button>
        </form>
      </div>
    </section>

    {status ? <p role="status" className="rounded-lg border border-[#b8ded9] bg-[#eaf8f6] px-4 py-3 text-sm font-semibold text-[#075a57]">{status}</p> : null}
    <section>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#008f87]">Biblioteca privada</p><h2 className="mt-2 font-display text-2xl font-bold">Archivos guardados</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-11 rounded-lg border bg-white px-3 text-sm"><option value="ALL">Todas las categorías</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="mt-5 overflow-hidden rounded-lg border border-[#d9e8e5] bg-white">
        {visible.map((file, index) => <article key={file.id} className={`grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_190px_auto] lg:items-center ${index ? "border-t border-[#e1ebe9]" : ""}`}>
          <div className="flex min-w-0 items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#e8f7f5] text-[#008f87]"><FileIcon contentType={file.contentType} fileName={file.fileName} /></span><div className="min-w-0"><h3 className="truncate font-semibold text-[#092731]">{file.title}</h3><p className="mt-1 truncate text-sm text-[#647c84]">{file.fileName} · {formatSize(file.size)}{file.projectName ? ` · ${file.projectName}` : ""}</p>{file.description ? <p className="mt-2 line-clamp-2 text-sm text-[#536b73]">{file.description}</p> : null}</div></div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#577078]">{file.visibility === "PRIVATE" ? <><LockKeyhole className="h-4 w-4 text-[#008f87]" />Solo tú</> : <><Share2 className="h-4 w-4 text-[#008f87]" />Empresa vinculada</>}{file.userId !== userId && file.user ? <span className="ml-2 truncate font-normal">· {file.user.name || file.user.email}</span> : null}</div>
          <div className="flex flex-wrap gap-2 lg:justify-end">{canPreview(file) ? <button onClick={() => setPreview(file)} className="grid h-10 w-10 place-items-center rounded-lg border text-[#31505a] hover:bg-[#edf7f6]" title="Previsualizar"><Eye className="h-4 w-4" /></button> : null}<a href={`${apiBase}/files/${file.id}`} className="grid h-10 w-10 place-items-center rounded-lg border text-[#31505a] hover:bg-[#edf7f6]" title="Descargar"><Download className="h-4 w-4" /></a>{file.userId === userId || !userId ? <button onClick={() => remove(file)} className="grid h-10 w-10 place-items-center rounded-lg border text-[#8d4b4b] hover:bg-red-50" title="Eliminar"><Trash2 className="h-4 w-4" /></button> : null}</div>
        </article>)}
        {!visible.length ? <div className="p-12 text-center text-[#657d85]">No hay archivos en esta categoría.</div> : null}
      </div>
    </section>

    {preview ? <div className="fixed inset-0 z-[100] grid place-items-center bg-[#04171b]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><div className="min-w-0"><h3 className="truncate font-semibold">{preview.title}</h3><p className="truncate text-xs text-[#70858c]">{preview.fileName}</p></div><button onClick={() => setPreview(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cerrar</button></div><div className="relative min-h-0 flex-1 bg-[#eef3f2] p-3">{preview.contentType.startsWith("image/") ? <Image src={`${apiBase}/files/${preview.id}?inline=1`} alt={preview.title} fill unoptimized className="object-contain p-3" /> : preview.contentType === "application/pdf" ? <object data={`${apiBase}/files/${preview.id}?inline=1`} type="application/pdf" className="h-full w-full rounded-md bg-white"><div className="grid h-full place-items-center p-8 text-center"><div><FileText className="mx-auto h-12 w-12 text-primary" /><p className="mt-4 font-semibold">Tu navegador no pudo mostrar este PDF dentro del portal.</p><a href={`${apiBase}/files/${preview.id}`} className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Descargar archivo</a></div></div></object> : <div className="grid h-full place-items-center p-8 text-center"><div><FileText className="mx-auto h-12 w-12 text-primary" /><p className="mt-4 font-semibold">Este formato requiere descarga para abrirse con su aplicacion compatible.</p><a href={`${apiBase}/files/${preview.id}`} className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Descargar archivo</a></div></div>}</div></div></div> : null}
  </div>;
}
