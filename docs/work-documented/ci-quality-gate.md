# Gate CI local y no mutante

Fecha: 20 de octubre de 2026.

## Alcance

`.github/workflows/quality-gate.yml` ejecuta en cada push y pull request:

1. checkout con acción fijada a un SHA inmutable;
2. Node.js 22.13.0 y caché npm;
3. `npm ci` sobre el lockfile;
4. generación explícita del cliente Prisma;
5. auditoría de dependencias de producción que rechaza severidad moderada o superior;
6. control de codificación;
7. ESLint sin advertencias;
8. typecheck;
9. contratos locales no mutantes.
10. build de producción sin credenciales ni conexión obligatoria a base.

El job tiene permisos `contents: read`, límite de 20 minutos y cancelación de ejecuciones anteriores de la misma referencia. No usa secretos, no abre bases, no aplica migraciones, no llama proveedores y no despliega.

## Defensa contra regresiones

`npm run test:ci-quality-gate` inspecciona el workflow y exige permisos mínimos, acciones fijadas por SHA, runtime, auditoría de producción, comandos obligatorios y ausencia de operaciones Prisma mutantes, despliegues o referencias a secretos. Forma parte de `npm run test:terraqo-local-contracts`.

## Límites

Este gate no sustituye los recorridos PostgreSQL/navegador ni la certificación de staging descrita en los runbooks B1–B5. Tampoco publica estados obligatorios en GitHub: la protección de rama debe configurarse externamente cuando el repositorio defina su rama estable.

La secuencia se comprobó desde una instalación limpia con `npm ci`. Sin `prisma:generate`, TypeScript pierde los tipos generados y produce errores masivos falsos; por eso la generación es un paso obligatorio y explícito antes de lint/typecheck/contratos.

El sitemap omite únicamente sus entradas dinámicas cuando `DATABASE_URL` no existe durante el build; conserva todas las rutas estáticas y vuelve a consultar empresas/perfiles cuando el runtime sí está configurado. Esto evita que CI oculte errores de inicialización Prisma dentro de un build aparentemente exitoso.
