# B4 - Auditoría de reutilización antes de implementar

Fecha: 17 de octubre de 2026.

## Resultado

| Capacidad B4 | Activo existente | Decisión |
|---|---|---|
| Necesidad empresarial privada y versionada | `TerraqoJobPost` | No reutilizar como necesidad: es una publicación/oportunidad y no conserva versiones de criterios. Permitir vínculo explícito futuro. |
| Candidatura profesional | `TerraqoProjectApplication` | Conservar para postulación; no usar como dossier interno ni como aceptación de colaboración. |
| Conversación | `TerraqoConversation`, participantes y mensajes | Reutilizar transporte. Añadir contexto B4 separado; una referencia no concede acceso. |
| Archivos en mensajes | `TerraqoMessageAttachment` + controles existentes | Reutilizar después de verificar que aplica la misma política de cuarentena B2. |
| Proyecto operativo | `Project` | Crear/vincular solo después del acuerdo; no tratar una evaluación como proyecto. |
| Evidencia profesional | revisiones B2, selecciones/grants B3 | Reutilizar por revisión y autorización. Nunca copiar contenido completo al dossier. |
| Notas internas | `TerraqoPrivateNote` | No alcanza: está ligada a un usuario, no al dossier versionado. Añadir notas de dossier con scope workspace. |
| Propuesta y cierre | No existe entidad equivalente | Crear proceso versionado e idempotente según ADR-005. |

## Riesgos detectados

- `sendMessage` no es idempotente todavía; B4 no puede cerrar T15 reutilizándolo sin recibo de operación.
- `startConversation` exige amistad o workspace compartido. El contacto por necesidad requiere una solicitud explícita antes de incorporar al profesional.
- Los mensajes no tienen referencia estructurada a evidencia/selección y un enlace libre podría aparentar acceso que no existe.
- `TerraqoJobPost.status` es texto libre; no debe dirigir estados de colaboración.
- El esquema actual no conserva versiones aceptadas de alcance ni doble aceptación de cierre.
- La búsqueda de red no representa por sí sola autorización para guardar una fuente en un dossier.

## Orden seguro de B4

1. T13: necesidad versionada + búsqueda manual explicable + captura de fuente autorizada.
2. T14: dossier privado, criterios y notas; análisis manual antes de IA.
3. T15: solicitud de conversación y mensajes idempotentes con contexto no autorizante.
4. T16: propuesta versionada y aceptación explícita.
5. T17: cierre, revisión bilateral y constancia privada.

Los flags permanecen apagados hasta que el recorrido de dos identidades se valide en staging.
