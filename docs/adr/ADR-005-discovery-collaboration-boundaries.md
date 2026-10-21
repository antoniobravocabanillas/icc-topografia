# ADR-005 - Límites de descubrimiento, mensajería y colaboración

- Estado: aceptado para implementación local
- Fecha: 17 de octubre de 2026
- Ámbito: B4 / Discovery + Messaging + Collaboration

## Contexto

Terraqo ya contiene oportunidades públicas (`TerraqoJobPost`), postulaciones (`TerraqoProjectApplication`), conversaciones (`TerraqoConversation`), mensajes y proyectos. B4 necesita además una necesidad empresarial versionada, evaluación privada basada en fuentes autorizadas, propuestas aceptables y una constancia de cierre.

Forzar esos estados dentro de una oferta pública, un mensaje o un proyecto mezclaría intenciones distintas: publicar una vacante no equivale a formular una necesidad privada; conversar no equivale a aceptar un alcance; cerrar una colaboración no equivale a publicar una evidencia.

## Decisión

- Conservar `TerraqoJobPost` y `TerraqoProjectApplication` para oportunidades/postulaciones existentes.
- Crear una necesidad privada versionada que pueda, más adelante, originar una oferta sin convertirla automáticamente.
- Reutilizar `TerraqoConversation` para transporte, participantes y mensajes; agregar referencias contextuales separadas. Una referencia nunca concede acceso a evidencia.
- El dossier de evaluación pertenece al workspace y es ilegible para el profesional y para otros workspaces.
- Cada fuente guardada fija revisión y tipo de autorización. Toda lectura derivada vuelve a comprobar que la fuente continúa autorizada.
- No calcular compatibilidad personal ni puntuación única. El resultado expone coincidencias textuales/estructuradas y aspectos pendientes de confirmar.
- Una propuesta tiene versiones inmutables. Cambiar alcance crea una nueva versión y exige nueva aceptación.
- La colaboración nace únicamente de una versión aceptada. El cierre es borrador separado; guardar no envía ni publica.
- La constancia se emite solo cuando ambas partes aceptan la misma versión de cierre. Es privada por defecto y sus adjuntos conservan permisos independientes.

## Controles

- Todas las mutaciones críticas usan idempotencia, versión optimista y transacción serializable.
- La autorización se evalúa por actor, workspace, recurso y estado; conocer un ID nunca concede lectura.
- Notas internas, criterios y análisis no se serializan en DTOs profesionales.
- Mensajes contextuales contienen identificadores opacos y estado neutral cuando la fuente ya no está disponible.
- No se habilitan videollamadas, scoring psicológico, inferencias por imagen o publicación automática.

## Consecuencias

- B4 añade entidades de proceso sin duplicar oportunidades, mensajería ni proyectos.
- Los flujos actuales continúan funcionando sin flags B4.
- La búsqueda manual y explicable debe funcionar antes de cualquier analizador IA.
- Revocar una fuente invalida nuevas lecturas y análisis derivados; no reescribe snapshots históricos de auditoría.
