/** Navigation operates only on the already-authorized public records supplied by the server. */
export type ActivityNavigationRecord = {
  id: string; title: string; summary: string; outcome: string | null;
  type: string; evidenceStatus: string; occurredAt: string; skills: string[];
  project: { title: string; clientName: string | null } | null;
  workspace: string | null; validations: unknown[];
};
export const ACTIVITY_PAGE_SIZE = 8;
export function activityDay(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}
export function normalizeActivityText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}
export function hasActivityReview(record: ActivityNavigationRecord) {
  return record.validations.length > 0 || record.evidenceStatus === "VERIFIED";
}
export type ActivityNavigation = {
  query: string; type: string; review: string; project: string; date: string;
  month: string; view: "list" | "calendar"; page: number; selectedId: string;
};
export function filterActivity<T extends ActivityNavigationRecord>(records: T[], state: ActivityNavigation, ignoreDate = false): T[] {
  const query = normalizeActivityText(state.query);
  return records.filter(record =>
    (state.type === "all" || record.type === state.type) &&
    (state.review === "all" || (state.review === "reviewed" ? hasActivityReview(record) : !hasActivityReview(record))) &&
    (state.project === "all" || record.project?.title === state.project) &&
    (ignoreDate || !state.date || activityDay(record.occurredAt) === state.date) &&
    (!query || normalizeActivityText([record.title, record.summary, record.outcome, record.project?.title, record.project?.clientName, record.workspace, ...record.skills].filter(Boolean).join(" ")).includes(query))
  );
}
export function readActivityNavigation(url: URL, records: ActivityNavigationRecord[]): ActivityNavigation {
  const p = url.searchParams;
  const types = new Set(records.map(record => record.type));
  const projects = new Set(records.flatMap(record => record.project ? [record.project.title] : []));
  const rawDate = p.get("fecha") || "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate+"T12:00:00Z")) && new Date(rawDate+"T12:00:00Z").toISOString().startsWith(rawDate);
  const rawMonth = p.get("mes") || "";
  let hash = "";
  try { hash = decodeURIComponent(url.hash.slice(1)); } catch { /* Malformed legacy hash: leave selection empty. */ }
  const selectedId = p.get("registro") || hash;
  const requested = records.find(record => record.id === selectedId);
  return {
    query: p.get("buscar") || "", type: types.has(p.get("tipo") || "") ? p.get("tipo")! : "all",
    review: ["reviewed", "declared"].includes(p.get("revision") || "") ? p.get("revision")! : "all",
    project: projects.has(p.get("proyecto") || "") ? p.get("proyecto")! : "all",
    date: validDate ? rawDate : "", month: /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : activityDay(requested?.occurredAt || records[0]?.occurredAt || new Date().toISOString()).slice(0,7),
    view: p.get("vista") === "calendar" ? "calendar" : "list",
    page: Math.max(1, Math.min(Number.parseInt(p.get("pagina") || "1",10) || 1, Math.max(1, Math.ceil(records.length / ACTIVITY_PAGE_SIZE)))),
    selectedId: selectedId || records[0]?.id || ""
  };
}
export function activityNavigationUrl(url: URL, state: ActivityNavigation) {
  const next = new URL(url);
  const entries = {buscar:state.query,tipo:state.type,revision:state.review,proyecto:state.project,fecha:state.date,mes:state.month,vista:state.view,pagina:String(state.page),registro:state.selectedId};
  for(const [key,value] of Object.entries(entries)) {
    if(!value || value === "all" || (key === "vista" && value === "list") || (key === "pagina" && value === "1")) next.searchParams.delete(key);
    else next.searchParams.set(key,value);
  }
  next.hash = "";
  return next;
}
