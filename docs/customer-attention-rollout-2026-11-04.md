# Atención y conversión — prioridad 4 noviembre 2026

S22 queda PAUSADO por solicitud del usuario. Conservar sus cambios locales; no incluir su migración en esta entrega.

Fuente de alcance: C:/Users/Binv/.codex/attachments/1124a72d-aac4-40ab-9495-b4b77f56d23f/Pasted text.txt.
El usuario confirmó **todos** los recorridos para esta actualización: atención/seguimiento, configuración por workspace y vínculo comercial/resultados. No considerar la bandeja como entrega completa ni publicar un subconjunto sin comunicar el alcance.

## Implementado localmente
- Bandeja /admin/chat: búsqueda, filtros, paginación, selección URL, vista de conversación/contexto, navegación móvil sin modal, historial paginado, actualización 30s que respeta foco de formularios.
- Asignación transaccional: una sola toma concurrente, permisos bajo bloqueo por conversación, no robar responsable al responder, cierre conserva historial.
- Respuestas y notas internas idempotentes; bitácora de auditoría de acciones. Las notas quedan fuera del DTO público.
- Próxima acción, fecha y completado; cierre de seguimiento rechaza la fecha obsoleta. Formulario indica hora de Perú y que no envía avisos externos.
- API pública limita multipart a 40KB/8 partes, campos y mensaje; DTO mínimo del asesor. Inicio y mensajes idempotentes para widgets actualizados, notificaciones en la misma transacción; compatibilidad con widgets antiguos sin operationKey. Límites persistentes por minuto.
- Ambos widgets conservan texto ante fallo, dejan de prometer presencia, conservan historial resuelto. El widget ICC tiene nuevas superficies claras, objetivos táctiles y recuperación del polling al volver internet.

## Dos repositorios
- Plataforma: C:/Users/Binv/Documents/New project/icc-topografia, codex/platform-staging-release. Cambios de S22 ajenos a esta prioridad siguen sin commit.
- Sitio ICC: C:/Users/Binv/Documents/ICC TOPOGRAFIA. Solo se editaron app/components/TerraqoChatEmbed.tsx y app/globals.css para esta tarea; hay MUCHOS cambios móviles preexistentes, preservarlos.

## Validación real
- scripts/rehearse-customer-attention-local.mjs --confirm=local-attention-only: PostgreSQL18 efímero, SQL incremental real, pruebas de aislamiento, toma concurrente, notas/respuestas idempotentes, seguimiento, inicio/mensaje público y notificaciones sin duplicados. PASS.
- TypeScript plataforma e ICC PASS; ESLint focalizado PASS; detector Impeccable [] antes de añadir seguimiento/notas; Prisma validate PASS.
- Fixture real AttentionInbox en localhost:3190/admin/chat (servidor exec sesión 18539), scripts/fixtures/attention-inbox.tsx. Datos sintéticos, acciones simuladas. Navegación lista-detalle-volver PASS móvil, sin overflow. NO certifica autenticación HTTP.
- ICC dev localhost:3192 (exec sesión 74044). Prueba Playwright con /api/terraqo/chat interceptado: fallo de red conserva texto y vuelve habilitar enviar, sin overflow. No enviamos mensajes reales.
- Capturas en C:/Users/Binv/Documents/ICC TOPOGRAFIA/output/attention-desktop-first.png, attention-mobile.png, customer-widget-mobile.png. Las primeras capturas preceden notas/seguimiento: falta ronda final con UI actual.

## Staging
- Supabase confirmado Terraqo Platform Staging mghdpciewbsowjrjwmwk ACTIVE_HEALTHY.
- Respaldo output/s24-backup-1793788211798/icc.dump, SHA256 17e792207c5b76db79bb3e79f4e62e2237ad8de186c42c9c0a07416bffbe2090, 645640 bytes.
- Restaurado localmente y ensayado SQL con scripts/restore-attention-staging-local.mjs; preservación de conteos, bloqueo de instalación duplicada y permisos PASS.
- Aplicada SOLO en staging la migración 20261104000200_customer_attention_followup mediante Supabase apply_migration.
- Readback: 46 migraciones, 3 columnas, checksum a7f498f903d18ce459c2f12e32cb4dde3a36006e6a92480831f9b787ba8cde57, sin acceso anon/authenticated, permiso SET migrador revocado, 0 seguimientos con datos.
- SQL guardado output/attention-staging-migration.sql y ledger previo output/attention-staging-ledger.json. Generador scripts/prepare-attention-staging-migration.mjs.
- Staging APP sigue candidato 2ece409 / deploy 6aea2a045ee12c88f761c44c. Todavía no se publicó código de atención.
- Producción plataforma sigue deploy 6ae7ec06e99b195a657aa8be. Sitio Netlify 2d38524a-44f9-4473-8a1f-9270e03bc2bf, rama codex/icc-production-preview. Producción NO modificada.
- Sitio ICC .netlify/state.json: 5e1adf1c-580a-46e3-8854-e6a795cc7c73.
- Evitar CLI env:set: incidente previo apuntó a sitio equivocado. Usar SDK con siteId explícito/aseveraciones y nunca imprimir secretos.

## Siguiente bloque ejecutable
1. Configuración por workspace: identidad, motivos, horario/zona, dominios, borrador/vista previa/publicación/rollback. Reutilizar TerraqoWorkspace.settings con esquema versionado y bloqueo de fila; no pisar otras claves.
2. API/widget multiempresa: hoy /api/chat aún resuelve DEFAULT workspace. Debe quedar resuelto por workspace/dominio autorizado con acceso seguro a historial; no afirmar aislamiento completo del widget multiempresa hasta hacerlo. IDs actuales actúan como handle bearer heredado; diseñar recuperación segura sin exponer registros privados.
3. Comercial: crear/vincular oportunidades del mismo workspace y cotizaciones/pedidos, mostrar evidencia distinta de venta declarada/pago. Opportunity exige Company; no inventar empresa ni sumar monedas. Atribución deduplicada, sin cobros.
4. Métricas con período y denominadores reales; panel global agregado, nunca textos/contactos.
5. Validación HTTP con dos workspaces, flujos navegador actuales, recuperación y fallos. Revisión diff completo, candidato aislado del S22 pausado, staging deploy/tests/cleanup.
6. Solo entonces preparar y publicar ambos destinos autorizados con respaldo/rollback y verificación de producción. No afirmar actualización publicada antes.

Riesgos pendientes: límites/rutas de chatbot heredado y su pérdida de contexto al derivar; historial público sin paginación; conflicto de transferencias explícitas; falta configuración y recuperación entre dispositivos. No prometer avisos por correo/WhatsApp hasta implementar cola/entrega. Canales avanzados y cobros reales no forman parte de las pruebas autorizadas.

## Ampliación validada en esta continuación
- Configuración con revisión concurrente, borrador/publicación/rollback; preview desktop y móvil. Ambos widgets consumen configuración publicada. El API acepta workspace explícito; rechaza workspace inactivo/no publicado y filtra orígenes. La política de dominios controla instalación, no autentica conversaciones.
- Protocolo visitante v2: capability HMAC de 90 días separada del ID, vinculada al workspace; nuevas conversaciones y handoffs. Recuperación mediante código privado, fuera de URLs. Compatibilidad v1 conservada para instalaciones antiguas; NO describir como migración de seguridad de todo el historial heredado.
- Bot transaccional/idempotente; transferencia de historial completo acotado, notificación única. Conocimiento limitado al workspace. Límites reales del cuerpo en plataforma y proxies ICC.
- Historial público de 100 mensajes por página, cursor comprobado dentro de la conversación; 205 mensajes con timestamp igual cubiertos sin pérdidas/duplicados.
- Oportunidades del propio workspace: creación/vínculo idempotentes y atribución inmutable. Informe 7/30/90 días, denominadores explícitos, oportunidad/venta única, monedas separadas y cancelaciones visibles; no confirma pagos bancarios. Panel global nuevo /admin/terraqo/atencion agrega sin textos/contactos.
- Pruebas PostgreSQL18 locales PASS: permisos, concurrencia, replay, privados, configuración, rollback, capability alterada/otra empresa/expirada, bot/handoff, paginación y métricas. La prueba detectó zona de sesión America/Bogota: corregido AT TIME ZONE UTC explícito en SQL crudo, sin cambiar zona global. Importes numéricos preservados como decimal, sin float financiero.
- TypeScript ambos repos y ESLint focalizado pasaron antes de últimos cambios de paginación/global; repetir cierre final. Capturas attention-detail-desktop.png, attention-config-desktop.png y customer-widget-current.png bajo ICC TOPOGRAFIA/output. Navegación móvil contexto-volver PASS; widget con API interceptada guardó capability y la reenvió después de recargar. No prueba HTTP autenticado remoto ni entrega de correo.
- Verificación Netlify actual: producción plataforma c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc, deploy6ae7ec06e99b195a657aa8be; staging 2ece409ccc920c0da317f80b8a9a35c571c45dd7; ICC deploy6a7458e58755414196df9ea7 (sin commit_ref). No hubo despliegue de atención.

## Cierre pendiente actualizado
1. Aislar candidato de atención desde el commit realmente publicado c623ec8, sin S22 ni S23/S24. Aplicar únicamente parche propio de admin-actions (HEAD incluye guard S22 que no debe copiarse entero) y columnas seguimiento sobre schema de producción. Conservar working trees originales.
2. Completar validación HTTP real, transferencia obsoleta, recuperación navegador con resultado verificado y revisión de alcance visual; build del candidato y pruebas de regresión.
3. Instalación efectiva multiempresa/canales/automatizaciones: todavía no hay snippet genérico embebible ni prueba de instalación por una segunda empresa. Avisos externos y métricas de entrega/recuperación/costos no se han inventado: requieren eventos y canales conectados. Revisar alcance completo antes de considerar entrega final.
4. Preparar staging candidate con gate propio sin depender de migraciones S22/S23/S24 de la rama de desarrollo. Staging SQL seguimiento ya aplicado, no repetirlo.
5. Preparar backup y procedimiento productivo exacto (solo migración seguimiento), publicación de ambos sitios y comprobación. No se ha alterado producción.

Archivos ICC adicionales de esta continuación: app/components/ChatContinuity.tsx, app/api/terraqo/chat/config/route.ts, app/api/terraqo/chat/route.ts, app/api/terraqo/chatbot/route.ts, app/lib/terraqo-api.ts, app/lib/bounded-chat-body.ts. No incluir cambios Flutter ajenos.


## Estado vigente — candidato aislado de atención (2026-11-04)
Esta sección sustituye las listas antiguas de pendientes anteriores.

### Checkout de entrega
- Implementación más reciente: `C:/Users/Binv/Documents/New project/icc-topografia-attention-release`, rama `codex/customer-attention-release-20261104`.
- Base real publicada: `c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc`. No incluye S22/S23/S24; no copiar schema ni admin-actions completos desde el checkout de desarrollo.
- El checkout original conserva S22 y versiones previas de algunos archivos de atención. Antes de seguir, trabajar en el candidato aislado; no asumir que el original contiene la última implementación.
- ICC mantiene únicamente los archivos web de atención modificados; preservar sus cambios Flutter ajenos.

### Últimos recorridos implementados
- Enlace público por empresa `/atencion/[workspaceSlug]`, disponible solo con configuración publicada, empresa activa y módulo habilitado. Configuración permite copiar/abrir ese enlace.
- Registro de resultado ganada/perdida desde una oportunidad vinculada, motivo obligatorio, auditoría privada visible, bloqueo de oportunidad y compare-and-set de estado. Reintento exacto conserva un recibo único; payload distinto o estado obsoleto se rechaza. No crea ventas ni pagos.
- Enlace desde el contexto a la oportunidad exacta y su cotización, filtrado por workspace en servidor.
- ICC usa logo/color publicado y contraste calculado. Recuperación dispone de CSS propio porque el sitio no carga las utilidades Tailwind del portal. Corregidos botones sin estilo, burbujas estiradas y scroll móvil.

### Evidencia nueva
- HTTP real contra Next.js local + PostgreSQL efímero: crear/reintentar, token ausente/alterado, aislamiento entre dos empresas, configuración publicada, origen rechazado, cuerpo chunked >40KB rechazado, derivación bot con capability. Ambas páginas públicas responden 200, empresa inexistente 404.
- PostgreSQL: transferencia válida y rechazo de transferencia obsoleta; resultado idempotente, rechazo sin permiso y sin motivo, rechazo de conflicto desde otra conversación; número de ventas inalterado.
- TypeScript plataforma/ICC PASS; encoding guard PASS; compilación completa Next PASS en dos ciclos. Existe advertencia heredada `admin-actions.ts:209 existingUserId` del commit base.
- Última compilación de cierre PASS después del enlace directo a oportunidades y del historial de resultados: sesión 73992, salida 0, 101 páginas generadas. PostgreSQL/HTTP PASS en el mismo ciclo.
- Playwright recuperación ICC PASS con API interceptada y datos sintéticos; mensaje de éxito comprobado. 390px sin overflow; botones 44px. Capturas `customer-recovery-polished.png` y `attention-outcome-desktop.png` en `ICC TOPOGRAFIA/output`.
- Formulario resultado validado visualmente con acción simulada; persistencia/concurrencia se valida separadamente en PostgreSQL. No confundir fixture visual con E2E autenticado remoto.
- Los builds realizados con la base sintética NO son artefactos desplegables.

### Respaldo productivo de solo lectura
- Backup privado: `C:/Users/Binv/.terraqo-private/attention-2026-11-04T11-21-04-208Z/icc.dump`.
- SHA256: `0078537b0bd9b0a36c78a37250a6fdb61913ef1c7a153062f614bd6a806a7a80`, 828064 bytes.
- Script `prepare-attention-production-backup.mjs --confirm=read-only-backup`: verifica sitio, commit publicado, host de DB, ledger y ausencia de columnas antes del dump; no imprime credenciales.
- Script `restore-attention-production-local.mjs <directorio> --confirm=local-restore-only`: restauración real local PASS; aplica exclusivamente SQL seguimiento, verifica hashes de datos de todas las tablas (columnas anteriores en ChatConversation) antes/después y rechazo de instalación duplicada. Ledger productivo no modificado.
- Dos intentos locales iniciales fallaron por CRLF en nombres emitidos por psql; corregido trim por línea y tercer intento PASS. No hubo escritura remota.

### Pendientes reales para publicar
1. Gate remoto del candidato de atención en staging y recorridos autenticados de administrador/asesor/visitante con cleanup demostrado. La configuración cloud vigente de staging corresponde a fases posteriores: preparar un gate coherente sin desactivar validaciones ni arrastrar migraciones S22/S23/S24.
2. Aislar y compilar candidato ICC desde fuente comprobada; el deploy publicado no informa commit_ref. No subir el árbol Flutter ni otros cambios locales.
3. Revisar el alcance de instalación y configuración: enlace público listo; snippet embebible genérico, posición/páginas del widget, campos por motivo, reglas automáticas de asignación/escalamiento y retención todavía no implementados. Equipo y cotizaciones se gestionan mediante los módulos existentes.
4. Avisos externos, adjuntos, estados de entrega verificables y medición de recuperación/fiabilidad no están completos. No prometer correo/WhatsApp ni inventar tasas/costos. Integración de pagos y mensajería bidireccional siguen como fase posterior explícita del documento.
5. Preparar migración productiva EXACTA con ledger y backup fresco/readback, rollback del código compatible con columnas aditivas; publicar ambos sitios y verificar dominios reales. Autorización del usuario para esta actualización ya existe; no volver a pedirla por rutina.
6. Aún NO se aplicó migración en producción ni se desplegó atención. No declarar 100% ni entrega publicada.
