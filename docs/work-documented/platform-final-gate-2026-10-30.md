# Cierre de correcciones y siguiente gate de plataforma

Fecha: 30 de octubre de 2026. Daybreak omitido por indicacion del usuario.

## Continuacion: acceso publico y control de plantillas

El parche posterior a `b390c3c` corrige el registro invisible con movimiento
reducido, el foco perdido al cambiar formulario, las etiquetas de registro,
el contraste y la separacion de enlaces del footer en el intervalo movil.
El nuevo gate de Chromium aprueba 34 estados sobre un build local aislado,
con cero infracciones de axe en el panel, sin HTTP mutante ni fixtures de DB.
Tambien se corrigio el rechazo de la plantilla de staging ya versionada:
se admite su nombre exacto y se exigen secretos y consentimientos vacios.
Los 42 controles locales actuales aprobaron. Evidencia, limites y comando
reproducible: `account-access-gate-2026-10-30.md`.

El transporte cloud ya permite validar staging sin `.env.platform-staging.local`;
el detalle y los candidatos remotos estan en `platform-cloud-gate-2026-10-30.md`.
El scan sellado descrito abajo
corresponde a `7d22378`, no al nuevo parche de interfaz/herramientas. El build
de esta comprobacion usa URLs localhost y DB inaccesible; debe reconstruirse
para staging antes de cualquier despliegue. No cambia el HOLD de publicacion.

## Evidencia previa cerrada

- Codigo de aplicacion inmutable: `7d22378f353f1a82b42afe790f576acce83296ae`.
- Revision final del delta `fc28df9..7d22378`: scan
  `f7e35ef7-06e3-41c2-826a-c1c45252586c`, sellado, cero hallazgos nuevos.
  Cobertura: siete archivos fuente y los dos documentos modificados.
  Incluyo revision independiente de arquitectura y de discovery/cargas.
- Esta revision complementa los scans anteriores; no es una nueva auditoria
  global ni una certificacion del comportamiento remoto.
- Typecheck aprobado, ESLint sin advertencias, build previo del mismo codigo
  de aplicacion aprobado. El gate local actualizado aprobo 41 controles.
- El runner adicional solo afecta herramientas de validacion, no las rutas
  desplegadas. Su test ejecuta el preflight real en un proceso hijo y confirma
  que un gate sin consentimiento falla antes de acceder a PostgreSQL.

## Verificacion remota de solo lectura

- Supabase `Terraqo Platform Staging`, ref `mghdpciewbsowjrjwmwk`:
  `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Ledger: 43 migraciones, cero incompletas. Usuarios, workspaces y jobs de
  analisis: cero filas en la comprobacion de este corte.
- Netlify: Site ID `6b8c43fb-6083-450a-9b85-46a820fb6358`, sitio
  `terraqo-platform-staging`, deploy `6ae48fb98b1bbb5e470b8d01`, estado `ready`.
  Sigue siendo el candidato anterior; no contiene las ultimas correcciones.
- La API devuelve los secretos de entorno enmascarados. No se intentaron usar
  esas mascaras como credenciales ni se rotaron secretos.

## Transporte local preparado

`npm run gate:platform-staging -- preflight` lee exclusivamente
`.env.platform-staging.local`. La plantilla versionada es
`.env.platform-staging.example`; el archivo con valores queda ignorado por Git.

El runner conserva literalmente `$`, `${...}` y texto de shell dentro de los
valores. No evalua el archivo, no usa shell, no hereda credenciales de la
aplicacion, `NODE_OPTIONS`, proxies ni `NETLIFY_AUTH_TOKEN`. Solo permite los
scripts enumerados y el destino exacto de staging, con su rol runtime.
Los secretos se pasan por el entorno del proceso hijo y su salida sin filtrar
no se imprime. El estado PASS/FAIL no sustituye el readback independiente de
datos y comportamiento remoto.

La revision independiente reprodujo una segunda entrada: Prisma carga `.env`
durante su inicializacion aunque reciba `DATABASE_URL` por el entorno y puede
expandir `${...}`. El runner aparta temporalmente `.env` y `.env.local` antes
de iniciar el hijo, con lock exclusivo, y los restaura al terminar. Ante un
archivo concurrente preserva ambos y exige recuperacion; nunca sobrescribe.
El test usa el cliente Prisma instalado con un dotenv sintetico: demuestra
el fallo sin aislamiento y confirma secreto literal y ausencia de variables
ajenas despues de instanciar Prisma con el aislamiento activo. No conecta DB.
La revision final independiente cerro los problemas encontrados bajo la
condicion de checkout exclusivo. La restauracion usa hard links atomicos que
fallan si el destino existe; PASS solo se informa despues de restaurar.
Typecheck, lint focalizado, el contrato del runner y los 41 controles locales
aprobaron. El preflight real sin archivo local termino cerrado antes de
iniciar un proceso de prueba, como corresponde.

No ejecutar otros builds o gates sobre este checkout durante esa ventana.
Una terminacion forzada del proceso principal puede dejar el lock y archivos
`.platform-gate-hold.local`; se conservan para recuperacion, sin reintento
automatico ni borrado de credenciales.

Los modos son `preflight`, `b1-b2`, `b3`, `b4`, `b5-readiness` y `b5-dispatch`.
Cada runner conserva sus consentimientos exactos, flags y cohorte requeridos.
Esta herramienta no despliega, aplica DDL, configura proveedores ni autoriza
automaticamente un fixture. No ejecutar todos los modos con una configuracion
unica: deben coincidir con la fase desplegada y sus prerrequisitos.

## Bloqueos actuales y orden de cierre

1. Transporte resuelto: Netlify ejecuta los gates con los secretos existentes
   del sitio aislado. B1-B3 aprobaron sobre `3c230a1`, con limpieza independiente.
2. Completar B4 sobre el candidato revisado solo en el Site ID aislado y
   ejecutar B5 combinado por HTTPS + background worker + PostgreSQL, con
   proveedor y datos sinteticos autorizados. Verificar limpieza y restaurar
   proveedor/cohorte/flags al estado de cierre previsto.
3. Demostrar reconciliacion operativa de PUT ambiguo antes de liberar cuota.
   El codigo conserva su registro y presupuesto hasta tener certeza; el
   mero vencimiento o un DELETE exitoso no demuestran cancelacion del PUT.
4. Accesibilidad con lector de pantalla y teclado en dispositivo fisico.
   `adb devices -l` no detecto dispositivos. Docker Desktop arranco, pero su
   engine Linux no respondio; no se recrearon bases ni se aplicaron migraciones.
5. Aprobar cohorte, limites comerciales, riesgos residuales y firmas de
   producto, seguridad, operacion y responsable tecnico. Despues corresponde
   la autorizacion concreta de publicacion.

No se ejecutaron migraciones, despliegues productivos, cobros ni cambios sobre
clientes reales. La publicacion permanece en HOLD; cerrar una revision local
no equivale al 100 % del gate de salida.
