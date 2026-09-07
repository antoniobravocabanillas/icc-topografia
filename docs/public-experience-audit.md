# Terraqo — auditoría de experiencia pública

Fecha: 2026-09-07. Alcance: Producto, Automatización, Membresías, Red y Contacto; infraestructura común de SEO y navegación pública.

## Implementado

- Movimiento progresivo con contenido legible sin JavaScript y respeto a movimiento reducido.
- Navegación de etapas, demostración de producto y foco de teclado.
- Simulador local de tres procesos, con condición cumplida/no cumplida, reinicio y explicación de resultados. No ejecuta automatizaciones sobre datos reales.
- Selector profesional/empresa; comparación empresarial derivada del catálogo de módulos. Las membresías de pago llevan a consulta comercial, no a un cobro.
- Directorio con ordenación, filtros, expansión de contexto y enlaces a perfiles/evidencias públicas.
- Consulta comercial preparada para WhatsApp. El usuario confirma el envío en WhatsApp; no se registra como solicitud enviada al preparar el enlace.
- Metadatos, canonical, Open Graph y Twitter de secciones. Vistas previas empresariales solo con publicación explícita. Sitemap con actualización horaria de perfiles publicados.
- Protección de imágenes sociales contra orígenes arbitrarios, redirecciones y descargas sin límite.

## Evidencia local

- Compilación de producción y comprobación TypeScript: completadas.
- Cinco rutas HTTP 200; anchos 320, 390, 768, 1024 y 1440: sin desborde de documento.
- Axe WCAG 2 A/AA y 2.1 AA: cero incidencias detectadas en las cinco rutas con movimiento reducido. Producto también comprobado después de su transición normal.
- Teclado: primer foco en saltar al contenido; activación enfoca `main`. Selector de demostración actualiza su contenido.
- Simulador: caminos de condición verdadera/falsa y repetición comprobados. Comparación empresarial: 16 filas de módulos. Formulario: prepara el enlace con asunto y texto; no se envió mensaje externo.
- Pruebas deterministas: seis caminos de simulación, siete orígenes hostiles de imagen, configuración Culqi ausente/mezclada y ausencia de claves en el resultado.
- Revisión visual de capturas móvil/escritorio y corrección del contraste de pie de página y texto secundario del directorio.

Estas pruebas automatizadas no equivalen a certificación de accesibilidad ni a una prueba de penetración integral. No se simularon ataques contra servicios ajenos ni se realizaron pruebas destructivas.

## Seguridad y pendientes explícitos

Se actualizaron Next.js, Auth, adaptador Prisma y dependencias vulnerables. El análisis de dependencias de producción quedó sin avisos críticos, altos o moderados. Persisten cuatro avisos bajos relacionados con SimpleWebAuthn y dependientes: la corrección mayor requiere migrar y validar flujos de passkeys. No se declara riesgo cero.

Culqi sandbox respondió HTTP 200 a una consulta de planes, sin cargos. El propietario decidió definir los planes antes de cobrar. Checkout, renovación, cancelación, conciliación y pruebas 3DS están pendientes y no se presentan como funcionalidades activas. No hubo cambios de esquema ni migraciones de base de datos.

Los precios son referencias, no tarifas confirmadas. No se activan beneficios por una selección del navegador. Los documentos privados no se publican por cambios de SEO.

La validación de la publicación remota se debe realizar después del despliegue; este documento no presupone que una compilación local ya esté publicada.
