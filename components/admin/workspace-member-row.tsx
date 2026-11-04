"use client";
import { useRef, useState } from "react";
import type { WorkspaceMemberView } from "./workspace-members";
import styles from "./workspace-members.module.css";

export function WorkspaceMemberRow({ member, workspaceId, labels, onSaved }: { member: WorkspaceMemberView; workspaceId: string; labels: Record<string, string>; onSaved: (member: WorkspaceMemberView) => void }) {
  const [current, setCurrent] = useState(member);
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.active);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/terraqo/workspace-members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, memberId: member.id, role, active, expectedUpdatedAt: current.updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar. Vuelve a intentarlo.");
      const updated = { ...current, role: result.role, active: result.active, updatedAt: result.updatedAt };
      setCurrent(updated); onSaved(updated);
      setSaved(true); setEditing(false);
      // Self-demotion/suspension must discard the previously authorized page immediately.
      if (member.isSelf && (result.role !== member.role || !result.active)) window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sin conexión. Vuelve a intentarlo."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div>
    <div className={styles.row}>
      <span className={styles.avatar} aria-hidden="true">{(member.name || member.email || "?").slice(0, 2).toUpperCase()}</span>
      <div className={styles.person}><strong>{member.name || "Miembro del workspace"}</strong><small>{member.email}</small><div className={styles.meta}><span>{labels[current.role] || current.role}</span><span className={styles.badge}>{current.active ? "Activo" : "Suspendido"}</span></div></div>
      {!!member.allowedRoles?.length && <button disabled={busy} aria-expanded={editing} aria-controls={`access-${member.id}`} onClick={() => { setRole(current.role); setActive(current.active); setError(""); setSaved(false); setEditing(value => !value); }}>Gestionar acceso</button>}
    </div>
    {editing && <form id={`access-${member.id}`} className={styles.confirm} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className={styles.toolbar}><label>Rol de {member.name || member.email}<select value={role} disabled={busy} onChange={event => setRole(event.target.value)}>{member.allowedRoles?.map(value => <option key={value} value={value}>{labels[value] || value}</option>)}</select></label>
      <label>Estado del acceso<select value={String(active)} disabled={busy} onChange={event => setActive(event.target.value === "true")}><option value="true">Activo</option><option value="false">Suspendido</option></select></label></div>
      <p>{active ? "El cambio se aplica al confirmar. Los permisos se comprobarán de nuevo al guardar." : "Se suspenderá el acceso a este workspace. Se conservarán su cuenta, perfil e historial de trabajo."}{member.isSelf ? " Estás modificando tu propio acceso; la página se recargará después del cambio." : ""}</p>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy || (role === current.role && active === current.active)}>{busy ? "Guardando…" : "Confirmar cambio"}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancelar cambio</button></div>
    </form>}
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {saved && <p role="status" className={styles.notice}>Acceso actualizado.</p>}
  </div>;
}
