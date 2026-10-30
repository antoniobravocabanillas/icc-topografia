# Seguimiento de seguridad y preparacion de publicacion

Fecha: 30 de octubre de 2026. Repositorio: `icc-topografia`.
Base de este complemento: `fc28df9b280537afdc7d735f20a8dc01facb1b19`.

## Evidencia inmutable

- `fc28df9` contiene las correcciones iniciales de los 12 hallazgos elegidos.
- Scan del delta: `52d75cdc-67ad-462f-86c6-95f00a3cef1c`, rango
  `ed0fefd..fc28df9`, sellado con 33/33 archivos de codigo revisados y el
  lockfile revisado por separado.
- Resultado: tres hallazgos bajos. El scan no cubre cambios posteriores a
  `fc28df9` y no acredita el funcionamiento del despliegue remoto.
- Daybreak no se utilizo ni es requisito para continuar este trabajo.

## Correcciones complementarias

1. Discovery separa tres conjuntos acotados de candidatos: texto de bitacoras
   publicas, texto expresamente permitido en selecciones y otros campos
   permitidos. Las selecciones sin coincidencia no desplazan el texto publico
   relevante. Un termino oculto no decide la pertenencia al conjunto candidato.
2. El preflight multipart limita partes y cabeceras antes de `formData()`.
   Cuenta partes vacias y campos inesperados; acepta parametros MIME adicionales,
   boundaries entre comillas, preambulo y epilogo. Conserva el limite previo de
   bytes y las comprobaciones de propietario, MIME, cuota y deduplicacion.
3. Los registros de escrituras inciertas sobreviven al vencimiento y siguen
   consumiendo presupuesto temporal. La proteccion incluye fragmentos y el
   archivo ensamblado. Una confirmacion tardia no emite un recibo valido y
   permite limpiar la carga; una respuesta de transporte ambigua conserva
   su registro para posteriores intentos de limpieza y reconciliacion.

Una carga cuyo resultado remoto no pueda confirmarse puede requerir revision
para recuperar su cuota temporal. No se elimina su registro solo porque
venza: eso volveria a permitir archivos tardios sin contabilizar.
La limpieza se ejecuta aunque el presupuesto este lleno. La liberacion
automatica de una escritura incierta no esta certificada: requiere demostrar
que el proveedor ya no puede confirmar un PUT tardio. Este caso queda como
pendiente operativo de staging, con mensaje de revision al usuario.

## Validacion local

- `npm run typecheck`: aprobado.
- `npm run lint`: aprobado, cero warnings.
- `npm run test:discovery-needs-contract`: aprobado; servicio real con
  adaptador Prisma sintetico, termino oculto conocido/desconocido, coincidencia
  exclusivamente oculta, texto publico e identidad retirada. Incluye 300
  selecciones irrelevantes anteriores a una coincidencia valida.
- `node scripts/test-worklog-photo-upload.mjs`: 14 verificaciones aprobadas;
  siete partes fallan antes de invocar el parser, mil partes pequenas fallan,
  seis fotos validas y sus reintentos siguen funcionando.
- `npm run test:experience-evidence-chunk-upload`: aprobado; commit remoto
  simulado despues de limpieza, confirmacion tardia, escritura final incierta
  y presupuesto ocupado por reservas vencidas sin resolver.
- `npm run test:terraqo-local-contracts`: 40/40 controles no mutantes.
- `npm run build`: aprobado, 100 paginas estaticas generadas.

Los adaptadores sinteticos no demuestran concurrencia de PostgreSQL remoto
ni comportamiento real de Netlify ante fallos de transporte. No hubo cambios
visuales que requieran un nuevo recorrido de interfaz en este complemento.
Una revision independiente posterior al primer parche detecto la regresion de
selecciones irrelevantes, representaciones MIME rechazadas y limpieza omitida
cuando la cuota estaba llena. Se reprodujeron como controles locales y se
ajustaron dentro del mismo alcance. No se realizo una segunda auditoria global.

## Gate de publicacion

El ultimo corte formal conserva 68/100: base tecnica y staging 40/40,
E2E/operacion 18/25, seguridad 6/20 y accesibilidad/aprobaciones 4/15.
Es un indicador de evidencia de salida, no una medida del porcentaje de codigo.
El 97 % tecnico tampoco equivale a autorizacion de publicacion.

Falta incorporar las correcciones a un candidato inmutable revisado, repetir
el recorrido combinado B5 por HTTPS, worker y PostgreSQL, comprobar dispositivos
y lector de pantalla reales y cerrar las aprobaciones de salida. Las pruebas
B1-B4 ya documentadas no se extrapolan automaticamente al nuevo candidato.

No se aplicaron migraciones, no se desplego produccion, no se ejecutaron
cobros ni se modificaron clientes reales durante este complemento.
