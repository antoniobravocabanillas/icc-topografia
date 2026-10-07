export type CvEntryQuery = Record<string, string | string[] | undefined>;

/** The document marker separates native history entries. It carries no identity
 * or permission; the owner is always resolved from the authenticated session. */
export function parseCvEntryQuery(query: CvEntryQuery): { workspaceSlug: string } | null {
  if (Object.keys(query).some(key => key !== "workspaceSlug" && key !== "document")) return null;
  const slug = query.workspaceSlug;
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return null;
  if (query.document !== undefined && (typeof query.document !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(query.document))) return null;
  return { workspaceSlug: slug };
}

export function webCvEntryEnabled(value: string | undefined): boolean {
  return value === "true";
}
