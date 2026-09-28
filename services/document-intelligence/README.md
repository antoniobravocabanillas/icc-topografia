# Terraqo Document Intelligence

Servicio privado para convertir CV en datos estructurados sin enviar documentos a proveedores de IA externos.

## Componentes

- Docling extrae texto y estructura de PDF, DOC y DOCX.
- Ollama ejecuta el modelo local y devuelve JSON validado con Pydantic.
- La aplicación Next.js conserva autorización, deduplicación, revisión humana y aplicación transaccional.

## Ejecución local

1. Instala Ollama y descarga el modelo configurado, por ejemplo `ollama pull qwen2.5:7b-instruct`.
2. Inicia Ollama en una red privada.
3. Define `TERRAQO_DOCUMENT_AI_TOKEN` como secreto del entorno, nunca dentro del repositorio.
4. Crea una vez el volumen privado con `docker volume create terraqo-document-ai-cache`.
5. Ejecuta `docker compose up -d --build`. Por defecto el worker queda disponible solo en `127.0.0.1:8081` y conserva sus modelos en el volumen privado.
6. Configura Next.js con `TERRAQO_DOCUMENT_AI_URL=http://127.0.0.1:8081` y el mismo token.

Variables del contenedor:

- `OLLAMA_BASE_URL=http://ollama:11434`
- `OLLAMA_CV_MODEL=qwen2.5:7b-instruct`
- `OLLAMA_TIMEOUT_SECONDS=240`
- `TERRAQO_DOCUMENT_AI_TOKEN=<secreto interno>`

El contenedor se ejecuta sin privilegios, con filesystem de solo lectura, sin capacidades Linux, con `no-new-privileges`, `/tmp` efímero y el puerto limitado a loopback. `docker compose ps` debe reportarlo como `healthy`.

No se guardan archivos en el contenedor. Cada documento se procesa en un directorio temporal que se elimina al terminar.

## Despliegue productivo

Requiere una VM Linux dedicada con Docker Compose, DNS y puertos 80/443. No expongas Ollama ni el extractor directamente.

1. Crea un subdominio privado para el servicio y apunta su DNS a la VM.
2. Copia `.env.production.example` a `.env` y reemplaza el dominio y token. Usa `openssl rand -hex 32` para el token.
3. Ejecuta `docker compose -f compose.production.yaml config` y revisa que solo `gateway` publique puertos.
4. Inicia con `docker compose -f compose.production.yaml up -d --build`.
5. Verifica `https://<dominio>/health`; Caddy obtiene y renueva TLS automáticamente.
6. Configura en Netlify el mismo token, la URL HTTPS y un secreto independiente para despacho de trabajos.

La red `private` impide acceso externo a Ollama y al extractor. Caddy limita el cuerpo, publica únicamente `/health` y `/v1/cv/extract`, fuerza cabeceras defensivas y no almacena respuestas. El endpoint de extracción continúa protegido por comparación constante del token.

## Mejora del modelo

Las correcciones con consentimiento se almacenan en `TerraqoCvImportCorrection`. Deben exportarse a un conjunto anonimizado, dividirse en entrenamiento/evaluación y evaluarse fuera de producción. Un modelo nuevo solo se promueve si mejora exactitud por campo, cobertura y tasa de duplicados sin degradar el conjunto de control. No se admite entrenamiento automático directo desde tráfico de producción.
