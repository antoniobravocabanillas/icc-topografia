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

export function cvPublicationEntryHref(flag: string | undefined, memberships: ReadonlyArray<{
  role: string; workspace: { slug: string; modules: ReadonlyArray<{ code: string }> };
}>, document: string): string | null {
  if (!webCvEntryEnabled(flag)) return null;
  // Callers supply only their own active memberships from the server context.
  // The destination repeats live authorization under locks; this is navigation.
  const membership = memberships.find(member => member.role === "PROFESSIONAL" &&
    member.workspace.modules.some(module => module.code === "PROFESSIONAL_NETWORK") &&
    parseCvEntryQuery({ workspaceSlug: member.workspace.slug, document }));
  if (!membership) return null;
  return `/cuenta/publicacion-cv?${new URLSearchParams({ workspaceSlug: membership.workspace.slug, document })}`;
}
