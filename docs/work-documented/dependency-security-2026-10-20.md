# Dependencias de producción — revisión 2026-10-20

## Hallazgo

`npm audit --omit=dev` detectó dos avisos moderados de cache poisoning para Next.js 15.5.25. Ambos quedan fuera del rango vulnerable desde 15.5.27.

## Corrección

- `next` quedó fijado exactamente en `15.5.27` tanto en `package.json` como en `package-lock.json`.
- Se ejecutó `npm audit fix` sin `--force`. Solo actualizó resoluciones compatibles del lockfile: `brace-expansion` 1.1.21 y 5.0.12, `eslint-config-next`/`@next/eslint-plugin-next` 15.5.28 y `postcss-selector-parser` 6.1.5.
- `tsx` se actualizó dentro de su misma línea mayor a `4.23.15`; con ello `esbuild` resolvió a `0.28.2` y dejó de estar dentro del aviso de lectura local arbitraria en el servidor de desarrollo de Windows.
- No se ejecutó `npm audit fix --force` ni se aceptaron cambios mayores automáticos.
- La actualización no modifica esquema, datos, despliegue ni configuración de producción.

## Riesgo residual

La auditoría de producción conserva cuatro avisos bajos derivados de `@simplewebauthn/server`, `@auth/core`, `@auth/prisma-adapter` y `next-auth`. La solución propuesta por npm implica cambios mayores —incluida la migración de WebAuthn— y debe abordarse como una fase propia con pruebas de registro, autenticación, RP ID, dispositivos existentes y recuperación de acceso.

La compatibilidad se verificó contra SimpleWebAuthn 14. `next-auth@5.0.0-beta.32` y `@auth/core@0.41.3` declaran peers opcionales de SimpleWebAuthn 9; forzar la versión 14 deja el árbol npm inválido y además requiere migrar los contratos de navegador (`optionsJSON`), credenciales servidor y resultados de registro. Por ello se conservó la línea 9 compatible. La actualización mayor queda bloqueada hasta adoptar una versión de Auth.js que admita esa línea o separar explícitamente ambas implementaciones y certificar passkeys reales en portal, admin y dominio raíz.

`scripts/test-auth-secure-proxy.ts` importa `@auth/core` directamente. Se declaró `@auth/core@0.41.3` como dependencia de desarrollo explícita para que `npm ci` no dependa del hoisting accidental de una dependencia transitiva; esto no cambia la versión usada por Auth.js.

Después de la actualización, `npm audit --omit=dev` reportó: 0 críticos, 0 altos, 0 moderados y 4 bajos. No se declara riesgo cero.

El CI ejecuta `npm audit --omit=dev --audit-level=moderate`: una regresión moderada, alta o crítica de producción bloquea el gate. La auditoría completa posterior a los ajustes compatibles reporta 13 incidencias: 4 bajas, 2 moderadas y 7 altas, todas fuera del runtime de producción salvo la cadena WebAuthn de severidad baja descrita arriba. Las incidencias de desarrollo restantes proceden de Tailwind CSS 3 y del stack ESLint/globbing; npm solo ofrece resolver las cadenas moderada/alta mediante cambios mayores automáticos. Estas herramientas procesan fuentes controladas durante desarrollo/CI y no se incluyen en el runtime desplegado; la migración a Tailwind 4 y la actualización mayor del stack lint deben realizarse en fases separadas con validación visual y funcional.

## Validación posterior

- `npm run prisma:generate`: correcto.
- `npm run lint`: correcto, sin advertencias.
- `npm run typecheck`: correcto.
- `npm run test:terraqo-local-contracts`: 32 contratos no mutantes correctos, incluidas la higiene del candidato, la política fail-closed de staging, la integración Auth.js detrás de proxy seguro, la política de orígenes de imágenes y la lectura aislada de jornadas móviles.
- `npm run build`: correcto con Next.js 15.5.27.
- `npm audit --omit=dev --audit-level=moderate`: correcto; 0 críticos, altos o moderados en producción.

## Política de imágenes remotas

- Se eliminó el patrón global `https://**` del optimizador de imágenes de Next.js para que el servidor no descargue recursos desde hosts arbitrarios.
- El único origen optimizado explícito es `images.unsplash.com` para contenido curado.
- Las URLs administrables de productos y sectores se cargan directamente con `unoptimized`; conservan compatibilidad con almacenamiento externo sin ampliar el proxy servidor.
- `npm run test:image-origin-policy` falla si reaparece el comodín o si las superficies dinámicas dejan de declarar esta separación.

El `bodySizeLimit` de Server Actions permanece en 50 MB de forma deliberada: las acciones de experiencias aceptan como máximo 6 evidencias de 8 MB (48 MB antes del overhead multipart). Reducir el límite global sin trasladar primero esas cargas a Route Handlers rompería un flujo admitido.

La inspección visual local quedó limitada por dos condiciones ajenas a esta corrección: `/tienda` y `/sectores` redirigen actualmente al home por configuración, y el runtime local no dispone de credenciales de Netlify Blobs para resolver evidencias públicas. No se usaron credenciales ni datos de producción para sortear esas barreras. El build, el tipado y el contrato de origen verifican la integración estática; la comprobación visual con medios reales debe repetirse en staging configurado.
- `npm ci` desde el lockfile, seguido de `prisma:generate`, typecheck y `scripts/test-auth-secure-proxy.ts`: correcto con el árbol Auth.js/SimpleWebAuthn compatible.
