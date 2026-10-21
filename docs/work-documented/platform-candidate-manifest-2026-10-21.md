# Manifiesto del candidato de plataforma B1-B5

Fecha de corte: 21 de octubre de 2026.

## Objetivo

Separar el codigo, contratos, migraciones y documentacion que forman el
candidato B1-B5 de los artefactos locales generados durante QA. Este manifiesto
no crea un commit, no aplica migraciones y no autoriza staging ni produccion.

## Estado observado

- Rama: `codex/icc-production-preview`.
- Base observada: `e6ff153694dc01ab8a2b5848556fa6839626b2af`.
- Entradas candidatas visibles en `git status --short`: 166. Incluyen 74
  archivos rastreados modificados y 92 rutas sin seguimiento agrupadas por Git;
  al expandir los directorios, el candidato contiene 239 archivos en total.
- Archivos rastreados modificados: 74.
- Archivos sin seguimiento candidatos: 165.
- Gate local: contratos, tipado, lint, build, codificacion e inventario
  aprobados.
- Higiene: `npm run check:release-candidate` aprobado; 930 archivos actualmente
  rastreados sin artefactos locales ni archivos de entorno privados.
- Revision de credenciales: 239 archivos candidatos inspeccionados sin patrones
  de claves privadas, tokens de proveedor ni credenciales utilizables. La
  plantilla `.env.example` conserva solo marcadores documentales.
- Scan post-remediacion sellado:
  `d56c041f-645f-46ee-8201-e6e08ebce851`, cero hallazgos reportables para el
  snapshot
  `codex-security-snapshot/v1:sha256:8257d1aff3e1cd233e1d358cf48309c4c2e58b458a8672ed4332be07a932402c`.

## Contenido del candidato por superficie

| Superficie | Entradas | Tratamiento |
| --- | ---: | --- |
| `app/` | 57 | Incluir: paginas, APIs v1, archivo, selecciones, respaldos, discovery, colaboracion y cierre. |
| `components/` | 25 | Incluir: UI profesional/admin y componentes B1-B5. |
| `lib/` | 42 | Incluir: dominio, autorizacion, idempotencia, DTO, media, mensajeria, analisis y recuperacion. |
| `prisma/` | 8 | Incluir schema y siete migraciones B1-B5; no aplicarlas al preparar el commit. |
| `scripts/` | 52 | Incluir gates y contratos no mutantes; revisar que ningun runner use destinos remotos por omision. |
| `docs/` | 44 | Incluir ADR, handoff, auditorias, runbooks y este manifiesto. |
| `.github/` | 1 | Incluir el quality gate; no contiene despliegue. |
| `netlify/` | 3 | Incluir funciones y worker compatibles con Starter. |
| Configuracion raiz | 6 | Incluir `.env.example`, `.gitignore`, ESLint, Next y manifiestos npm. |
| `emails/` | 1 | Incluir plantilla transaccional modificada. |

## Exclusiones deliberadas

Las siguientes rutas permanecen en disco pero quedan fuera de Git mediante
`.gitignore`:

- `.playwright-cli/`: 76 capturas y logs locales de navegador.
- `output/`: 96 informes, benchmarks y evidencia generada.
- `tmp/`: 1.638 archivos temporales, incluidos binarios PostgreSQL y renders de
  PDF.
- `**/__pycache__/` y `*.pyc`: cache local de Python.
- `deno.lock`: lock generado por el runtime Edge local de Netlify; el proyecto
  productivo se administra con npm y no tiene un flujo Deno declarado.

No se elimino ni movio ningun archivo al establecer estas exclusiones.

## Revisiones obligatorias antes de crear el commit

1. Confirmado por el usuario el 21 de octubre de 2026: las 166 entradas visibles
   se tratan como un unico candidato funcional B1-B5. La revision de higiene no
   detecto experimentos locales, binarios grandes ni artefactos temporales.
2. Revisar especialmente los cambios amplios de `prisma/schema.prisma`,
   `app/(commerce)/portal/bitacora/page.tsx`, auditorias generadas y perfil
   empresarial publico.
3. Confirmar que `.env.example` solo documenta nombres y valores seguros, nunca
   secretos.
4. Verificar que las siete migraciones siguen siendo aditivas y respetan el
   orden del runbook.
5. Crear un commit inmutable y registrar su SHA en la evidencia de cierre.
6. Repetir el gate local y el diff scan sobre ese SHA; el scan del working tree
   no sustituye esta verificacion final.

## Siguiente gate

Con un SHA candidato confirmado, preparar staging aislado con flags apagados,
proveedor `off`, cohorte vacia y credenciales exclusivas. Recién entonces se
puede ensayar restauracion, aplicar las siete migraciones, comprobar drift y
ejecutar el recorrido E2E de dos identidades y dos workspaces.

Antes de conectar, `npm run check:platform-staging` debe aprobar con
`PLATFORM_STAGING_CONFIRM=staging`. El contrato automatizado verifica que el
control falle ante URLs productivas, base ambigua, flags activos, cohorte con
miembros o secretos reutilizados.
