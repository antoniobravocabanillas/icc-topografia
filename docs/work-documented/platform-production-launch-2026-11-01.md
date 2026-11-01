# Publicacion gradual B1-B3

Publicacion confirmada el 1 de noviembre de 2026. Autorizacion explicita del usuario: ocho reconciliaciones historicas, siete migraciones nuevas y lanzamiento B1-B3; B4/B5 cerrados. Daybreak omitido.

- Commit publicado: `a9520b5cd049ff1b205732929bb832ce6ba51bdd`.
- Netlify produccion: `2d38524a-44f9-4473-8a1f-9270e03bc2bf`.
- Deploy publicado y ready: `6ae5056ee67ba8b2881f8830`; publicacion automatica desbloqueada tras validar.
- CI: `41127648726` y `41127644561`, ambos success.

## Base de datos

El 30 de octubre se comparo el catalogo con el ensayo y las 1901 filas con el respaldo privado recuperado. Se reconciliaron los ocho bootstraps mediante Prisma y se aplicaron las siete migraciones autorizadas. Comparacion posterior de las 121 tablas de aplicacion: datos anteriores conservados, 53/53 bitacoras con revision inicial correcta, cero indices invalidos. Entrada historica rolled_back conservada.

Lectura fresca del 1 de noviembre: 43 migraciones exitosas, cero pendientes, cero incompletas, cero diferencias de checksum; 153 tablas, sin tablas ni columnas del modelo ausentes. No se repitieron las migraciones ni se ejecuto SQL de drift.

## Correccion durante la salida

El primer candidato produjo UntrustedHost en Auth.js: AUTH_URL vacia anulaba AUTH_TRUST_HOST por la precedencia nullish del proveedor. Se retiro solamente el valor productivo de AUTH_URL, conservando otros contextos y credenciales. El guard de produccion ahora rechaza overrides presentes incluso vacios. La prueba usa setEnvDefaults del Auth.js instalado y reproduce tanto el fallo como el comportamiento correcto.

El 1 de noviembre se encontro publicado el primer candidato, no la pagina de mantenimiento indicada en el handoff anterior. Se verifico el candidato corregido antes de promoverlo. No se atribuye la republicacion intermedia a una persona o proceso sin evidencia.

## Verificacion final

- Typecheck, ESLint y contrato del gate aprobados; build Netlify y ambos CI aprobados.
- 17 controles HTTPS aprobados: sitio, portal, acceso empresarial, red, salud API, proveedores OAuth y sesion anonima, protecciones 401 y recursos inexistentes/cerrados 404.
- Google: inicio de autorizacion y callback correctos para portal y admin. No se completo identidad Google ni se creo una cuenta real; no equivale a probar el callback autenticado completo.
- Chromium: login escritorio y cambio a registro movil a 390x844 revisados visualmente; cero errores/advertencias de consola. Capturas en output/playwright/launch-login.png y launch-register-mobile.png.
- B1-B3 activos; B4/B5, proveedor de analisis y cohorte permanecen cerrados.

Evidencia local: output/production-migration-preflight.json, production-migration-applied.json, production-schema-readback.json, production-launch-cloud-state.json y production-launch-smoke.json. El primer smoke fallido se conserva separado en production-launch-smoke-first.json.

## Limites y siguiente fase

Esta publicacion cierra la primera salida autorizada, no el 100% de todas las fases del producto. Permanecen las decisiones y validaciones de B4/B5, QA fisico/lector de pantalla, recuperacion fuera del equipo, inventario de blobs y resolucion segura de PUT ambiguo. La revocacion fue probada en staging; no se modificaron selecciones de clientes en produccion para repetirla. No se realizaron cobros ni cambios de planes/clientes.

Rollback de aplicacion: conservar el esquema expandido y los datos nuevos; no restaurar un respaldo sobre escrituras posteriores. El primer candidato b75 tiene el fallo de entorno documentado y no debe volver a publicarse como solucion de acceso. No volver a aplicar el manifiesto de migraciones ya cerrado.
