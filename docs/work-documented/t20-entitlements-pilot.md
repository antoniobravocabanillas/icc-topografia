# T20 — Entitlements y piloto comercial controlado

Fecha: 18 de octubre de 2026.

## Decisión

T20 no crea precios, checkout ni un plan nuevo. Lee el plan efectivo existente en servidor y añade una concesión de piloto explícita por workspace. Son dimensiones separadas:

- **plan**: contrato facturado vigente, resuelto por `effectivePlan` en modo live;
- **feature flag**: capacidad técnica apagable;
- **piloto**: workspace incluido explícitamente en `TERRAQO_B5_PILOT_WORKSPACE_IDS`;
- **uso**: límite operativo comprobado por API.

Una pantalla, URL de retorno o variable cliente no concede acceso. `*` solo debe usarse después de una aprobación explícita de rollout.

## Implementación local

- `GET /api/v1/entitlements` devuelve plan y capacidades confiables del contexto actual.
- Estados: `DISABLED`, `PENDING_PILOT`, `ACTIVE` y `LIMIT_REACHED`.
- Capacidades: `employer_needs`, `collaboration_closure` y `evidence_analysis`.
- `readPreserved=true`: perder acceso de escritura no elimina ni reclasifica historial.
- Crear o revisar una necesidad, explorar evidencia, crear o editar un expediente, iniciar contacto empresarial, crear/revisar una colaboración, preparar/enviar su cierre y solicitar un análisis exigen entitlement activo.
- Listar necesidades, expedientes y jobs existentes permanece disponible mientras el módulo base siga legible.
- Las decisiones ya pendientes del profesional permanecen disponibles para no dejar conversaciones, propuestas o cierres atrapados al retirar el piloto.
- Límites mensuales de necesidad y análisis se verifican antes en la API y de nuevo dentro de la transacción serializada.
- Un replay con la misma clave idempotente se resuelve antes del conteo y no consume otra unidad.
- Un 429 incluye `Retry-After`; el envelope conserva `requestId`.
- El panel muestra tier y uso restante, bloquea nuevas acciones cuando no existe concesión y conserva la consulta del historial.
- El entitlement de análisis no se confunde con disponibilidad técnica: el botón solo aparece si proveedor y dispatcher están configurados; la evaluación manual permanece visible.

## Configuración segura

```env
TERRAQO_B5_PILOT_WORKSPACE_IDS="workspace-id-1,workspace-id-2"
TERRAQO_EMPLOYER_NEEDS_MONTHLY_LIMIT="25"
TERRAQO_EVIDENCE_ANALYSIS_MONTHLY_LIMIT="100"
```

Los números son topes operativos configurables del piloto, no precios ni promesas comerciales. Los flags B4/B5 continúan en `false` por defecto.

## Invariantes

- El plan no convierte `DECLARED` en `ENDORSED` o `CONFIRMED`.
- El límite no oculta expedientes, respaldos, cierres ni jobs históricos.
- Un downgrade no borra datos ni revoca una autorización de fuente por sí solo.
- El entitlement no amplía permisos de workspace ni acceso a documentos.
- La caché de análisis no evita la reautorización de fuentes.
- No se cobra, despliega ni aplica una migración desde este cambio.

## Gate local

- `npm run test:product-entitlements-contract`.
- `npm run test:recovery-observability-contract`.
- `npm run test:evidence-analysis-contract`.
- `npm run typecheck`.
- ESLint focalizado sin advertencias.
- `npm run build`: aprobado. Solo emitió advertencias preexistentes fuera de T18–T20 sobre símbolos sin uso e imágenes heredadas con `<img>`.

## Gate local disposable completado

`npm run test:b5-multiuser-gate` validó dos workspaces sintéticos, replay concurrente, límite, downgrade, flags e historial preservado sobre PostgreSQL local aislado. Los fixtures se eliminaron al finalizar. La evidencia detallada está en `docs/work-documented/b5-local-database-gate.md`.

El 27 de octubre de 2026 se repitió el mismo gate contra la base exclusiva `Terraqo Platform Staging`, con consentimiento remoto exacto y el rol runtime sin DDL. Aprobó piloto/control, `P2034` concurrente recuperado de forma acotada, límite, downgrade y flags. Una consulta independiente confirmó cero usuarios, workspaces, necesidades y jobs al terminar.

`npm run test:b5-browser-accessibility` confirmó el entitlement T20 en el panel empresarial junto con T13–T17: plan `PROFESSIONAL` visible, evaluación manual disponible cuando el proveedor automático está apagado, recuperación de consultas fallidas sin recargar, navegación por teclado, 320 px y zoom de 200 %. La prueba usó Next/Auth/API/PostgreSQL reales y eliminó todos sus fixtures sintéticos.

## Gate de staging pendiente

1. Aplicar las migraciones B4/B5 en una copia aislada.
2. Repetir con dos workspaces de staging: uno admitido y otro fuera del piloto.
3. Confirmar por HTTP autenticado lectura histórica en ambos y escritura únicamente en el admitido.
4. Repetir la concurrencia a través de la capa HTTP y confirmar un único incremento por operación idempotente.
5. Expirar el plan y retirar el workspace del piloto; verificar en UI y API que los estados históricos no cambian.
6. Ensayar flags off/on y rollback sin borrar tablas.
7. Validar que ningún callback de pago o query string conceda acceso.

T20 queda implementado a nivel local; su cierre operativo depende de este gate con datos aislados y de una decisión comercial sobre cohortes y límites definitivos.
