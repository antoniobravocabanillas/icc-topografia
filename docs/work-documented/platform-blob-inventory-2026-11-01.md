# Inventario externo posterior al lanzamiento

Lectura real del 1 de noviembre de 2026 sobre el sitio productivo explicito. Deploy observado: `6ae5056ee67ba8b2881f8830`. Sin modificaciones, descargas de contenido ni exposicion de claves de objetos o credenciales.

| Almacen | Objetos |
| --- | ---: |
| icc-client-logos | 33 |
| icc-product-media | 2 |
| icc-project-media | 49 |
| terraqo-message-attachments | 3 |
| terraqo-professional-avatars | 4 |
| terraqo-professional-documents | 39 |
| terraqo-worklog-evidence | 120 |
| Total | 250 |

`icc-customer-files` y `terraqo-workspace-files` estan configurados pero no fueron listados. Esto no demuestra archivos perdidos ni objetos huerfanos. Todos los almacenes encontrados corresponden al inventario del codigo.

Herramienta reproducible: `node scripts/inventory-production-blobs.mjs`. Transporte limitado a GET/HEAD, paginacion acotada, deteccion de claves repetidas y huella SHA256 del listado ordenado de claves/ETags. Resultado local sin claves ni contenido: `output/production-blob-inventory.json`.

Validacion: ejecucion real completa, comprobacion sintactica y ESLint. No es un snapshot atomico: pueden existir escrituras concurrentes. La huella identifica el listado observado; no es checksum de contenido ni respaldo recuperable.

Siguiente bloque: cruzar referencias de almacenamiento de PostgreSQL con los listados, distinguiendo referencias activas, retiradas y reservas pendientes; informar discrepancias sin borrar ni liberar cuota. Despues, preparar respaldo cifrado y ensayo de recuperacion de blobs. El respaldo DB anterior no cubre estos objetos.

B4/B5 siguen cerrados. Su gate tecnico de staging ya aprobo; resta definir cohorte y limites operativos/comerciales antes de activarlos. No se sustituyen esas decisiones con una activacion global.

## Cruce de referencias completado

`node scripts/inventory-production-blobs.mjs --references` consulta PostgreSQL mediante TLS verify-full y transaccion REPEATABLE READ READ ONLY. Seis tablas con storageKey cubiertas; incluye intentos/retiros educativos y reservas de cargas de experiencia. No se imprimen claves, tokens ni filas personales.

- Adjuntos de mensajes: 3/3 presentes.
- Evidencias de experiencia: 2/2 presentes.
- Medios de bitacoras: 118/118 presentes.
- Documentos profesionales: 39 presentes de 42 referencias. Las tres ausencias se confirmaron individualmente mediante getMetadata con consistencia strong, sin descargar contenido.
- Sin archivos de workspace referenciados, evidencias educativas, intentos educativos o reservas de experiencia en esta lectura.
- Cero objetos fuera de las referencias cubiertas en los tres almacenes con referencias encontradas. Esto no certifica los almacenes de imagenes/logos ni referencias historicas URL/JSON.

Hallazgo abierto: tres referencias de documento no tienen objeto en el almacen esperado. No se ha determinado origen, fecha de perdida ni posibilidad de recuperacion; no se atribuye a este lanzamiento. No borrar registros ni modificar cuotas para ocultarlo. Siguiente prioridad: rastrear esas tres referencias en registros de limpieza y respaldos, conservando la privacidad; completar referencias URL/JSON y preparar recuperacion externa.

Resultado: output/production-blob-reference-check.json. Ejecucion real completa y ESLint aprobados. Listado de blobs y snapshot SQL no son una transaccion conjunta; cualquier accion posterior requiere volver a comprobar el estado.
