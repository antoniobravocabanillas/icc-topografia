# Preparacion de activacion B4/B5

El usuario solicito avanzar con B4 y B5. No se interpreto como seleccion de todas las empresas ni como cambio de sus planes o cobros.

## Readback productivo

1 de noviembre: deploy activo `6ae5056ee67ba8b2881f8830`. Los cinco flags B4/B5 estan apagados, proveedor off y cohorte vacia. ICC Topografia existe como workspace activo. Credenciales Groq/OpenAI presentes; no se imprimieron ni se llamaron proveedores. Falta EVIDENCE_ANALYSIS_DISPATCH_SECRET. Los limites de uso no estan configurados explicitamente.

La presencia de una credencial no acredita saldo, cuota o funcionamiento del proveedor. El gate remoto anterior si probo Groq con fuentes sinteticas; no certifica la situacion actual de facturacion del proveedor.

## Propuesta concreta

- Primera cohorte: solo ICC Topografia; sin wildcard.
- B4: necesidades, evaluacion manual privada, contacto contextual, colaboracion y cierre bilateral.
- Limite inicial propuesto: 25 necesidades mensuales por workspace.
- B5: analisis privado con Groq, reutilizando el adaptador/modelo validado; 10 analisis mensuales por workspace como limite inicial conservador. Es limite de operaciones, no presupuesto monetario garantizado.
- Crear secreto aleatorio dedicado de dispatcher y guardarlo como secreto en funciones del sitio productivo. No cambiar claves de autenticacion ni de pagos.
- Mantener historial, permisos sobre fuentes e idempotencia; no publicar archivos privados ni modificar planes.

## Secuencia

1. Resolver la seleccion de cohorte con el usuario; una solicitud general de B4/B5 no identifica las empresas destinatarias.
2. Leer nuevamente flags y destino. Preparar rollback de configuracion sin exponer secretos.
3. Configurar cohorte y limites; habilitar B4 con analisis apagado y reconstruir candidato bloqueado. Validar aislamiento y disponibilidad manual.
4. Preparar dispatcher/proveedor. Antes de activar T18, completar recorrido de staging con cohorte de analisis encendida: el anterior dispatcher sintetico con flag apagado no lo sustituye.
5. Publicar B5 solo tras ese gate; observar cola, errores, citas/revocaciones y consumo. Retirada mediante flags, conservando datos.

## Validado en esta continuacion

- check:b5-rollout PASS.
- test:product-entitlements-contract PASS.
- test:recovery-observability-contract PASS.
- test:evidence-analysis-contract PASS.
- Readback productivo de solo lectura: output/b45-production-preflight.json.

No se activaron flags, crearon jobs, aplicaron migraciones ni realizaron cobros. Pendientes inmediatos: cohorte seleccionada y gate T18 encendido; luego configuracion dedicada del dispatcher. Los tres blobs ausentes siguen como incidente separado y no se utilizaran como fuentes de validacion.
