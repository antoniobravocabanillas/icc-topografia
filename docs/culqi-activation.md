# Culqi: sandbox verificado, cobros deshabilitados

El 7 de septiembre de 2026 la consulta autenticada de solo lectura a `/v2/recurrent/plans` respondió HTTP 200 con las llaves de prueba del proyecto. No devolvió planes. El propietario indicó que necesita definir los planes antes de cobrar: no se crearon planes, cargos ni suscripciones. No existe un checkout de suscripciones habilitado. Las consultas continúan por el canal comercial de Terraqo.

Los precios publicados son referencias comerciales, no instrucciones de cobro. Antes de activarlos deben confirmarse importes, impuestos, beneficios, periodicidad, renovaciones y cancelación.

## Configuración preparada

Variables exclusivamente del servidor: CULQI_MODE, CULQI_PUBLIC_KEY, CULQI_SECRET_KEY, CULQI_PROFESSIONAL_PLAN_ID y CULQI_WORKSPACE_PLAN_ID. Las llaves se configuran en el entorno del proyecto y Netlify; nunca se incluyen en Git ni en mensajes. Ejecutar `npx tsx scripts/check-culqi-config.ts` verifica presencia, formato y separación test/live sin mostrar valores.

## Requisitos antes del desarrollo y habilitación del checkout

1. Confirmar planes, precios, impuestos, beneficios, periodicidad y política de cancelación con el propietario; verificar capacidades de recurrencia de la cuenta.
2. Configurar las llaves y planes de prueba. Probar tokenización con Culqi Checkout; los datos de tarjeta no deben atravesar Terraqo.
3. Implementar cliente → tarjeta tokenizada → suscripción con el contrato vigente de Culqi. Registrar intentos durables y bloqueo por suscriptor. Un timeout incierto debe reconciliarse antes de intentar crear otra suscripción.
4. Verificar cada evento con el proveedor. No activar acceso por parámetros del navegador ni por el contenido de un webhook no autenticado.
5. Aplicar confirmación de pago y permisos en una transacción con deduplicación por ID de evento/cargo. Prevenir carreras, cobros duplicados y cambios de precio desde el cliente.
6. Completar alta, renovación, rechazo, reintento, cancelación, devolución y conciliación. Ejecutar pruebas de sandbox e integración antes de habilitar producción.

La creación de la cuenta no autoriza publicar perfiles privados. SEO y pagos conservan decisiones independientes.

## Diagnóstico y tarjetas de prueba

`npx tsx scripts/check-culqi-account.ts` consulta únicamente el listado de planes en sandbox, sin imprimir claves. Las tarjetas de prueba se introducen en el checkout del proveedor durante las pruebas; no se guardan PAN ni CVV en `.env.local`, `.env.example` o la base de datos. Las claves privadas no se envían al navegador. La configuración de producción y las pruebas de cobro, 3DS, renovación y cancelación siguen pendientes.

Fuentes verificadas: https://docs.culqi.com/es/documentacion/pagos-online/recurrencia/suscripciones/suscripciones/ y https://docs.culqi.com/es/documentacion/checkout/checkout-custom/.
