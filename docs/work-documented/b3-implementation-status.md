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
- La migración `20261017120000_scoped_sharing_endorsements` es expand-only y **no fue aplicada**.
- No habilitar flags antes de aplicar B1/B2/B3 en orden sobre staging y completar el recorrido manual.

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

## Gates externos pendientes

1. Aplicar migraciones B1, B2 y B3 en orden sobre una base de staging anonimizada y respaldada.
2. Crear selección privada, conceder acceso a una segunda cuenta y comprobar que otra identidad recibe `404`.
3. Probar vencimiento y revocación durante una sesión abierta; la siguiente lectura de JSON y medios debe fallar.
4. Publicar una selección personal, validar campos/medios y revocarla; el enlace y cada URL de medio deben dejar de responder.
5. Confirmar que material asociado a empresa no puede publicarse antes de S24.
6. Crear borrador de respaldo, enviarlo, responder desde el revisor y provocar un conflicto `409` desde una segunda sesión.
7. Retirar el rol empresarial antes de decidir; el respaldo empresarial debe fallar cerrado.
8. Ejecutar revisión de teclado, lector de pantalla, móvil estrecho y lenguaje legal/privacidad con usuarios reales de prueba.

## Estado

- **Implementación local:** COMPLETA.
- **Validación automatizada local:** APROBADA.
- **Migración remota:** NO EJECUTADA.
- **Recorrido multiusuario en staging:** PENDIENTE.
- **Release:** HOLD hasta completar los gates externos.
