# Dependencias reproducibles y validacion Zod

GitHub Actions reprodujo un bloqueo real de `npm ci` con npm 10: faltaba el
peer opcional `picomatch@4.0.7` de `netlify-cli`. Se completo el lockfile sin
cambiar versiones ajenas ni eliminar metadatos libc. Netlify usa npm 10.9.9
explicito; instalaciones posteriores con npm 11 requieren revisar que no
eliminen de nuevo ese peer. La comprobacion npm 10 `ci --dry-run` aprobo.

El siguiente gate detecto GHSA-mrhx-c7xc-m3w5 (severidad alta) en Zod 3.
Se actualizo la dependencia de aplicacion a 4.6.7 y se adaptaron records con
tipo de clave explicito y el valor inicial anidado del CV con `prefault`.

Zod 4 aplica defaults tambien dentro de propiedades opcionales. Para conservar
PATCH sin modificaciones no solicitadas, los esquemas de edicion de productos,
categorias, servicios, publicaciones y FAQ eliminan los defaults de creacion
antes de volverse parciales. El contrato demuestra que editar un nombre no
reinicia inventario, politica de cotizacion, imagenes ni publicacion.

La regresion de seguridad usa 10 000 elementos sobre un array limitado a seis:
rechazo con una sola incidencia y cero validaciones por elemento. Tambien se
prueban entradas validas, negativos, registros tipados, defaults anidados y
rechazo estricto de campos desconocidos. Typecheck, lint y contratos locales
aprobaron. La auditoria de produccion pasa el umbral moderate con siete avisos
bajos pendientes de evaluacion: cadena de atestacion en SimpleWebAuthn y
deepmerge transitivo de renderizado de correo. No se aceptaron ni ocultaron.

Fuentes: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 y
https://zod.dev/v4/changelog. El gate remoto aun debe completar build y E2E.

Netlify preparo Chromium tras retirar la instalacion privilegiada de paquetes
del sistema. El siguiente fallo fue agotamiento del heap de Node durante
TypeScript; se asignan 4096 MiB al proceso de build. No se cambia memoria de
funciones serverless, plan contratado ni datos de clientes.

## Renderizado de correo

Se actualizo `@react-email/render` a 2.2.0. Esta version usa `html-to-text` 10
y elimina `deepmerge` de la cadena de dependencias de produccion del correo.
La auditoria de produccion queda en cuatro avisos bajos, todos asociados al
mismo advisory de SimpleWebAuthn y sus dependientes Auth.js; no hay avisos
moderados, altos ni criticos. No se forzo una version incompatible de WebAuthn.

El contrato renderiza las plantillas reales de verificacion por enlace,
codigo y perfil pendiente/verificado. Comprueba escape HTML, enlace completo
en texto plano, codigo con cero inicial y estado correcto de verificacion.
No envia correo. Aprobaron contrato, TypeScript, lint focalizado y la
resolucion reproducible de npm 10 (`ci --dry-run`).

Referencia de la actualizacion:
https://github.com/resend/react-email/releases/tag/@react-email%2Frender@2.2.0
