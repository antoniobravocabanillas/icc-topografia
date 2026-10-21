# T18 — Jobs de análisis con fuentes y abstención

Fecha: 18 de octubre de 2026.

## Implementación local

- Contrato POST /api/v1/analysis-jobs con idempotencia, finalidad, revisiones y políticas esperadas.
- Consulta por polling, cancelación y reintento controlado.
- Cola persistida y worker Netlify compatible con plan Starter.
- Adaptadores aislados para Ollama, Groq y OpenAI; proveedor desactivado por defecto.
- Límite diario, contexto, salida, intentos y costo opcional en servidor.
- Proyección por allowlist de los campos que cada selección/grant permite.
- Salida JSON solicitada con JSON Schema estricto y validada nuevamente con cita literal a fuente, revisión y campo.
- Abstención válida cuando las fuentes no permiten concluir.
- Reautorización antes y después de generar y cada vez que se muestra.
- Panel privado en Necesidades: estado, cancelar, reintentar, hallazgos, carencias y trazabilidad.
- La interfaz solo ofrece el análisis cuando entitlement, proveedor y dispatcher están operativos; en caso contrario informa que la evaluación manual sigue disponible.
- Un replay idempotente devuelve el job existente aunque el proveedor haya sido desactivado y solo vuelve a despachar estados pendientes recuperables.

## Límites deliberados

- El análisis no actualiza evaluaciones manuales.
- No genera CONFIRMED, score de persona, ranking ni recomendación de contratación.
- No envía mensajes ni publica resultados.
- No usa datos de clientes para entrenamiento.
- No se aplicó ninguna migración remota ni se activó el flag fuera del proceso de prueba. Solo se llamó al Ollama local por loopback con fixtures sintéticos.

## Gate local

- prisma format, validate y generate.
- npm run typecheck.
- npm run test:evidence-analysis-contract.
- npm run test:b5-ollama-provider-gate: `READY` en un intento con Qwen local; 385/174 tokens y 45.243 ms.
- ESLint focalizado de archivos T18: aprobado sin advertencias.
- npm run build: aprobado. Persisten advertencias preexistentes fuera de T18 en la página pública de empresa y componentes heredados con img.

El primer ensayo falló cerrado con `INVALID_ANALYSIS_SCHEMA` usando `format: "json"`. El adaptador Ollama ahora envía el JSON Schema completo y la repetición aprobó validación estructural, scope y citas. Los fixtures se eliminaron al finalizar.

## Gate de staging pendiente

1. Aplicar 20261018153000_evidence_analysis_jobs sobre una copia aislada.
2. Probar dos workspaces y dos actores con grant privado, selección pública y CV público.
3. Revocar una fuente durante PROCESSING; verificar que no persista ningún claim.
4. Ejecutar cancelación, retry concurrente y replay de idempotencia.
5. Verificar que una cita inventada, fuera de allowlist o de otro dossier falle cerrada.
6. Medir latencia, tokens y costo con el proveedor elegido.
