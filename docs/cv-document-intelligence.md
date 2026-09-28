# Inteligencia documental de CV en Terraqo

## Objetivo

Reducir la carga manual de experiencias, estudios y capacidades sin entregar documentos privados a un proveedor de IA por consumo. El profesional conserva el control: revisa cada dato y la plataforma crea únicamente borradores privados y no verificados.

## Flujo

1. El usuario carga un CV en Documentos y datos. Netlify Blobs conserva el archivo privado.
2. `/portal/experiencias/importar` solicita una lectura del documento.
3. El backend verifica propiedad, tipo y disponibilidad, calcula SHA-256 e impide procesamientos duplicados para la misma versión del parser.
4. El servicio privado usa Docling para extraer el documento y Ollama para transformarlo al esquema estricto de Terraqo.
5. El backend valida el JSON, busca coincidencias con experiencias y estudios existentes y guarda resultados auditables.
6. El profesional corrige, acepta o rechaza cada dato. Los posibles duplicados quedan desmarcados.
7. Una transacción crea entradas privadas con estado `NOT_REQUESTED`; nunca asigna checks, publicación o validación.
8. Se recalculan los años de experiencia y el extracto del perfil.

## Seguridad y privacidad

- El worker exige token de servicio y debe vivir en una red privada.
- Solo admite PDF, DOC y DOCX de hasta 10 MB.
- El documento se trata como entrada hostil; sus instrucciones se ignoran para mitigar prompt injection.
- Docling trabaja en un directorio temporal eliminado al terminar.
- El servicio no sigue URLs ni dispone de herramientas externas.
- Toda salida vuelve a validarse con Zod antes de tocar la base de datos.
- La autorización se comprueba por usuario, perfil, documento, importación e ítem.
- Las altas se aplican en una transacción idempotente y siempre privadas.

## Ciclo de mejora

El consentimiento para entrenamiento es independiente de la importación y puede revocarse en la revisión. Cuando está activo, las diferencias entre predicción y corrección quedan en `TerraqoCvImportCorrection`. `npm run ml:export-cv-feedback` crea un JSONL seudonimizado con permisos restrictivos. Como los valores corregidos aún pueden contener información personal, el archivo debe permanecer dentro del entorno controlado de MLOps y someterse a minimización antes del entrenamiento.

La promoción de modelos debe seguir este control:

1. anonimización y revisión de calidad;
2. separación por persona entre entrenamiento, validación y prueba;
3. evaluación por campo, cobertura, fechas y duplicados;
4. comparación contra el modelo vigente;
5. revisión humana y registro de versión;
6. despliegue gradual y posibilidad de rollback.

No se entrena directamente con tráfico de producción: evita envenenamiento de datos, memorización de información personal y degradación silenciosa.

## Activación

1. Ejecutar la migración `20260927110000_terraqo_cv_import`.
2. Desplegar `services/document-intelligence` junto a Ollama en una red privada.
3. Configurar en Next.js `TERRAQO_DOCUMENT_AI_URL`, `TERRAQO_DOCUMENT_AI_TOKEN` y `TERRAQO_DOCUMENT_AI_TIMEOUT_MS`.
4. Configurar el mismo `TERRAQO_DOCUMENT_AI_TOKEN`, `OLLAMA_BASE_URL` y `OLLAMA_CV_MODEL` en el worker.
5. Verificar `/health`, procesar un CV sintético y comprobar que ningún dato se publica automáticamente.

Esta arquitectura elimina la tarifa por llamada, pero no vuelve el cómputo literalmente gratuito o ilimitado: la capacidad depende de CPU/GPU, memoria, almacenamiento y concurrencia del host privado.
