# B3 - Compartición y respaldo con alcance

Fecha de corte: 17 de octubre de 2026.

## Resultado local

La implementación local de B3 está completa en código y permanece retenida para release. Toda lectura se autoriza en servidor y se vincula a revisiones inmutables B2; no reutiliza la visibilidad general de la bitácora como permiso dirigido.

### T10 - Selecciones privadas

- Una selección nace privada y no concede acceso al guardarse.
- Cada elemento fija una revisión, campos permitidos, orden e inclusión explícita de medios.
- La UI no preselecciona registros, campos, archivos ni destinatarios.
- Altas y permisos usan `Idempotency-Key`, fingerprint y transacción serializable.
- Una concesión identifica usuario o correo, exige `VIEW_COLLECTION`, puede añadir `DOWNLOAD_MEDIA` y limita la vigencia a 90 días.
- El enlace privado vuelve a comprobar identidad, vigencia, lifecycle y scopes en cada lectura.
- Revocar una concesión bloquea nuevas lecturas; no promete borrar copias ya descargadas.

### T11 - Proyección pública revocable

- Publicar es una operación separada con `expectedVersion` y slug opaco.
- La respuesta pública se construye campo por campo; nunca serializa la revisión completa.
- Los medios públicos se limitan a derivados WEBP normalizados.
- Material vinculado a workspace falla cerrado hasta que S24 implemente autorización empresarial de material.
- La revocación invalida inmediatamente las nuevas lecturas del contenido y sus medios.

### T12 - Respaldo con alcance fijo

- La solicitud fija revisión, hash, persona, relación, organización opcional, campos y caducidad.
- Un borrador no envía ni notifica; puede enviarse después con control de versión.
- El revisor responde exactamente todos los campos solicitados y no puede ampliar el alcance.
- Cada respuesta es `CONFIRMED`, `UNABLE_TO_CONFIRM` o `CHANGES_REQUESTED`; pedir aclaración exige comentario.
- La clasificación final es determinista: confirmada, no confirmada, parcial o requiere aclaración.
- Las decisiones son append-only, idempotentes y conservan el hash de la revisión.
- Para respaldo empresarial se valida autoridad `OWNER`, `ADMIN` o `MANAGER` al crear y nuevamente al decidir; el snapshot queda auditado.
- Revocar conserva decisiones históricas y bloquea nuevas decisiones.

## Superficies implementadas

- `/portal/selecciones`: composición, preview de alcance, concesiones, publicación y revocación.
- `/portal/selecciones/[id]`: lectura privada autenticada y descarga según scope.
- `/selecciones/[slug]`: proyección pública filtrada.
- `/portal/respaldos`: borrador, envío, revisión por aspecto, clasificación y revocación.
- APIs `/api/v1/share-collections`, `/api/v1/shared-selections`, `/api/v1/public/selections` y `/api/v1/endorsement-requests`.

## Controles de despliegue

- `TERRAQO_SCOPED_SHARING_V1=false` por defecto.
- `TERRAQO_SCOPED_ENDORSEMENTS_V1=false` por defecto.
- Las rutas UI/API fallan cerradas con ambos flags apagados.
- La navegación solo muestra cada módulo cuando su flag está activo.
- Las migraciones `20261017120000_scoped_sharing_endorsements` y
  `20261020143000_share_item_media_snapshot` fueron aplicadas en el Supabase
  exclusivo `Terraqo Platform Staging`; no se aplicaron en producción.
- Los flags B3 están activos solo en la cohorte Netlify aislada y protegidos por
  el allowlist fail-closed del preflight.

## Evidencia local

- `npx prisma format`: aprobado.
- `npx prisma validate`: aprobado.
- `npm run prisma:generate`: aprobado.
- `npm run typecheck`: aprobado.
- `npm run test:worklog-create-operation`: aprobado.
- `npm run test:worklog-revision`: aprobado.
- `npm run test:scoped-sharing-contract`: aprobado.
- ESLint focalizado B3: aprobado sin warnings.
- `npm run build`: aprobado; solo conserva warnings preexistentes fuera de B3.
- `git diff --check` focalizado: sin errores; solo avisos LF/CRLF de Windows.

## Evidencia remota de staging

- Tres identidades y dos workspaces sinteticos.
- Replay idempotente y colision de fingerprint.
- Lectura privada por identidad, caducidad y revocacion inmediata.
- Proyeccion publica por campos y revocacion inmediata.
- Publicacion empresarial rechazada antes de S24.
- Respaldo parcial, conflicto concurrente estable `200/409` y revalidacion de
  autoridad empresarial.
- UI real validada en Selecciones y Respaldos.
- Limpieza total de fixtures comprobada al finalizar.

## Gates externos pendientes

1. Probar descarga y revocacion de un medio WEBP real desde un dispositivo
   fisico, sin reutilizar datos de clientes.
2. Ejecutar revision de teclado, lector de pantalla, movil estrecho y lenguaje
   legal/privacidad con usuarios reales de prueba.
3. Observar el rollback por flags despues de cerrar B4-B5.

## Estado

- **Implementación local:** COMPLETA.
- **Validación automatizada local:** APROBADA.
- **Migración remota:** APLICADA EN STAGING EXCLUSIVO.
- **Recorrido multiusuario en staging:** APROBADO.
- **Release:** HOLD hasta completar los gates externos.
