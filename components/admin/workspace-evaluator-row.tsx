"use client";

import { useRef, useState } from "react";
import styles from "./workspace-members.module.css";

export type WorkspaceEvaluatorView = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  active: boolean;
  canReadEvaluations: boolean;
  updatedAt: string;
  dossierIds: string[];
};
export type WorkspaceDossierView = { id: string; title: string };
type EvaluatorList = { evaluators: WorkspaceEvaluatorView[]; dossiers: WorkspaceDossierView[] };

export function WorkspaceEvaluatorRow({ evaluator, workspaceId, dossiers, onRefreshed }: {
  evaluator: WorkspaceEvaluatorView;
  workspaceId: string;
  dossiers: WorkspaceDossierView[];
  onRefreshed: (data: EvaluatorList) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(evaluator.active);
  const [canReadEvaluations, setCanReadEvaluations] = useState(evaluator.canReadEvaluations);
  const [dossierIds, setDossierIds] = useState(evaluator.dossierIds);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(evaluator.updatedAt);
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const identity = evaluator.name || evaluator.email || "Evaluador";

  async function refresh() {
    const response = await fetch(`/api/terraqo/workspace-evaluators?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("No pudimos actualizar los accesos. Recarga la lista antes de continuar.");
    const data: EvaluatorList = await response.json();
    onRefreshed(data);
    setRefreshRequired(false);
  }

  async function save(refreshOnly = false) {
    if (lock.current || (!refreshOnly && refreshRequired)) return;
    lock.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      if (refreshOnly) { await refresh(); setMessage("Lista actualizada. Revisa los permisos antes de editar."); return; }
      const response = await fetch("/api/terraqo/workspace-evaluators", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        // Version belongs to the last authoritative GET, never the draft or a local clock.
        body: JSON.stringify({ workspaceId, evaluatorId: evaluator.id, active, canReadEvaluations, dossierIds, expectedUpdatedAt }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          setRefreshRequired(true); setEditing(false);
          await refresh();
          setError("El acceso cambió mientras lo editabas. La lista está actualizada; revisa los permisos y vuelve a editar.");
          return;
        }
        const result = await response.json();
        throw new Error(result.error || "No se pudo guardar. Vuelve a intentarlo.");
      }
      // PATCH returns {saved:true}. Do not fabricate a new timestamp or reuse the old one.
      setRefreshRequired(true); setEditing(false);
      await refresh();
      setMessage("Acceso de evaluador actualizado.");
    } catch (cause) {
      // A transport failure can occur after the mutation commits. Require a fresh snapshot.
      setRefreshRequired(true); setEditing(false);
      setError(cause instanceof Error ? cause.message : "Sin conexión. Recarga los accesos para comprobar el estado del cambio.");
    } finally { lock.current = false; setBusy(false); }
  }

  const changed = active !== evaluator.active || canReadEvaluations !== evaluator.canReadEvaluations || dossierIds.length !== evaluator.dossierIds.length || dossierIds.some(id => !evaluator.dossierIds.includes(id));
  return <div aria-busy={busy}>
    <div className={styles.row}>
      <span className={`${styles.avatar} ${styles.evaluatorAvatar}`} aria-hidden="true">{identity.slice(0, 2).toUpperCase()}</span>
      <div className={styles.person}><strong>{identity}</strong>{evaluator.name && <small>{evaluator.email}</small>}
        <div className={styles.meta}><span>Evaluador</span><span className={styles.badge}>{evaluator.active ? "Activo" : "Suspendido"}</span><span>{evaluator.canReadEvaluations ? (evaluator.dossierIds.length === 1 ? "1 expediente autorizado" : `${evaluator.dossierIds.length} expedientes autorizados`) : "Lectura desactivada"}</span></div>
      </div>
      <button type="button" disabled={busy || refreshRequired} aria-expanded={editing} aria-controls={`evaluator-${evaluator.id}`} onClick={() => {
        setActive(evaluator.active); setCanReadEvaluations(evaluator.canReadEvaluations); setDossierIds(evaluator.dossierIds);
        // Freeze the version for this draft even when another row refreshes the parent list.
        setExpectedUpdatedAt(evaluator.updatedAt);
        setError(""); setMessage(""); setEditing(value => !value);
      }}>Gestionar evaluador<span className={styles.srOnly}>: {identity}</span></button>
    </div>
    {editing && <form id={`evaluator-${evaluator.id}`} className={styles.confirm} onSubmit={event => { event.preventDefault(); void save(); }} aria-label={`Acceso de ${identity}`}>
      <fieldset className={styles.permissions} disabled={busy}><legend>Permisos de {identity}</legend>
        <label className={styles.check}><span>Acceso activo</span><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /></label>
        <label className={styles.check}><span>Ver evaluaciones autorizadas</span><input type="checkbox" checked={canReadEvaluations} onChange={event => setCanReadEvaluations(event.target.checked)} /></label>
      </fieldset>
      <fieldset className={`${styles.permissions} ${styles.dossierSelection}`} disabled={busy}><legend>Expedientes autorizados</legend>
        <p>Selecciona cada expediente de forma explícita. Sin selección, no se comparte ninguna evaluación.</p>
        {dossiers.map(dossier => <label className={styles.check} key={dossier.id}><span>{dossier.title}</span><input type="checkbox" checked={dossierIds.includes(dossier.id)} onChange={event => setDossierIds(previous => event.target.checked ? [...previous, dossier.id] : previous.filter(id => id !== dossier.id))} /></label>)}
        {!dossiers.length && <p className={styles.empty}>No hay expedientes disponibles para asignar.</p>}
        {evaluator.dossierIds.some(id => !dossiers.some(dossier => dossier.id === id)) && <p>Hay asignaciones que ya no están disponibles. Puedes conservarlas o <button type="button" onClick={() => setDossierIds(previous => previous.filter(id => dossiers.some(dossier => dossier.id === id)))}>Quitar asignaciones no disponibles</button>.</p>}
      </fieldset>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy || !changed}>{busy ? "Guardando…" : "Guardar acceso de evaluador"}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancelar edición</button></div>
    </form>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {refreshRequired && <button type="button" disabled={busy} onClick={() => void save(true)}>Recargar accesos</button>}
  </div>;
}
