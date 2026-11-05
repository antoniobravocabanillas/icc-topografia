"use client";

import { useRef, useState } from "react";
import { Copy, Eye, FileLock2, Plus, ShieldCheck } from "lucide-react";
import styles from "./workspace-members.module.css";
import { WorkspaceMemberRow } from "./workspace-member-row";
import { WorkspaceEvaluatorRow, type WorkspaceEvaluatorView, type WorkspaceDossierView } from "./workspace-evaluator-row";

export type WorkspaceMemberView = { id: string; name: string | null; email: string | null; role: string; active: boolean; updatedAt?: string; allowedRoles?: string[]; isSelf?: boolean };
export type WorkspaceInvitationView = { id: string; email: string; role: string; status: string; expiresAt: string; resendCount: number };
const roles: Record<string, string> = { OWNER: "Propietario", ADMIN: "Administrador", MANAGER: "Gestor", VIEWER: "Lector", MEMBER: "Miembro", PROFESSIONAL: "Profesional", CLIENT: "Cliente", EVALUATOR: "Evaluador" };

export function WorkspaceMembers({ workspaceId, name, members: initialMembers, invitations: initialInvitations, evaluatorsEnabled = false, evaluators: initialEvaluators = [], dossiers: initialDossiers = [] }: { workspaceId: string; name: string; members: WorkspaceMemberView[]; invitations: WorkspaceInvitationView[]; evaluatorsEnabled?: boolean; evaluators?: WorkspaceEvaluatorView[]; dossiers?: WorkspaceDossierView[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VIEWER");
  const [canReadEvaluations, setCanReadEvaluations] = useState(false);
  const [evaluators, setEvaluators] = useState(initialEvaluators);
  const [dossiers, setDossiers] = useState(initialDossiers);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const operation = useRef<{ signature: string; key: string } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [confirmation, setConfirmation] = useState<{ id: string; action: "cancel" | "rotate" } | null>(null);

  async function mutate(action: "create" | "cancel" | "rotate", invite?: WorkspaceInvitationView) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(""); setMessage(""); setLink("");
    try {
      // Keep the operation key after transport failure: retry must not create twice.
      const evaluator = evaluatorsEnabled && role === "EVALUATOR";
      const signature = JSON.stringify([workspaceId, email.trim().toLowerCase(), role, ...(evaluator ? [canReadEvaluations] : [])]);
      if (!operation.current || operation.current.signature !== signature) operation.current = { signature, key: crypto.randomUUID() };
      const payload = action === "create"
        ? { action, workspaceId, email, role, operationKey: operation.current.key, ...(evaluator ? { canReadEvaluations } : {}) }
        : { action, workspaceId, invitationId: invite?.id, expectedResendCount: action === "rotate" ? invite?.resendCount : undefined };
      const response = await fetch("/api/terraqo/workspace-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar. Vuelve a intentarlo.");
      if (result.token) setLink(`${window.location.origin}/invitacion-workspace#${result.token}`);
      if (action === "cancel") setMessage("Invitación cancelada. El enlace ya no permite ingresar.");
      else if (result.replayed) setMessage("La invitación ya se creó. No se volvió a enviar el correo. Renueva el enlace si necesitas compartirlo.");
      else if (result.delivery === "accepted") setMessage("El proveedor aceptó el correo de invitación. También puedes copiar el enlace.");
      else if (result.delivery === "disabled") setMessage("El envío de correo está desactivado. Copia el enlace y compártelo con la persona invitada.");
      else if (result.delivery === "unavailable") setMessage("El envío de correo no está disponible. Copia el enlace y compártelo con la persona invitada.");
      else setMessage("La invitación está guardada. No pudimos confirmar el envío del correo. Puedes compartir el enlace.");
      setConfirmation(null);
      if (action === "create") { operation.current = null; setEmail(""); }
      const refresh = await fetch(`/api/terraqo/workspace-invitations?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
      if (!refresh.ok) throw new Error("El cambio se guardó, pero no pudimos actualizar la lista. Recarga la página.");
      setInvitations((await refresh.json()).invitations);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo conectar. Vuelve a intentarlo."); }
    finally { lock.current = false; setBusy(false); }
  }
  const matches = (text: string) => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  return <section className={styles.surface} aria-busy={busy}>
    <header className={styles.header}><h1>Equipo del workspace</h1><p>Gestiona quién puede acceder a {name}. Revisa los miembros y prepara nuevas invitaciones.</p></header>
    <div className={styles.grid}>
      <div className={styles.list}>
        <div className={styles.toolbar}><h2>Miembros ({members.length})</h2><input aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" value={query} onChange={event => setQuery(event.target.value)} /></div>
        {members.filter(member => matches(`${member.name || ""} ${member.email || ""}`)).map(member => <WorkspaceMemberRow key={member.id} member={member} workspaceId={workspaceId} labels={roles} onSaved={updated => setMembers(previous => previous.map(item => item.id === updated.id ? updated : item))} />)}
        {!members.some(member => matches(`${member.name || ""} ${member.email || ""}`)) && <p className={styles.empty}>No hay miembros que coincidan con tu búsqueda.</p>}
        {evaluatorsEnabled && <section className={styles.section} aria-labelledby="evaluators-heading">
          <h2 id="evaluators-heading">Evaluadores ({evaluators.length})</h2>
          <p>Asigna los expedientes que cada persona puede consultar.</p>
          {evaluators.filter(evaluator => matches(`${evaluator.name || ""} ${evaluator.email || ""}`)).map(evaluator => <WorkspaceEvaluatorRow key={evaluator.id} evaluator={evaluator} workspaceId={workspaceId} dossiers={dossiers} onRefreshed={data => { setEvaluators(data.evaluators); setDossiers(data.dossiers); }} />)}
          {!evaluators.some(evaluator => matches(`${evaluator.name || ""} ${evaluator.email || ""}`)) && <p className={styles.empty}>{evaluators.length ? "No hay evaluadores que coincidan con tu búsqueda." : "Aún no hay evaluadores. Invita a una persona con el rol Evaluador y, cuando acepte, selecciona sus expedientes aquí."}</p>}
        </section>}
        <section className={styles.section} aria-labelledby="invitations-heading"><h2 id="invitations-heading">Invitaciones</h2><p>Las 50 más recientes. Los enlaces vencen a los 7 días.</p>
          {invitations.filter(invite => matches(invite.email)).map(invite => {
            const pending = invite.status === "PENDING" && new Date(invite.expiresAt).getTime() > Date.now();
            const state = invite.status === "ACCEPTED" ? "Aceptada" : invite.status === "CANCELLED" ? "Cancelada" : pending ? "Pendiente" : "Vencida";
            return <div key={invite.id}><div className={styles.row}><div className={styles.person}><strong>{invite.email}</strong><div className={styles.meta}><span>{roles[invite.role] || invite.role}</span><span className={`${styles.badge} ${pending ? styles.pending : ""}`}>{state}</span></div></div>
              {pending && <div className={styles.actions}><button disabled={busy} onClick={() => setConfirmation({ id: invite.id, action: "rotate" })}>Renovar enlace</button><button disabled={busy} onClick={() => setConfirmation({ id: invite.id, action: "cancel" })}>Cancelar</button></div>}
            </div>{confirmation?.id === invite.id && <div className={styles.confirm}><p>{confirmation.action === "cancel" ? "¿Cancelar esta invitación? La persona ya no podrá aceptar el enlace." : "El enlace anterior dejará de funcionar. El nuevo conserva el vencimiento y se enviará al correo de la invitación si el envío está disponible."}</p><div className={styles.actions}><button disabled={busy} onClick={() => void mutate(confirmation.action, invite)}>Confirmar</button><button disabled={busy} onClick={() => setConfirmation(null)}>Volver</button></div></div>}</div>;
          })}
          {!invitations.some(invite => matches(invite.email)) && <p className={styles.empty}>No hay invitaciones para mostrar.</p>}
        </section>
      </div>
      <aside className={styles.panel} aria-labelledby="invite-heading"><h2 id="invite-heading">Invitar miembro</h2><p>Al crear el enlace intentaremos enviarlo a este correo. Solo la persona invitada podrá aceptarlo con su cuenta verificada.</p>
        <form onSubmit={event => { event.preventDefault(); void mutate("create"); }}><label>Correo electrónico<input type="email" required maxLength={254} autoComplete="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="nombre@empresa.com" /></label>
          <label>Rol<select value={role} disabled={busy} onChange={event => { setRole(event.target.value); setCanReadEvaluations(false); }}>{["VIEWER", "MEMBER", "PROFESSIONAL", "CLIENT", ...(evaluatorsEnabled ? ["EVALUATOR"] : [])].map(value => <option key={value} value={value}>{roles[value]}</option>)}</select></label>
          {evaluatorsEnabled && role === "EVALUATOR" && <>
            <p className={styles.permissionNote}>El evaluador solo puede consultar las evaluaciones y evidencias autorizadas. Después de aceptar, asigna sus expedientes en la lista de evaluadores.</p>
            <fieldset className={styles.permissions}><legend>Permisos</legend>
              <label className={styles.check}><Eye size={18} aria-hidden="true" /><span>Ver evaluaciones autorizadas</span><input type="checkbox" checked={canReadEvaluations} disabled={busy} onChange={event => setCanReadEvaluations(event.target.checked)} /></label>
              <div className={styles.unavailable}><FileLock2 size={18} aria-hidden="true" /><span>Documentos internos generales<small>No disponible para evaluadores</small></span></div>
            </fieldset>
          </>}
          <p>La invitación no concede administración ni modifica un rol que la persona ya tenga.</p>
          <button className={styles.primary} disabled={busy} type="submit"><Plus size={18} aria-hidden="true" />{busy ? "Guardando…" : "Crear enlace de invitación"}</button>
        </form>
        <div role="status" aria-live="polite">{message && <div className={styles.notice}>{message}</div>}</div>
        {error && <div role="alert" className={`${styles.notice} ${styles.error}`}>{error}</div>}
        {link && <div className={styles.link}><label htmlFor="invitation-link">Enlace privado</label><input id="invitation-link" readOnly value={link} onFocus={event => event.currentTarget.select()} /><button onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("Enlace copiado. Compártelo únicamente con la persona invitada."); } catch { setError("No pudimos copiarlo. Selecciona el enlace y cópialo manualmente."); } }}><Copy size={16} aria-hidden="true" />Copiar enlace</button></div>}
        <p className={styles.notice}><ShieldCheck size={18} aria-hidden="true" /> El workspace debe conservar al menos un administrador activo.</p>
      </aside>
    </div>
  </section>;
}
