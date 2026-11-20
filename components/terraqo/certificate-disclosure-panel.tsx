"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { certificateDisclosureFields, certificateDisclosureLabels, type CertificateDisclosureField } from "@/lib/terraqo/certificate-disclosure-fields";
import { CertificateDisclosureFields } from "./certificate-disclosure-fields";
import styles from "./certificate-disclosure.module.css";

type Fields = Record<string, string | readonly string[] | null | undefined>;
type Item = { id: string; digest: string; destination: "PUBLIC" | "INVITED"; recipientEmail: string | null;
  expiresAt: string | null; fields: string[]; projected: Fields; workspaceApproved: boolean; professionalApproved: boolean;
  status: "PENDING" | "ACTIVE" | "REVOKED" | "EXPIRED"; canApprove: boolean; canRevoke: boolean; createdAt: string };
type Listing = { certificateId: string | null; items: Item[] };
const statusLabels = { PENDING: "Esperando autorizaciones", ACTIVE: "Disponible", REVOKED: "Acceso revocado", EXPIRED: "Enlace vencido" };
export function CertificateDisclosurePanel({ collaborationId, mode, certificate }: {
  collaborationId: string; mode: "workspace" | "professional"; certificate: Fields;
}) {
  const [listing, setListing] = useState<Listing | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<CertificateDisclosureField[]>(["scope", "contribution", "result"]);
  const [destination, setDestination] = useState<"PUBLIC" | "INVITED">("PUBLIC");
  const [email, setEmail] = useState(""), [expires, setExpires] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>()), working = useRef(false), sequence = useRef(0);
  const base = `/api/v1/collaborations/${encodeURIComponent(collaborationId)}/certificate-disclosures`;
  const query = `?view=${mode}`;
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const response = await fetch(base + query, { cache: "no-store" });
      const body = await response.json();
      if (current !== sequence.current) return;
      if (!response.ok) { setListing(null); throw new Error(body.error?.message || "No se pudieron consultar las autorizaciones."); }
      setListing(body.data); setError("");
    } catch (e) { if (current === sequence.current) { setListing(null); setError(e instanceof Error ? e.message : "Revisa tu conexión y vuelve a intentar."); } }
  }, [base, query]);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden && !working.current) void load(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 15000);
    return () => { invalidate(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load, invalidate]);
  async function mutate(path: string, payload: object, success: string) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setNotice("");
    const signature = JSON.stringify([path, payload]);
    let key = keys.current.get(signature); if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key); }
    try {
      const response = await fetch(path + query, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "No se pudo guardar. Actualiza y vuelve a intentar.");
      keys.current.delete(signature); setRevoking(null); setNotice(success); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "La respuesta no se confirmó. Reintenta la misma acción."); }
    finally { working.current = false; setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (destination === "INVITED" && (!expires || !Number.isFinite(new Date(expires).getTime()))) { setError("Indica una fecha de vencimiento válida."); return; }
    await mutate(base, { destination, fields: selected, ...(destination === "INVITED" ? { recipientEmail: email.trim(), expiresAt: new Date(expires).toISOString() } : {}) }, "Selección preparada. Empresa y profesional deben autorizarla por separado.");
  }
  const preview = Object.fromEntries(selected.map(field => [field, certificate[field]]));
  return <section className={styles.panel} aria-label="Compartir constancia" aria-busy={busy}>
    <header><h2>Compartir constancia</h2><p>Elige qué mostrar y a quién. El enlace se habilita cuando ambas partes autorizan la misma selección.</p></header>
    {error && <div role="alert" className={styles.error}>{error} <button type="button" disabled={busy} onClick={() => void load()}>Actualizar autorizaciones</button></div>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!listing && !error && <p role="status">Consultando autorizaciones…</p>}
    {listing && !listing.certificateId && <p>Esta constancia anterior no tiene un alcance vinculado que permita compartirla.</p>}
    {listing?.certificateId && <>
      <details className={styles.newSelection} open={listing.items.length === 0}>
      <summary>{listing.items.length ? "Preparar otra selección" : "Preparar una selección"}</summary>
      <form onSubmit={create} className={styles.editor}>
        <fieldset disabled={busy}><legend>1. Contenido visible</legend><div className={styles.choices}>{certificateDisclosureFields.map(field =>
          <label className={styles.choice} key={field}><input type="checkbox" checked={selected.includes(field)} onChange={event => setSelected(current => event.target.checked ? [...current, field] : current.filter(f => f !== field))} />{certificateDisclosureLabels[field]}</label>)}</div>
          <label><span id={`disclosure-destination-${collaborationId}`}>2. Destino</span><select aria-labelledby={`disclosure-destination-${collaborationId}`} value={destination} onChange={e => setDestination(e.target.value as "PUBLIC" | "INVITED")}><option value="PUBLIC">Enlace público</option><option value="INVITED">Solo una persona invitada</option></select></label>
          <p>{destination === "PUBLIC" ? "Cualquier persona con el enlace podrá ver únicamente esta selección una vez autorizada." : "La persona debe iniciar sesión con este correo verificado. No se envía un correo automáticamente."}</p>
          {destination === "INVITED" && <div className={styles.inputs}><label>Correo del destinatario<input type="email" required maxLength={254} autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Vence (hora de este dispositivo)<input type="datetime-local" required value={expires} onChange={e => setExpires(e.target.value)} /></label></div>}
        </fieldset>
        <section className={styles.preview} aria-label="Vista previa de la selección"><h3>Esto es lo que se compartirá</h3>{selected.length ? <CertificateDisclosureFields fields={preview} /> : <p>Selecciona al menos un campo.</p>}<p className={styles.note}>No incluye archivos, evidencias adjuntas ni información omitida.</p></section>
        <button type="submit" disabled={busy || !selected.length}>Preparar selección para autorizar</button>
      </form>
      </details>
      <div className={styles.history}><h3>Selecciones y autorizaciones</h3>{!listing.items.length && <p>Todavía no se ha preparado ninguna selección. Tu constancia continúa privada.</p>}
        {listing.items.map(item => <article key={item.id} className={styles.item} data-disclosure-id={item.id}>
          <header><h4>{item.destination === "PUBLIC" ? "Enlace público" : "Acceso por invitación"}</h4><strong className={styles.status} data-state={item.status}>{statusLabels[item.status]}</strong></header>
          {item.recipientEmail && <p>Destinatario: {item.recipientEmail}</p>}
          {item.expiresAt && <p>Vence: {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(item.expiresAt))} · Perú</p>}
          <div className={styles.approvals}><span>Empresa · {item.workspaceApproved ? "Autorizado" : "Pendiente"}</span><span>Profesional · {item.professionalApproved ? "Autorizado" : "Pendiente"}</span></div>
          <CertificateDisclosureFields fields={item.projected} />
          <div className={styles.actions}>
            {item.canApprove && <button disabled={busy} type="button" onClick={() => void mutate(`${base}/${item.id}/decision`, { action: "APPROVE", expectedDigest: item.digest }, "Tu autorización quedó registrada para esta selección exacta.")}>{mode === "workspace" ? "Autorizar como empresa" : "Autorizar como profesional"}</button>}
            {item.status === "ACTIVE" && <button type="button" disabled={busy} onClick={() => { void navigator.clipboard.writeText(`${location.origin}/constancias/${encodeURIComponent(item.id)}`).then(() => setNotice("Enlace copiado."), () => setError("No se pudo copiar el enlace. Usa Abrir enlace.")); }}>Copiar enlace</button>}
            {item.status === "ACTIVE" && <a href={`/constancias/${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer">Abrir enlace</a>}
            {item.canRevoke && revoking !== item.id && <button type="button" className={styles.revoke} disabled={busy} onClick={() => setRevoking(item.id)}>Revocar acceso</button>}
          </div>
          {item.canRevoke && revoking === item.id && <div className={styles.confirm} role="group" aria-label="Confirmar revocación"><p>El enlace dejará de permitir el acceso. Esto no recupera copias que ya se hayan descargado. Para volver a compartir necesitarás una nueva selección.</p><div className={styles.actions}><button type="button" disabled={busy} onClick={() => void mutate(`${base}/${item.id}/decision`, { action: "REVOKE", expectedDigest: item.digest }, "Acceso revocado. Este enlace ya no permite consultar la constancia.")}>Confirmar revocación</button><button type="button" className={styles.revoke} disabled={busy} onClick={() => setRevoking(null)}>Cancelar</button></div></div>}
          <p className={styles.note}>Cambiar campos, destinatario o vencimiento requiere una nueva selección y nuevas autorizaciones.</p>
        </article>)}
      </div>
    </>}
  </section>;
}
