# ADR-006 — Análisis de evidencia con fuentes y abstención

Fecha: 18 de octubre de 2026
Estado: aceptado para implementación local; despliegue pendiente.

## Decisión

El análisis asistido se implementa como trabajos privados y persistidos, separados de las evaluaciones humanas. Un trabajo fija:

- actor, workspace, expediente y finalidad;
- revisiones exactas, huellas y autorización vigente;
- versión de política y prompt;
- proveedor/modelo, intentos, latencia, tokens y costo estimado cuando existen tarifas configuradas;
- afirmaciones estructuradas, carencias y citas verificables.

La salida permitida distingue dato explícito, resumen de declaración e interpretación propuesta. El analizador no puede crear un estado CONFIRMED, enviar mensajes, publicar, guardar criterios humanos ni ampliar permisos.

## Flujo

1. Autorizar actor y workspace.
2. Comparar revisiones y políticas esperadas con el expediente.
3. Revalidar acceso y proyectar solo campos autorizados.
4. Fijar caché por actor, ámbito, finalidad, política, revisión, huella y referencia de acceso.
5. Ejecutar un proveedor explícito con límites de contexto, salida e intentos.
6. Validar el esquema y cada cita contra el fragmento exacto del campo autorizado.
7. Reautorizar todas las fuentes.
8. Guardar una propuesta o abstenerse.
9. Revalidar de nuevo al consultar; una revocación oculta claims y marca el trabajo como SOURCE_REVOKED.

## Proveedores y costos

TERRAQO_EVIDENCE_ANALYSIS_PROVIDER no hereda AI_PROVIDER. Su valor por defecto es off. Esto impide activar Groq/OpenAI por una configuración destinada a otro módulo.

Ollama, Groq y OpenAI son adaptadores explícitos. El límite diario, máximo de entrada, máximo de salida y número de intentos se aplican en servidor. Si se configuran tarifas y un tope de costo, el peor caso se valida antes de llamar al proveedor. Los datos no se guardan para entrenamiento; OpenAI se invoca con store false.

## Seguridad

- El texto de una fuente se trata como dato no confiable, nunca como instrucción.
- No se envían imágenes, identidad, salud ni documentos fuera de la selección textual autorizada.
- Una cita fuera de ámbito o cuyo extracto no exista invalida toda la salida.
- Los resultados parciales, crudos o inválidos no se persisten.
- El worker usa un secreto dedicado, comparación temporal segura y no configura memoria personalizada de Netlify.
- El modo manual permanece disponible aun si el proveedor falla, se cancela o alcanza límites.

## Consecuencias

La migración 20261018153000_evidence_analysis_jobs debe aplicarse primero en staging aislado. El flag TERRAQO_EVIDENCE_ANALYSIS_V1 permanece apagado hasta aprobar la matriz actor × workspace × fuente, revocación durante procesamiento, concurrencia, cancelación y costos.
