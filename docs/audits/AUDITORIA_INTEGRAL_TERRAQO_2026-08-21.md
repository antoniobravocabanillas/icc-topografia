# Auditoría integral de Terraqo

Fecha de corte: 21 de agosto de 2026  
Repositorio: `icc-topografia`  
Rama auditada: `codex/icc-production-preview`  
Producto observado: Terraqo + workspace ICC Topografía  
Estado del informe: corte técnico inicial completo, con inventarios regenerables

## 1. Resumen ejecutivo

Terraqo ya no es un prototipo visual. Es una plataforma modular multiempresa con superficies públicas, administración por workspace, comercio consultivo, CRM, proyectos, red profesional, CV vivo, bitácora, evidencia, validaciones, mensajería, equipos, foros, archivos y portales. El repositorio contiene 84 páginas, 85 endpoints, 88 componentes reutilizables, 84 modelos de datos y 53 enumeraciones de dominio.

El avance global ponderado estimado es **65%** respecto a la visión de Terraqo como sistema operativo empresarial que conecta empresas, proyectos, talento, evidencia, comercio y colaboración.

Este 65% no significa que 65% de las pantallas estén dibujadas. La interfaz está más adelantada, alrededor de 78%. El porcentaje baja al exigir flujo completo, persistencia, aislamiento multiworkspace, seguridad, datos reales, pruebas automatizadas, observabilidad y operación comercial productiva.

Conclusión ejecutiva:

- El núcleo diferencial sí existe: workspace modular + red profesional + CV vivo + evidencia operativa.
- El producto es útil hoy para administración interna, publicación de contenido, perfiles, proyectos, CRM consultivo y trazabilidad profesional.
- Aún no debe venderse como plataforma financiera, marketplace transaccional completo, inventario de activos en tiempo real ni automatización empresarial madura.
- El mayor riesgo no es falta de pantallas; es dispersión de superficies, pruebas insuficientes, flujos parcialmente conectados y capacidades presentadas antes de contar con operación completa.
- La prioridad debe ser consolidar recorridos de valor, no añadir más módulos visuales.

## 2. Método y criterios

Cada dominio se calificó en seis dimensiones:

1. Interfaz y experiencia visible: 15%.
2. Flujo funcional extremo a extremo: 25%.
3. Persistencia y modelo de datos: 20%.
4. Seguridad, permisos y aislamiento: 15%.
5. Operación real y datos confiables: 15%.
6. Pruebas, observabilidad y preparación productiva: 10%.

Escala:

- 0–20: concepto o placeholder.
- 21–40: prototipo parcial.
- 41–60: MVP funcional incompleto.
- 61–80: funcional y útil, requiere consolidación.
- 81–90: productivo con riesgos menores.
- 91–100: maduro, medido y operado.

## 3. Evidencia cuantitativa

| Elemento | Cantidad |
|---|---:|
| Páginas | 84 |
| Endpoints API | 85 |
| Rutas totales | 169 |
| Componentes en `components/` | 88 |
| Modelos Prisma | 84 |
| Enumeraciones Prisma | 53 |
| Archivos TS/TSX inventariados | 266 |
| Controles interactivos detectados | 657 |
| Formularios aproximados | 109 |
| Campos de formulario aproximados | 217 |
| Enlaces aproximados | 261 |
| Botones HTML directos aproximados | 62 |

Anexos auditables:

- `docs/audits/routes.csv`: todas las páginas y APIs.
- `docs/audits/interface-controls.csv`: controles con archivo, línea, tipo, etiqueta, destino/acción, tipo y nombre.
- `scripts/audit-interface-inventory.ts`: generador repetible.
- Comando: `npm run audit:inventory`.

## 4. Visión global contrastada

La visión coherente que emerge del producto es:

> Terraqo es un sistema operativo modular para empresas y profesionales que convierte relaciones, proyectos, trabajo y evidencia en operaciones trazables, perfiles verificables y oportunidades comerciales.

Pilares:

- Empresa/workspace como unidad operativa.
- Profesional con identidad y CV vivo.
- Proyecto como contexto de trabajo.
- Worklog/evidencia como prueba.
- Red operativa como descubrimiento autorizado.
- Comercio/CRM como conversión.
- Comunicación y documentos como continuidad.
- Módulos y planes como modelo SaaS.

La arquitectura apoya esta visión. La experiencia todavía no siempre la comunica como un recorrido único.

## 5. Matriz global de avance

| Dominio | Peso | Avance | Aporte ponderado | Dictamen |
|---|---:|---:|---:|---|
| Plataforma multiworkspace y módulos | 9% | 72% | 6.48 | Base sólida, aprovisionamiento limitado |
| Sitio público y CMS | 7% | 80% | 5.60 | Útil y cercano a producción |
| Perfil empresarial público | 5% | 82% | 4.10 | Fuerte, requiere contenidos verificables |
| Red operativa/profesional | 8% | 70% | 5.60 | Directorio público operativo; falta integrar oportunidades |
| CV vivo y perfil profesional | 8% | 84% | 6.72 | Uno de los activos más maduros |
| Worklog, evidencia y validación | 9% | 78% | 7.02 | Diferenciador real, faltan pruebas amplias |
| Proyectos y ejecución | 7% | 67% | 4.69 | Modelo amplio; gestión todavía fragmentada |
| CRM, leads, oportunidades y ventas | 8% | 70% | 5.60 | Funcional para venta consultiva |
| Cotizaciones, pedidos y comercio | 8% | 58% | 4.64 | Checkout consultivo, no pago transaccional |
| Tienda y vendibles | 6% | 63% | 3.78 | Catálogo útil; stock y precios requieren disciplina |
| Portal de cliente | 5% | 58% | 2.90 | Tiene valor, navegación y roles por consolidar |
| Mensajería, foros, equipos y Meet | 6% | 64% | 3.84 | Capacidad real pero dispersa |
| Documentos, archivos y notas | 4% | 72% | 2.88 | Buen aislamiento y utilidad operativa |
| Seguridad y permisos | 5% | 70% | 3.50 | Buen diseño, cobertura desigual |
| Analítica, automatización y reportes | 4% | 43% | 1.72 | Temprano; reportes básicos, automatización nominal |
| QA, observabilidad y DevOps | 5% | 40% | 2.00 | Principal deuda productiva |
| **Total** | **100%** | **65.07%** | **65.07** | **MVP avanzado, no plataforma madura** |

Por prudencia se comunica **65%**.

## 6. Auditoría por módulo

### 6.1 Multiworkspace, roles y módulos — 72%

Existe `TerraqoWorkspace`, membresías, propietario, tipo, marca, dominio, configuración, planes, suscripciones y módulos activables. Hay 15 códigos modulares: CRM, proyectos, sitio público, tienda, chat, red, CV, empleos, foros, mensajería, Meet, equipos, analítica, automatizaciones y documentos.

Funciona:

- Selección de workspace administrativo.
- Aislamiento por `terraqoWorkspaceId` en gran parte de las consultas.
- Guards por rol y por módulo.
- Activación/desactivación transaccional de módulos.
- Identidad visual por workspace.
- Aprovisionamiento básico; proyectos tiene plantilla inicial.

Falta:

- Aprovisionadores reales para casi todos los módulos.
- Matriz única y documentada de permisos por rol/módulo/acción.
- Pruebas de aislamiento para cada API y server action.
- Facturación real por plan y límites aplicados.
- Auditoría de cambios de configuración.

### 6.2 Sitio público y CMS — 80%

Incluye inicio, nosotros, servicios, sectores, proyectos, tienda, blog, FAQ, contacto, cotización, carreras, privacidad, términos y páginas CMS dinámicas.

Funciona:

- Datos públicos desde Prisma y contenido de respaldo.
- Detalle de servicios, proyectos, productos y blog.
- CMS de servicios, categorías, sectores, FAQs, testimonios, banners, páginas y logos.
- Media separada por dominio: productos, proyectos, servicios y clientes.
- SEO base, metadata, Open Graph para CV y sitemap/robots.

Riesgos/mejoras:

- Verificar todos los enlaces de navegación y CTA en producción.
- Unificar componentes públicos antiguos y Terraqo nuevos.
- Añadir pruebas visuales responsive y accesibilidad WCAG.
- Evitar texto de fallback que pueda presentarse como dato certificado.
- Instrumentar conversiones reales y embudos.

### 6.3 Perfil empresarial público — 82%

Funciona:

- Slug público, logo, portada, paleta, tipografía y perfil configurable.
- Servicios y proyectos reales enlazados.
- Carriles con controles, sin scrollbar nativo.
- Métricas, clientes, oportunidades y diferenciales.
- Card de verificación y página independiente.
- Responsive y una sola cabecera/footer global.

Riesgos:

- “5+ años” y “100%” siguen siendo valores declarativos, no calculados.
- La verificación confirma perfil/workspace, no cumplimiento legal o certificaciones externas.
- Oportunidades fallback pueden parecer reales cuando no existen job posts.
- Falta historial de verificaciones, entidad verificadora, fecha, evidencia y vencimiento.

### 6.4 Red operativa/profesional — 70%

Coexisten dos superficies deliberadamente separadas: `/red` como directorio público de perfiles descubribles y `/portal/red` como red privada con profesionales, empresas y grupos dentro de workspaces autorizados. La web pública incorpora búsqueda, filtros, paginación, acceso desde header, home y footer, ficha enlazada al CV vivo y retorno “Buscar más perfiles” desde cada CV.

Es útil porque reduce búsqueda manual y conecta identidad, experiencia y disponibilidad con un workspace real.

No debe crearse un tercer directorio. La siguiente evolución debe añadir oportunidades y acciones empresariales sobre estas dos superficies, respetando la diferencia entre descubrimiento público y colaboración autorizada.

Recomendación:

- Empresas: profesionales, empresas y oportunidades.
- Profesionales: oportunidades, empresas, profesionales y equipos de trabajo.
- Búsqueda global por habilidad, industria, ubicación y disponibilidad.
- Resultados solo según visibilidad y membresía.
- Acciones: ver, contactar, invitar a proyecto, postular, guardar.
- No mostrar activos físicos hasta tener inventario, ubicación, propietario, estado y calendario.

### 6.5 CV vivo y perfil profesional — 84%

Incluye username público, cabecera, resumen, experiencia, educación, proyectos, capacidades, documentos, redes, configuración de visibilidad, detalles extendidos, SEO, Open Graph y PDF.

Fortalezas:

- Modelo de perfil rico.
- Experiencias y educación verificables/referenciables.
- CV público por secciones.
- PDF generado.
- Evidencias y proyectos asociados.
- Privacidad configurable.

Pendiente:

- Estandarizar qué significa “verificado”.
- Pruebas visuales del PDF y de todas las variantes.
- Flujo de revocación o caducidad de validaciones.
- Métricas de uso y conversión del CV.

### 6.6 Worklog, evidencia y campo — 78%

Incluye entradas, tipos, skills, evidencia multimedia, comentarios, reacciones, validaciones, WebAuthn, asistencia, geocerca y archivos protegidos.

Es uno de los diferenciadores más importantes.

Riesgos:

- Geolocalización y WebAuthn son flujos de alta sensibilidad; requieren política de retención y consentimiento explícito.
- La cobertura de pruebas existe por scripts de aislamiento, pero no es una suite integrada de CI.
- Falta observabilidad sobre fallos de carga, almacenamiento y validación.
- Deben definirse límites de tamaño, antivirus y moderación de evidencia.

### 6.7 Proyectos — 67%

Modelo completo: cliente, empresa, oportunidad, venta, miembros, progreso, hitos, tareas, documentos, worklogs, conversaciones, reuniones, equipos, coordenadas y visibilidad pública.

Funciona:

- CRUD administrativo.
- Conversión desde venta.
- Imágenes y detalle público.
- Progreso y miembros.
- Asociación con experiencias profesionales.

Falta:

- Vista operativa unificada de proyecto.
- Dependencias, cronograma, presupuesto y control de cambios.
- Permisos finos por miembro.
- Alertas, SLA y automatizaciones.
- Pruebas de concurrencia en actualizaciones.

### 6.8 CRM y operación comercial — 70%

Incluye empresas, contactos, clientes, leads, notas, oportunidades, cotizaciones, ventas, comisiones, actividad y conversión entre entidades.

Fortalezas:

- Pipeline real y persistente.
- Conversión lead → oportunidad → cotización → venta → proyecto.
- Roles comerciales.
- Reportes básicos y CSV.

Riesgos:

- Varias conversiones complejas no están encapsuladas completamente en una única transacción.
- Falta idempotencia explícita para comandos repetidos.
- Falta historial inmutable de cambios comerciales.
- No hay integración contable/tributaria.

### 6.9 Cotizaciones, pedidos y checkout — 58%

El checkout es consultivo B2B, no una pasarela de pago completa.

Funciona:

- Carrito local.
- Validación de productos, precio y stock.
- Creación de pedido y cliente.
- Opciones banco/tarjeta/contraentrega como intención.
- Cotizaciones públicas por token, aceptación/rechazo y PDF.
- Estados de pedido, venta y comisión.

No existe o no está validado:

- Procesador de pagos real.
- Webhooks de pago.
- Idempotency keys.
- Reserva atómica/decremento seguro de stock.
- Reembolsos y conciliación.
- Facturación electrónica.
- Cálculo tributario robusto.

Dictamen: útil para venta asistida; no apto para custodiar fondos ni confirmar pagos automáticamente.

### 6.10 Vendibles — 63%

Vendibles detectados:

1. Productos físicos con variantes, precio, moneda, stock, alquiler y cotización.
2. Servicios profesionales/técnicos con categoría, beneficios, entregables, tecnologías y cobertura.
3. Alquiler de equipos representado como atributo comercial del producto.
4. Cotizaciones B2B personalizadas.
5. Membresías/planes modelados, pero sin cobro automático.
6. Acceso de cliente derivado del checkout.
7. Oportunidades y convocatorias como mercado de trabajo, sin comisión transaccional cerrada.

Cada vendible necesita ficha de definición: propietario, precio, impuestos, disponibilidad, SLA, cancelación, evidencia de entrega y responsable de soporte.

### 6.11 Portal del cliente — 58%

Tiene acceso, pedidos, cotizaciones, proyectos, documentos, tickets, operaciones y perfil.

Problemas:

- Conviven portal profesional, cliente y workspace con recorridos distintos.
- La navegación del cliente es más limitada y no incorpora Red operativa.
- Algunos enlaces usan anchors y superficies compartidas difíciles de entender.
- Debe diferenciar cliente comprador, empresa administradora y profesional.

### 6.12 Mensajería, comunidad, equipos y reuniones — 64%

Existe mensajería directa, conversaciones, participantes, grupos/equipos, invitaciones, foros, respuestas, chat interno, chat comercial y reuniones Jitsi.

Es útil, pero la propuesta está fragmentada.

Mejora prioritaria: una bandeja de actividad que agrupe mensajes, invitaciones, comentarios, validaciones y reuniones con contexto de proyecto/workspace.

### 6.13 Documentos, archivos y notas — 72%

Incluye documentos profesionales, archivos privados de workspace, notas, documentos de cliente y evidencia. Hay namespaces de almacenamiento separados y scripts de aislamiento.

Pendiente:

- Antivirus/malware scanning.
- Retención, borrado y versionado.
- Cuotas por plan.
- Registro de descargas y acceso.
- Clasificación de información sensible.

### 6.14 Chatbot e IA — 43%

Existe chatbot basado en conocimiento local y proveedor opcional Ollama/OpenAI para resúmenes.

Útil como soporte de búsqueda y FAQ. No debe tomar decisiones, validar perfiles ni generar datos empresariales sin revisión.

Falta evaluación formal, trazabilidad de respuestas, moderación, costos y política de datos.

### 6.15 Analítica y automatización — 43%

Hay dashboard, reportes de ventas, métricas y módulo `ANALYTICS`. `AUTOMATIONS` existe como código de módulo, pero no se observa un motor completo de reglas, eventos, colas, reintentos y auditoría.

No presentar automatización como capacidad madura hasta implementar ejecución observable e idempotente.

## 7. Auditoría de controles y botones

El anexo `interface-controls.csv` contiene los 657 controles detectados. Debe revisarse por lote con estas clasificaciones:

- Navega correctamente.
- Ejecuta acción persistente.
- Solo cambia estado local.
- Placeholder o sin implementación.
- Acción destructiva con confirmación.
- Transmite datos sensibles.
- Requiere permiso/rol.
- Requiere estado loading/error/success.

Hallazgos transversales:

- Existen botones funcionales de filtros, vistas, carriles, formularios, CRUD y engagement.
- El uso combinado de `<Button asChild>`, server actions y componentes impide validar solo buscando `<button>`; por eso el inventario incluye enlaces, forms e inputs.
- Cada acción destructiva debe comprobar confirmación, ownership y revalidación.
- Cada formulario debe tener validación cliente/servidor, errores accesibles y protección contra doble envío.
- Los CTA públicos deben instrumentarse y resolver a una intención inequívoca.

## 8. Seguridad

Fortalezas:

- NextAuth y Prisma adapter.
- Roles y guards administrativos.
- Guards de usuario y workspace.
- Módulos por workspace.
- Índices y restricciones únicas.
- Transacciones en registro, equipos, field verification, documentos y checkout de workspace.
- Headers `DENY/SAMEORIGIN`, `nosniff` y referrer policy.
- Almacenamiento separado por tipo de medio.

Riesgos críticos:

- No se observa CSP completa.
- No hay rate limiting global evidente.
- No hay protección CSRF personalizada para APIs fuera de las garantías del framework.
- No hay idempotencia financiera explícita.
- El stock puede sufrir concurrencia si dos pedidos se confirman simultáneamente.
- Faltan logs de auditoría para cambios de permisos y operaciones sensibles.
- La variable de IA puede enviar contenido a proveedor externo; requiere política y consentimiento.
- WebAuthn/geolocalización necesita documentación legal y de privacidad específica.

## 9. Arquitectura y calidad

Stack: Next.js 15, React 19, TypeScript, Prisma/PostgreSQL, NextAuth, Netlify, Netlify Blobs, Zod, Jitsi y WebAuthn.

Fortalezas:

- Tipado estricto y modelos ricos.
- Separación por rutas públicas, comercio, portal y admin.
- Componentes de dominio reutilizables.
- Validaciones Zod.
- Server actions y APIs según superficie.

Deuda:

- `admin-actions.ts` supera una responsabilidad razonable y concentra demasiadas operaciones.
- Varias páginas contienen consultas, reglas y UI en un mismo archivo.
- Coexisten componentes antiguos y nuevos.
- No hay suite unificada Jest/Vitest/Playwright.
- No hay pipeline CI visible en GitHub Actions.
- El conteo de rutas y controles exige automatización permanente.

## 10. Infraestructura y despliegue

Producción usa Netlify con plugin Next.js y Node 22. El middleware separa dominios público, portal, API y admin.

Importante:

- Push de código, migración de base de datos y conectividad runtime son operaciones separadas.
- Históricamente hubo fallos de conexión Prisma; `safeDb` evita caídas públicas, pero no sustituye conectividad.
- Deben verificarse commit publicado, build, health endpoint y rutas críticas en cada release.

Falta:

- CI con typecheck, lint, tests y build.
- Migraciones automáticas controladas.
- Entorno staging estable.
- Error tracking y APM.
- Alertas de DB/Blob/API.
- Backups y restore drill documentados.

### Resultado de validación técnica del corte

| Control | Resultado | Observación |
|---|---|---|
| `npm run typecheck` | Aprobado | TypeScript no reportó errores. |
| `npm run build` | Aprobado | Prisma Client y el build optimizado de Next.js terminaron correctamente. |
| `npm run check:encoding` | Aprobado | No se detectaron problemas de codificación. |
| `npm run lint` | No aprobado | 21 advertencias; la política `--max-warnings=0` las trata como fallo. |
| `git diff --check` | Aprobado | No se detectaron errores de whitespace en los cambios auditados. |

Las 21 advertencias se concentran en:

- 17 imports, variables y componentes no utilizados en el perfil empresarial público, evidencia de código residual tras los rediseños.
- 1 import no utilizado en la página de verificación.
- 3 usos de `<img>` en documentos y CV público que evitan la optimización estándar de imágenes de Next.js.

El build tolera estas advertencias, pero una entrega con criterio de calidad estricto no está verde hasta eliminarlas.

## 11. Plan para alcanzar 80%

### Fase 1 — Consolidación crítica

- CI obligatorio: encoding, typecheck, lint, build y tests de aislamiento.
- Suite Playwright de recorridos críticos.
- Auditoría de los 657 controles.
- Matriz de roles/módulos/acciones.
- Idempotencia y stock transaccional.
- Observabilidad y error tracking.
- Eliminar superficies duplicadas y placeholders.

Impacto estimado: +6 puntos.

### Fase 2 — Recorridos de valor

- Empresa crea oportunidad → encuentra profesional → invita → forma equipo → ejecuta proyecto → valida worklog.
- Cliente cotiza → acepta → sigue pedido/proyecto → recibe documentos.
- Profesional completa perfil → obtiene validación → postula → registra evidencia → actualiza CV vivo.
- Red operativa unificada con búsqueda autorizada.

Impacto estimado: +5 puntos.

### Fase 3 — Comercialización SaaS

- Planes y límites aplicados.
- Suscripción y facturación.
- Onboarding por plantilla.
- Métricas de activación, retención y conversión.
- Centro de ayuda y soporte.

Impacto estimado: +3 puntos.

### Fase 4 — Activos y automatización

- Modelo real de activos/equipos: propietario, ficha, estado, ubicación, disponibilidad, mantenimiento y reserva.
- Automatizaciones event-driven con reintentos, idempotencia y logs.

Impacto estimado: +2 puntos.

Resultado esperado: 80% con un producto coherente y vendible, antes de ampliar más módulos.

## 12. KPIs recomendados

- Workspaces activados y activos a 7/30 días.
- Tiempo hasta primer proyecto.
- Perfiles completados y verificados.
- Oportunidades publicadas y cubiertas.
- Invitaciones aceptadas.
- Worklogs con evidencia validada.
- Cotización → aceptación → venta → proyecto.
- Tiempo de respuesta comercial.
- Pedidos fallidos por stock.
- Retención por módulo.
- Errores por ruta y latencia p95.
- Incidentes de aislamiento: objetivo 0.

## 13. Decisiones recomendadas

1. Sí avanzar con Red operativa, evolucionando `/portal/red`.
2. No construir otro directorio paralelo.
3. No mostrar activos disponibles hasta crear inventario real.
4. Mantener el comercio como consultivo hasta implementar pagos seguros.
5. Priorizar recorridos completos y pruebas antes de nuevas pantallas.
6. Usar este informe y sus CSV como baseline de avance.

## 14. Limitaciones de este corte

- Inventario estático exhaustivo del código, pero no todas las 657 acciones fueron ejecutadas con todos los roles y estados de datos.
- No se realizó pentest externo.
- No se verificaron backups ni recuperación de desastres.
- No se auditó cumplimiento legal por jurisdicción.
- Los porcentajes deben actualizarse después de pruebas end-to-end y métricas de producción.

Estas limitaciones no invalidan la matriz; definen el trabajo necesario para convertirla en certificación operativa.
