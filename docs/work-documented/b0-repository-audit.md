# B0 - Mapa real para Trabajo documentado

Fecha de corte: 15 de octubre de 2026
Repositorio: `icc-topografia`
Rama auditada: `codex/icc-production-preview`
Estado: listo para revision tecnica; la firma formal del responsable tecnico sigue pendiente.

## 1. Resultado ejecutivo

El producto no parte de cero. La identidad global, autenticacion, membresias de workspace, perfiles profesionales, bitacoras, medios, validaciones, conversaciones, notificaciones, suscripciones y limites ya existen. Deben reutilizarse.

Los conceptos propuestos en el plan que aun no tienen un equivalente semantico completo son: revisiones inmutables de evidencia, contribuciones estructuradas, WorkCase con relaciones confirmadas, solicitudes de respaldo con alcance/version, colecciones compartidas, concesiones revocables, proyecciones publicas versionadas, necesidades empresariales, evaluaciones privadas, colaboraciones bilaterales y constancias de cierre.

La implementacion debe continuar como monolito modular. No se autoriza crear una segunda identidad, una segunda membresia, otra mensajeria ni otro sistema de planes.

## 2. Stack comprobado

| Area | Implementacion real | Decision B0 |
| --- | --- | --- |
| Runtime | Node `>=22.13.0`; Netlify fija Node 22 | Mantener |
| Web | Next.js 15.5.25, React 19, TypeScript 5.8 | Mantener; no actualizar versiones mayores dentro de este programa |
| Datos | PostgreSQL + Prisma 6.5, schema `icc` | Fuente de verdad unica |
| Autenticacion | Auth.js/NextAuth v5 beta, Prisma Adapter, credenciales y Google condicional | Reutilizar `User`, `Account`, `Session`, `VerificationToken` |
| Autorizacion | Roles globales, `TerraqoWorkspaceMember`, helpers por portal/workspace y filtros por visibilidad | Consolidar en una politica de dominio deny-by-default antes de exponer nuevos recursos |
| Archivos | Netlify Blobs mediante servicios de almacenamiento privados | Reutilizar; agregar estados de cuarentena/procesamiento antes de ampliar tipos |
| Trabajos asincronos | Netlify Background Functions para importacion CV y limpieza; estados persistidos en BD | Extender el patron durable, no mantener tareas largas dentro de requests |
| Cobros | Culqi, billing account/subscription/attempt/payment/audit e idempotencia | Reutilizar; no crear checkout nuevo en estos bloques |
| UI | App Router, Tailwind, componentes propios, Lucide | Mantener tokens y componentes; WCAG 2.2 AA como gate |

## 3. Inventario cuantitativo reproducible

Ejecutar:

```powershell
npm run audit:inventory
```

Corte actual:

- 374 archivos TypeScript/TSX inspeccionados en `app` y `components`.
- 233 rutas de pagina/API inventariadas.
- 1,066 controles interactivos inventariados.
- 108 paginas App Router y 125 Route Handlers.
- Los CSV canonicos son `docs/audits/routes.csv` y `docs/audits/interface-controls.csv`.

El inventario identifica presencia, no garantiza que cada control sea funcional o accesible. Los recorridos deben verificarse con pruebas de dominio, integracion y navegador.

## 4. Mapa de dominios propuestos contra el codigo real

| Dominio propuesto | Equivalente existente | Cobertura | Decision |
| --- | --- | --- | --- |
| Identity | `User`, `Account`, `Session`, `VerificationToken`, `TerraqoProfessionalProfile` | Alta | Reutilizar sin duplicar |
| Membership | `TerraqoWorkspace`, `TerraqoWorkspaceMember`, `TerraqoTeam*` | Alta | `WorkspaceMember` sigue siendo la autoridad organizacional; equipos no reemplazan membresias |
| EvidenceRecord | `TerraqoWorklogEntry` | Parcial | Evolucionar la bitacora; no crear una tabla paralela de registros |
| EvidenceRevision | No existe | Ausente | Agregar historial append-only antes de respaldos versionados |
| Contribution | Autor/perfil y campos libres en `WorklogEntry` | Baja | Agregar contribucion estructurada; no inferir ejecutor desde autor o imagen |
| MediaAsset/Attachment | `TerraqoWorklogMedia`, evidencias de experiencia/educacion y Netlify Blobs | Parcial | Unificar contrato de seguridad y procesamiento sin fusion destructiva inmediata |
| WorkCase | Cadena `previousWorklogId`/`nextWorklog` | No equivalente | Conservar continuidad legacy; crear agrupacion explicita separada con confirmacion y auditoria |
| Trust | `TerraqoWorklogValidation` | Parcial | Migrar hacia solicitud/decision con revision, hash y alcance; no promover validaciones antiguas |
| Sharing | `visibility`, `liveCvEnabled`, rutas CV publicas | Baja | Introducir coleccion, grant y proyeccion; visibilidad no equivale a autorizacion dirigida |
| Discovery | `TerraqoJobPost`, `TerraqoProjectApplication`, red profesional | Parcial | Necesidad y evaluacion son nuevos dominios privados de workspace |
| Conversation | `TerraqoConversation`, participantes, mensajes y adjuntos | Alta | Reutilizar; agregar referencias de recursos sin conceder acceso implicito |
| Collaboration/Closure | No existe | Ausente | Agregar solo despues de grants y respaldo; aceptacion y publicacion son operaciones distintas |
| Assistance | Importacion CV, asistente de redaccion, jobs persistidos | Parcial | Generalizar jobs con fuentes, policy version, claims y abstencion |
| Audit/Notifications | `ActivityLog`, `Notification`, auditorias de billing | Parcial | Definir eventos opacos y sin contenido privado; no hay outbox transversal aun |
| Entitlements | modulos, planes, suscripciones y buckets de uso | Alta | Reutilizar como limites de producto; nunca como permiso de lectura |

## 5. Mapa de pantallas S01-S24

| Pantalla | Superficie actual | Estado | Accion |
| --- | --- | --- | --- |
| S01 Acceso/contexto | `/cuenta`, `/registro`, selector de workspace | Parcial | Conservar destino, estados de correo y recuperacion sin enumeracion |
| S02 Mi trayectoria | `/portal`, `/portal/bitacora`, `/portal/perfil` | Parcial | Crear cockpit de trayectoria sin duplicar modulos |
| S03 Captura | `WorklogComposer`, APIs web y portal workspace | Parcial | Borrador local/servidor, cola offline y estados por archivo |
| S04 Revision asistida | Composer + writing assistant | Parcial | Separar sugerencia de hecho; version y conflicto 409 |
| S05 Organizar trabajo | Continuidad lineal de bitacoras | No equivalente | WorkCase explicito; continuidad se mantiene compatible |
| S06 Visibilidad/seleccion | visibilidad de bitacora y CV | Parcial | Preview por DTO, coleccion y grant separados |
| S07 Solicitar respaldo | control de validacion | Parcial | Alcance, revision, expiracion e idempotencia |
| S08 Revisar respaldo | `/portal/validaciones` | Parcial | Decision por aspecto y autoridad vigente |
| S09 CV vivo | `/cv/[username]` | Implementado parcial | Integrar proyecciones versionadas y conteos canonicos |
| S10 Archivo/calendario | `/portal/bitacora`, evidencias publicas | Parcial | Cursor servidor, rango/zona y restauracion de estado |
| S11 Registro/trazabilidad | detalle dentro de explorador CV | Parcial | Permalink canonico, revision y capacidades por audiencia |
| S12 Definir necesidad | oportunidades/job posts | No equivalente | Nuevo dominio de necesidad empresarial |
| S13 Explorar experiencia | `/portal/red`, oportunidades | Parcial | Resultados centrados en evidencia y motivo explicable |
| S14 Evaluacion | No existe | Ausente | Dossier privado de workspace con fuentes |
| S15 Conversacion | `/portal/mensajes` | Implementado parcial | Referencias sin ampliacion de permiso; estados de envio |
| S16 Colaboracion/cierre | No existe | Ausente | Nuevo dominio bilateral versionado |
| S17 Revisar cierre | No existe | Ausente | Decision sobre version y constancia privada |
| S18 Accesos/documentos/plan | configuracion, archivos, documentos, membresia | Parcial | Consolidar grants y entitlements sin mezclar permisos |
| S19 Archivo movil | responsive actual de bitacora | Parcial | Lista-detalle, bottom sheets y retorno estable |
| S20 Recuperacion | estados locales dispersos | Parcial | Contrato transversal de estados y errores |
| S21 Propuesta/aceptacion | No existe | Ausente | Operacion idempotente y version inmutable |
| S22 Equipo | equipos y miembros de workspace | Parcial | Separar equipo operativo de autoridad del workspace |
| S23 Seleccion recibida | No existe | Ausente | Grant validado y estado neutral sin filtracion |
| S24 Autorizar material | validacion workspace parcial | Ausente | Autorizacion de version/adjuntos antes de proyeccion publica |

## 6. Riesgos P0 encontrados

1. `TerraqoWorklogEntry` es mutable y no conserva revisiones. Un respaldo actual puede quedar asociado a contenido editado sin hash de revision.
2. `TerraqoWorklogValidation` valida la bitacora completa y no modela campos/alcance, confirmacion parcial, expiracion o revocacion.
3. `visibility` mezcla publicacion con audiencia; no existe una concesion dirigida, versionada y revocable.
4. La continuidad actual es una lista enlazada unica. No representa un trabajo con multiples registros, participantes o estados de relacion.
5. La consulta del archivo profesional carga hasta 90 registros en servidor y filtra fechas en memoria. La vista publica carga hasta 80. No cumple todavia cursor, agregados de calendario ni escala objetivo.
6. Los enlaces legacy con `#recordId` se generaban, pero el explorador solo inicializaba seleccion desde `?registro=`. La primera correccion B1 de esta rama ya resuelve ambos formatos y agrega permalink canonico por ID.
7. La politica de lectura esta distribuida en helpers distintos. Antes de grants, evaluacion o analisis debe existir una decision central reutilizable por listado, detalle, medio y worker.
8. Existe outbox durable para contabilidad de worklogs nativos, pero no un outbox transversal para notificaciones, grants y procesamiento de evidencia.

## 7. Decisiones de bloque

- B0 no introduce migraciones destructivas ni despliegues.
- B1 empieza por compatibilidad de permalink, DTO autorizado, cursor estable y calendario por zona.
- B2 agrega revisiones, media segura y WorkCase con feature flags apagados por defecto.
- B3 no reutiliza `visibility` como grant ni una validacion antigua como respaldo versionado.
- B4 reutiliza conversaciones, pero la referencia a evidencia nunca concede acceso al archivo.
- B5 usa jobs persistidos; la IA no publica, valida, envia ni confirma por omision.

## 8. Gates antes de iniciar migraciones

- Aprobar ADR-001 y ADR-002.
- Definir retencion de revisiones, disputas y originales.
- Definir roles empresariales que pueden respaldar y autorizar publicacion.
- Definir limites MIME/tamano y estrategia real de cuarentena/escaneo.
- Definir alcance juridico y copy de la constancia profesional.
- Preparar fixture anonimizado y matriz actor x tenant x recurso.
- Validar que rollback deshabilita lectura/escritura nueva sin borrar datos.

## 9. Primera entrega B1 incluida en la rama

- Ruta canonica: `/cv/[username]/evidencias/[recordId]`.
- Compatibilidad de lectura para `#recordId` y `?registro=recordId`.
- Normalizacion del enlace legacy hacia la URL canonica sin recargar la pagina.
- Resolucion directa del registro aunque no forme parte de los 80 elementos iniciales.
- Validacion del propietario, `visibility = PUBLIC` y `deletedAt = null` antes de renderizar.
- IDs sinteticos de experiencia, educacion, documento y proyecto mantienen query canonica porque no son filas `TerraqoWorklogEntry`.
- Prueba automatizada: `npm run test:public-cv-permalink`.
- Verificacion local: permalink visible `200`, query compatible `200`, ID ajeno/no visible `404`.

## 10. Firma

Preparado para revision el 15 de octubre de 2026.
Responsable tecnico: ____________________
Producto: ____________________
Seguridad/privacidad: ____________________
