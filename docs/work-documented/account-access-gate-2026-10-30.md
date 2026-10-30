# Acceso publico y controles del candidato

Fecha: 30 de octubre de 2026. Continuacion de plataforma sin Daybreak.
Estado del cierre final: aprobado en local, pendiente del gate remoto.

## Problemas reproducidos y correcciones

- Con `prefers-reduced-motion: reduce`, el registro quedaba invisible: el
  selector `.is-register` conservaba `rotateY(-180deg)` con mas especificidad
  que la alternativa sin movimiento. Se neutraliza tambien ese selector.
- Al cambiar entre acceso y registro, el foco terminaba en `body`. Ahora pasa
  al encabezado de la cara activa despues de retirar `inert`, sin autofocus
  inicial ni perdida de los valores escritos. Los paneles son regiones
  etiquetadas; ya no anuncian todo su contenido como una unica region viva.
- El registro dependia de placeholders. Se agregaron etiquetas persistentes,
  ayuda asociada al cargo, identificadores unicos y estado `aria-pressed` en
  la seleccion profesional/empresa. Los selectores usan etiquetas externas
  para no incorporar las opciones completas a su nombre accesible.
- Los avisos dinamicos del acceso usan `alert` o `status`. Se mejoraron el
  contraste del boton principal, los placeholders y el foco visible, y el
  objetivo tactil del control de contrasena mide 44 px.
- Entre 561 y 767 px, el footer conservaba `display:flex` mientras su regla
  movil quitaba el espaciado. Ahora activa su grid de una columna tambien
  en ese intervalo, conservando destinos y contenido.

Se conserva la fotografia, el giro para quienes no reducen movimiento, la
altura compartida de las caras, el header, el footer y los proveedores sociales
existentes. No se cambiaron autorizacion, endpoints, datos ni reglas de registro.

## Validacion reproducible

`npm run test:account-access-browser -- --build`

Compila Next.js y ejecuta Chromium contra `127.0.0.1:3218`. El proceso hereda
solo variables del sistema operativo, usa un secreto efimero y una URL de DB
deliberadamente inaccesible en loopback. Aparta y restaura `.env`/`.env.local`
con el lock del runner de staging. Requiere checkout exclusivo; no admite
archivos `.env.production` o `.env.production.local`. Conserva las mismas
limitaciones de recuperacion ante una terminacion forzada que el runner de
staging. No habilita OAuth, correo, proveedor de IA ni fixtures de base de datos.

El navegador bloquea destinos externos y metodos distintos de GET. Comprueba:

- 320, 390, 640 y 1440 px, con movimiento normal y reducido.
- Acceso, registro profesional, empresa y otro documento: 32 estados.
- Dos estados adicionales con texto al 200 %; no se presenta esto como prueba
  de zoom nativo del navegador ni como prueba de lector de pantalla fisico.
- Axe WCAG 2 A/AA y 2.1 AA limitado al panel, etiquetas, ausencia de overflow,
  botones sin texto recortado, foco, conservacion de valores, validacion HTML
  y aviso de acceso seguro sin correo. El footer comprueba objetivos de al
  menos 44 px y filas separadas en el intervalo movil.
- Cero mutaciones HTTP y errores de JavaScript; restauracion antes de PASS.

Resultado final: 34 estados aprobados, cero infracciones reportadas por axe en
el panel, build Next.js con 100 paginas generado, typecheck y ESLint aprobados.
La generacion estatica registra intentos de lectura a la DB ficticia que
terminan en el fallback previsto; no demuestra contenido con datos reales.
Este build usa URLs locales y no es un artefacto para desplegar: staging debe
compilar de nuevo con su configuracion aislada. El backend de autenticacion,
la entrega de correo y OAuth no se ejercitan en este recorrido.

Evidencia local ignorada por Git: `output/playwright/account-access-gate/`.
El reporte `report.json` y las capturas deben leerse junto con `server.log` y
la salida final del proceso: un reporte parcial no equivale a un gate aprobado.
Los assets de `output/playwright/account-access/` conservan la reproduccion
anterior y el primer recorrido de confirmacion en desarrollo.

El detector Impeccable no encontro avisos en los componentes modificados.
Sus dos avisos sobre CSS global corresponden a reglas existentes fuera del
acceso; no se amplio este parche a un rediseno de esas superficies.

## Higiene del candidato

El gate general rechazo `.env.platform-staging.example` despues de que la
plantilla quedara versionada. El PASS anterior al commit no cubria ese estado
del indice Git. Se admite exclusivamente ese nombre adicional y se exige que
DB, secretos, cohortes y consentimientos operativos esten vacios. OAuth,
correo y analisis permanecen apagados en la plantilla. Otros `.env` privados
de la raiz siguen rechazados; se conserva el alcance original de esa politica.
Los errores no imprimen valores rechazados. Hay pruebas negativas para
credenciales, tokens adicionales, multilinea, campos ausentes y consentimientos.

`npm run test:terraqo-local-contracts` aprobo los 42 controles no mutantes.

## Limite de cierre

Este trabajo no reemplaza el recorrido B1-B5 contra el candidato de staging,
la reconciliacion operativa de PUT ambiguo, los dispositivos/lectores reales ni
las firmas de salida. Sigue ausente `.env.platform-staging.local`. No se han
desplegado estos cambios ni aplicado migraciones, cobros o cambios sobre datos
reales. El ultimo porcentaje formal de preparacion permanece en 68/100.

El scan sellado de `7d22378` conserva su alcance original; no se presenta como
una nueva auditoria del parche de interfaz o del runner incorporado aqui.
