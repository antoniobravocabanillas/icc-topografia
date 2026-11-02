export const archiveFilterKeys = [
  "q",
  "type",
  "state",
  "projectId",
  "from",
  "to",
] as const;
export type PublicArchiveFilters = Record<
  (typeof archiveFilterKeys)[number],
  string
>;
export function readPublicArchiveFilters(search: string): PublicArchiveFilters {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    archiveFilterKeys.map((key) => [
      key,
      (params.get(key) || "").slice(0, key === "q" ? 120 : 64),
    ]),
  ) as PublicArchiveFilters;
}
export function publicArchiveQuery(filters: PublicArchiveFilters) {
  const params = new URLSearchParams();
  for (const key of archiveFilterKeys)
    if (filters[key]) params.set(key, filters[key]);
  return params.toString();
}
export function publicArchiveApiQuery(
  filters: PublicArchiveFilters,
  cursor?: string | null,
) {
  const params = new URLSearchParams(publicArchiveQuery(filters));
  params.set("audience", "public");
  params.set("timezone", "America/Lima");
  params.set("period", "all");
  params.set("limit", "20");
  if (cursor) params.set("cursor", cursor);
  return params;
}
export function publicArchivePath(
  username: string,
  filters: PublicArchiveFilters,
) {
  const query = publicArchiveQuery(filters);
  return `/cv/${encodeURIComponent(username)}/evidencias${query ? `?${query}` : ""}`;
}
