import { Eye, FileLock2, ShieldCheck } from "lucide-react";
import styles from "./assigned-evaluations.module.css";

export type AssignedEvaluationView = {
  id: string;
  title: string;
  workspaceName: string;
  criteria: string[];
  sources: { id: string; title?: string; summary?: string; outcome?: string }[];
};

export function AssignedEvaluations({ evaluations }: { evaluations: AssignedEvaluationView[] }) {
  return <section className={styles.surface} aria-labelledby="evaluations-heading">
    <header className={styles.header}>
      <h1 id="evaluations-heading">Evaluaciones autorizadas</h1>
      <p>Consulta los expedientes que cada empresa ha compartido contigo.</p>
      <span className={styles.readOnly}><Eye size={16} aria-hidden="true" /> Solo lectura</span>
    </header>
    <div className={styles.scope}><ShieldCheck size={20} aria-hidden="true" /><p>Tu acceso se limita a estas evaluaciones y sus evidencias autorizadas. Los documentos internos generales no están disponibles.</p></div>
    {evaluations.length ? <div className={styles.list}>{evaluations.map(evaluation => <article key={evaluation.id} className={styles.evaluation} aria-labelledby={`evaluation-${evaluation.id}`}>
      <header><h2 id={`evaluation-${evaluation.id}`}>{evaluation.title}</h2><p>{evaluation.workspaceName}</p></header>
      <div className={styles.details}>
        <section aria-label={`Criterios de ${evaluation.title}`}><h3>Criterios de evaluación</h3>
          {evaluation.criteria.length ? <ul>{evaluation.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul> : <p>Este expediente no tiene criterios publicados.</p>}
        </section>
        <section aria-label={`Evidencias de ${evaluation.title}`}><h3>Evidencias autorizadas</h3>
          {evaluation.sources.length ? <ul>{evaluation.sources.map(source => <li key={source.id}>
            <strong>{source.title || "Evidencia autorizada"}</strong>
            {source.summary && <p>{source.summary}</p>}
            {source.outcome && <p><strong>Resultado</strong> · {source.outcome}</p>}
          </li>)}</ul> : <p>No hay evidencias autorizadas para mostrar.</p>}
        </section>
      </div>
    </article>)}</div> : <div className={styles.empty}><FileLock2 size={28} aria-hidden="true" /><h2>Aún no tienes evaluaciones disponibles</h2><p>El administrador del workspace debe activar tu acceso, habilitar la lectura y asignarte expedientes. Si ya aceptaste una invitación, solicita que revise estos permisos.</p></div>}
  </section>;
}
