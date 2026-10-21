# ADR-003 - Permalink canonico y archivo escalable

- Estado: aceptado
- Fecha: 15 de octubre de 2026
- Aceptacion: 16 de octubre de 2026 por instruccion del propietario del producto
- Ambito: B1 / archivo de evidencia

## Contexto

El CV publico genera enlaces legacy con `#recordId`, mientras el explorador inicializa el detalle desde `?registro=recordId`. El archivo profesional carga decenas de registros y filtra fechas en memoria. Esto no garantiza abrir un registro fuera de la primera pagina ni escala a archivos grandes.

## Decision

- Mantener lectura de `#recordId` y convertirla a la representacion canonica sin perder compatibilidad.
- Usar permalink canonico con ID de registro; el servidor valida que pertenece a la proyeccion publica solicitada.
- Resolver el registro seleccionado por ID independientemente de la pagina/cursor.
- Implementar cursor opaco estable sobre `(occurredAt DESC, id DESC)` ligado a filtros y orden.
- Calcular calendario/rangos en servidor con zona explicita y predicado de permisos identico al listado.
- Restaurar filtros, seleccion y scroll mediante estado de URL/history.

## Consecuencias

- Un registro no visible responde con estado neutral y no filtra titulo, autor ni medio.
- Cambiar filtros no reemplaza silenciosamente el registro seleccionado.
- El cliente no descarga todo el archivo para filtrar ni construir el calendario.
- B1 debe incluir pruebas de enlace legacy, permalink, cursor, zona, teclado, movil y back navigation.
