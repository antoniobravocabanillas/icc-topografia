"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowUpRight, Files, Globe2, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { SharedAccessRow, type SharedAccess } from "./shared-access-row";
import { RevokeAccessControl } from "./revoke-access-control";
import styles from "./access-inventory.module.css";

export type AccessCollection = { id: string; title: string; version: number;
  grants: (SharedAccess & { id: string })[]; publicProjection: { slug: string; revokedAt: string | null } | null };

export function AccessInventory({ collections }: { collections: AccessCollection[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(collections);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const needle = query.trim().toLocaleLowerCase("es");
  const visible = rows.filter(row => !needle || [row.title, ...row.grants.map(g => g.inviteEmail || g.recipientLabel || "Usuario Terraqo autorizado")].some(text => text.toLocaleLowerCase("es").includes(needle)));
  async function revoke(row: AccessCollection, grantId?: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setNotice(null);
    try {
      const response = await fetch(`/api/v1/share-collections/${encodeURIComponent(row.id)}/${grantId ? "grants" : "projection"}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: row.version, ...(grantId ? { grantId, reason: "Revocado por el titular" } : {}) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 409 ? "La selección cambió en otra sesión. Actualiza los accesos antes de volver a intentarlo." : "No pudimos confirmar la revocación. Actualiza los accesos para comprobar su estado.");
      const version = grantId ? payload?.data?.version : row.version + 1;
      if (!Number.isSafeInteger(version) || version <= row.version || (!grantId && payload?.data?.revoked !== true)) throw new Error("No pudimos confirmar el estado actualizado. Actualiza los accesos.");
      const revokedAt = new Date().toISOString();
      setRows(current => current.map(item => item.id !== row.id ? item : { ...item, version,
        grants: grantId ? item.grants.map(g => g.id === grantId ? { ...g, lifecycle: "REVOKED", revokedAt } : g) : item.grants,
        publicProjection: !grantId && item.publicProjection ? { ...item.publicProjection, revokedAt } : item.publicProjection }));
      setNotice({ error: false, text: grantId ? "Acceso revocado. Ya no admite nuevas lecturas." : "Publicación retirada. El enlace público ya no admite nuevas lecturas." });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "No se pudo confirmar la operación." }); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className={styles.surface}>
    <header className={styles.heading}><div><h1>Accesos y permisos</h1><p>Revisa con quién compartes tus selecciones y hasta cuándo.</p></div>
      <Link className={styles.primary} href="/portal/selecciones">Compartir una selección <ArrowUpRight size={17} aria-hidden="true" /></Link></header>
    <nav className={styles.tabs} aria-label="Privacidad y cuenta"><Link href="/portal/accesos" aria-current="page">Accesos compartidos</Link><Link href="/portal/documentos">Documentos privados</Link><Link href="/portal/membresia">Mi plan y uso</Link></nav>
    <div className={styles.layout}><section className={styles.inventory} aria-label="Accesos que has compartido">
      <div className={styles.sectionHeading}><h2>Accesos que has compartido</h2><span>{rows.length} selecciones</span></div>
      <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar selección o destinatario</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar accesos" type="search" /></label>
      {notice && <div role={notice.error ? "alert" : "status"} className={styles.notice}><p>{notice.text}</p>{notice.error && <button type="button" disabled={pending} onClick={() => router.refresh()}>Actualizar accesos</button>}</div>}
      {!visible.length && <div className={styles.empty}><ShieldCheck size={28} aria-hidden="true" /><h3>{rows.length ? "No hay coincidencias" : "Tus selecciones siguen bajo tu control"}</h3><p>{rows.length ? "Busca por el título de la selección o el correo del destinatario." : "Cuando compartas una selección, aquí podrás revisar y retirar sus accesos. Tus documentos privados no se incluyen."}</p>{rows.length > 0 && <button type="button" onClick={() => setQuery("")}>Limpiar búsqueda</button>}</div>}
      {visible.map(row => <article key={row.id} className={styles.collection} aria-label={row.title}>
        <h3>{row.title}</h3>
        {row.grants.map(grant => <SharedAccessRow key={grant.id} grant={grant} tone="dark"><RevokeAccessControl tone="dark" label="Revocar acceso" subject={grant.inviteEmail || grant.recipientLabel || "Usuario Terraqo autorizado"} pending={pending} onConfirm={() => void revoke(row, grant.id)} /></SharedAccessRow>)}
        {row.publicProjection && <div className={styles.publicAccess}><div><p><Globe2 size={17} aria-hidden="true" /> Enlace público</p><small>{row.publicProjection.revokedAt ? "Publicación retirada" : "Campos publicados accesibles mediante el enlace. Los archivos conservan sus permisos."}</small></div>{!row.publicProjection.revokedAt && <RevokeAccessControl tone="dark" label="Retirar publicación" subject={`enlace público de ${row.title}`} pending={pending} onConfirm={() => void revoke(row)} />}</div>}
        {!row.grants.length && !row.publicProjection && <p className={styles.private}>Sin accesos concedidos. Esta selección es privada.</p>}
      </article>)}
    </section><aside className={styles.aside} aria-label="Documentos y plan">
      <section><SlidersHorizontal size={23} aria-hidden="true" /><h2>Plan y funciones</h2><p>Consulta tu membresía, las funciones disponibles y su uso.</p><Link href="/portal/membresia">Ver mi plan <ArrowUpRight size={16} aria-hidden="true" /></Link><small>El plan de una empresa se gestiona desde su administración, con los permisos correspondientes.</small></section>
      <section><Files size={23} aria-hidden="true" /><h2>Documentos privados</h2><p>Tu carpeta personal y sus estados de revisión se consultan por separado. No se publican al compartir una selección.</p><Link href="/portal/documentos">Abrir documentos <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
      <p className={styles.footnote}>Revocar impide nuevas lecturas; no recupera copias que ya se hayan descargado.</p>
    </aside></div>
  </div>;
}
