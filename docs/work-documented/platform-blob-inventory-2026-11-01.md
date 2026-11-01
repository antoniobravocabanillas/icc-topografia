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
