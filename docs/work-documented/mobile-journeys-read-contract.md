# Jornadas móviles — contrato de lectura

## Alcance de esta fase

Se añadió `GET /api/public/workspaces/{workspaceSlug}/portal/journeys` como frontera de solo lectura para la futura pantalla Flutter **Mis jornadas**.

El endpoint:

- exige una sesión Portal revocable y rol `PROFESSIONAL`;
- resuelve exclusivamente la relación laboral activa del usuario dentro del workspace del token;
- pagina un máximo de 30 entradas por solicitud;
- consulta únicamente marcas y aprobaciones ligadas a esa misma relación, usuario y workspace;
- devuelve entrada, salida, contexto, proyecto visible, minutos regulares/adicionales y estado de revisión;
- no expone coordenadas, precisión, distancia, credenciales, huellas de red/dispositivo ni banderas internas de riesgo;
- devuelve relación nula y lista vacía cuando el profesional todavía no tiene vínculo laboral activo.

## Decisiones de arquitectura

La lectura se implementó en un servicio dedicado (`lib/server/portal-journeys.ts`) y no dentro del gateway genérico de recursos. Así el DTO móvil no queda limitado por el modelo de tarjetas genéricas y las futuras escrituras de entrada/salida pueden mantener un contrato separado, idempotente y con validación de dispositivo/ubicación.

No se añadió ninguna escritura, migración, flag, despliegue ni acceso administrativo a jornadas de terceros.

## Validación

- `npm run test:portal-journeys`: aislamiento de rol, usuario, workspace y relación; paginación acotada; salida sin ubicación privada.
- `npm run test:terraqo-local-contracts`: 32 contratos no mutantes aprobados.
- `npm run lint`: aprobado sin advertencias.
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado con Next.js 15.5.27.

## Siguiente bloque

Consumir este DTO en Flutter mediante capas dominio/datos/presentación y añadir la pantalla adaptativa de historial. Registrar entrada/salida permanece fuera de alcance hasta definir el contrato nativo de WebAuthn/dispositivo y la cola offline sin duplicar marcas.
