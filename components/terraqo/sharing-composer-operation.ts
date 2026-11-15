// This operation lives only in memory. Never persist recipients or invitation tokens.
export type SharingDestination = "private" | "public" | "invited";
export type ComposerOperation = {
  key: string;
  body: string;
  destination: SharingDestination;
  recipient: string;
  expiresAt: string;
  grantKey: string;
  download?: boolean;
  listOnCv?: boolean;
  workCase?: { id: string; version: number };
  collection?: { id: string; version: number };
  projectionAttempted?: boolean;
  requestReview?: boolean;
  reviewRequested?: boolean;
};

export async function sharingRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "No se pudo confirmar la operación. Reintenta para comprobar su estado.");
  if (!payload || payload.data === undefined) throw new Error("El servidor no devolvió una confirmación válida. Reintenta la misma operación.");
  return payload.data as T;
}

export async function completeComposerOperation(operation: ComposerOperation): Promise<{ text: string; path: string; awaitingReview?: boolean }> {
  const post = (body: string, key?: string): RequestInit => ({
    method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body,
  });
  if (!operation.collection) {
    const collection = await sharingRequest<{ id: string; version: number }>("/api/v1/share-collections", post(operation.body, operation.key));
    if (!collection.id || !Number.isInteger(collection.version)) throw new Error("No se pudo confirmar la selección guardada. Reintenta sin cambiar el contenido.");
    operation.collection = { id: collection.id, version: collection.version };
  }
  const { id, version } = operation.collection;
  if (operation.destination === "private") return { text: "Selección privada creada. Aún no se compartió con nadie.", path: "" };
  if (operation.requestReview && !operation.reviewRequested) {
    await sharingRequest("/api/v1/publication-reviews", post(JSON.stringify({
      collectionId: id, expectedVersion: version,
      ...(operation.destination === "public" ? { listOnCv: true } : {
        inviteTarget: { email: operation.recipient, expiresAt: operation.expiresAt, download: operation.download ?? false },
      }),
    })));
    operation.reviewRequested = true;
    return { text: operation.destination === "public"
      ? "Autorización empresarial solicitada para publicar en tu CV. La selección sigue sin publicarse. Consulta Autorizaciones de publicación y confirma la publicación cuando esté autorizada."
      : "Autorización empresarial solicitada para este correo, vigencia y acceso de solo lectura. Todavía no se concedió acceso ni se envió correo. Confirma el acceso después de la aprobación.", path: "", awaitingReview: true };
  }
  if (operation.destination === "invited") {
    // Freeze both key and body across retries, even after an ambiguous network error.
    await sharingRequest(`/api/v1/share-collections/${encodeURIComponent(id)}/grants`, post(JSON.stringify({
      expectedVersion: version, inviteEmail: operation.recipient, scopes: operation.download ? ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"] : ["VIEW_COLLECTION"], expiresAt: operation.expiresAt,
    }), operation.grantKey));
    return { text: "Permiso de lectura guardado. No se envió ningún correo. Comparte el enlace; la persona debe iniciar sesión con el correo autorizado y verificado.", path: `/portal/selecciones/${encodeURIComponent(id)}` };
  }
  if (operation.projectionAttempted) {
    // Projection has no idempotency key. Reconcile before retrying; never publish
    // a newer collection silently after another session changed its scope.
    const collections = await sharingRequest<Array<{ id: string; version: number; publicProjection: { slug: string; revokedAt: string | null } | null }>>("/api/v1/share-collections", { method: "GET" });
    const current = collections.find(collection => collection.id === id);
    if (!current) throw new Error("La selección guardada ya no está disponible. Revisa Tus selecciones.");
    if (current.version === version + 1 && current.publicProjection && !current.publicProjection.revokedAt) {
      return { text: "Publicación confirmada. Cualquier persona con el enlace puede ver los campos y archivos autorizados.", path: `/selecciones/${encodeURIComponent(current.publicProjection.slug)}` };
    }
    if (current.version !== version) throw new Error("La selección cambió en otra sesión. Revisa Tus selecciones antes de publicar; no se aplicaron permisos nuevos desde este intento.");
  }
  operation.projectionAttempted = true;
  const projection = await sharingRequest<{ slug: string }>(`/api/v1/share-collections/${encodeURIComponent(id)}/projection`, post(JSON.stringify({ expectedVersion: version, ...(operation.listOnCv !== false ? { listOnCv: true } : {}), ...(operation.workCase ? { workCase: operation.workCase } : {}) })));
  if (!projection.slug) throw new Error("No se pudo confirmar el enlace público. Reintenta para consultar su estado.");
  return { text: operation.listOnCv === false ? "Selección publicada con el alcance autorizado." : "Selección publicada con enlace público. También aparecerá en tu CV cuando el perfil tenga el CV público. Cualquier persona con el enlace puede ver los campos y archivos autorizados.", path: `/selecciones/${encodeURIComponent(projection.slug)}` };
}
