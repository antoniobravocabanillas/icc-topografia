# TERRAQO: archivo público y presentación profesional

## Alcance

Esta entrega mejora la portada, la navegación pública, el directorio, las métricas del CV y el explorador de bitácoras. Conserva la identidad TERRAQO y sus fotografías y registros reales. No modifica ICC, el esquema Prisma ni las reglas de autorización del servidor.

## Archivo de evidencias

- Lista compacta con ocho registros por página y detalle independiente en escritorio.
- Calendario por mes, días en zona America/Lima y conteos que respetan búsqueda, tipo, proyecto y revisión.
- Búsqueda sin distinción de acentos; tipo de actividad separado del estado de revisión.
- Estado navegable en URL. Compatibilidad con enlaces antiguos #id y actuales ?registro=id.
- Compartir abre el registro sin arrastrar los filtros de quien comparte; alternativa visible si el portapapeles falla.
- Diseño móvil de lista/detalle con retorno a resultados, foco y posición preservados.
- Mensajes explícitos cuando no hay resultados o el enlace no corresponde a un registro público.

## Presentación y credibilidad

La cabecera usa la misma navegación y acción principal en todas las páginas. La portada mantiene las bitácoras reales, reduce efectos y sustituye cifras y perfiles ilustrativos que podían parecer datos reales. El CV muestra cantidades y alcance de revisión en lugar de un porcentaje compuesto de confianza. Los archivos y referencias se cuentan separados de los registros. El directorio reduce el peso del encabezado y muestra filtros etiquetados.

## Validación

Ejecutar después de npm ci y npx prisma generate:

```sh
npm run typecheck
node --import tsx scripts/test-public-activity-navigation.ts
```

La prueba contiene 18 aserciones sobre fechas de Lima, filtros combinados, enlaces antiguos, selección inexistente, entrada inválida y serialización de URL. Se revisó el componente real en navegador con 22 registros sintéticos aislados y selección en calendario. La ruta y los datos temporales no forman parte de la entrega.

Antes de publicar, comprobar en staging con datos autorizados: fotografías, descarga, compartir, Atrás/Adelante, enlaces antiguos, estados vacíos, teclado y pantallas móviles de 360–430 px. No se realizó una validación de extremo a extremo con la base de datos de producción.

## Límite y siguiente etapa

La paginación es de presentación sobre el conjunto público que ya entrega el servidor; no reduce todavía la carga de datos. Antes de escalar a miles de registros, implementar paginación por cursor y filtros en servidor, conservando las reglas de visibilidad existentes. Obtener agregados diarios por separado para el calendario, y resolver un enlace directo con una consulta autorizada por identificador. No limitar la consulta antes de calcular filtros y totales porque produciría conteos incompletos.

Un futuro analizador debe vincular cada conclusión a sus registros de origen, distinguir declarado de revisado y explicar el alcance del respaldo. No convertir cantidad de actividad, falta de datos o revisión documental en un ranking automático de empleabilidad.

## Integración

Revisar esta rama contra codex/icc-production-preview. No requiere migraciones. Desplegar primero en staging; para revertir, revertir el commit de interfaz. No se incluyen cambios en secretos, dependencias, scripts de arranque ni permisos.
