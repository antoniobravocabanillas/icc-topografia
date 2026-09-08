# Facturación Terraqo: puesta en marcha

## Estado comprobado

- Publicado el 8 de septiembre de 2026: commit `47a1e19`, despliegue Netlify `6a9f964a86adf6980391ca6e`. Migración de facturación aplicada y registrada.
- Auditoría sobre producción: membresías y checkout a 360/390/1440 px sin desbordes ni incidencias Axe detectadas; API sin sesión 401, origen externo 403, cuenta ajena 404. Login conserva plan y periodicidad al pasar al subdominio del portal. SDK alojado de Culqi cargado; función `billing-reconcile` desplegada.
- Culqi en modo test y cobros live expresamente deshabilitados. La auditoría de producción no efectuó otro cargo.

- Catálogo central en `lib/terraqo/billing/catalog.ts`: gratis, dos planes personales y cuatro empresariales, mensual/anual.
- Diez combinaciones provisionadas y verificadas en Culqi sandbox. La API rechaza importes superiores a 500000 céntimos: Premium y Enterprise anual no están habilitados. No se fraccionan cobros.
- Flujo de navegador real probado con el iframe de Culqi, tarjeta oficial de prueba, tokenización, cliente, tarjeta validada, suscripción, cargo de S/29 verificado y cancelación de renovación. El ledger quedó ACTIVE con fecha pagada y `cancelAtPeriodEnd=true`; el perfil conservó FREE.
- Los planes de sandbox tienen tres ciclos porque la API de prueba no admite duración indefinida. Producción utiliza cero ciclos (indefinido hasta cancelación).
- Pruebas automatizadas: concurrencia de checkout, clave de idempotencia, unicidad de cargo, aislamiento test/live, autorización de propietario, cancelación conservando acceso, cuota atómica, fechas fin de mes/bisiesto, cuerpo limitado y redirecciones permitidas.
- La evidencia sintética del pago sandbox se conserva privada para auditoría. Las demás cuentas temporales sin pagos se eliminan al terminar las pruebas.

## Configuración

Servidor: `CULQI_MODE=test|live`, `CULQI_PUBLIC_KEY`, `CULQI_SECRET_KEY`. No usar prefijo NEXT_PUBLIC para la llave privada. El API autenticado devuelve únicamente la pública. Los IDs de planes se guardan en la tabla versionada TerraqoBillingPlan, no en `.env.example`.

`BILLING_LIVE_ENABLED=false` protege producción aunque se configuren accidentalmente llaves live. `BILLING_RECONCILE_SECRET` es un secreto aleatorio de al menos 32 caracteres, compartido solamente por el endpoint interno y la función programada de Netlify. No se registra en logs.

Desde **Administración de la plataforma → Facturación** un SUPER_ADMIN puede sincronizar planes, pausar nuevas ventas y conciliar cuentas. El administrador de una empresa no tiene esta autorización. Pausar ventas no cancela suscripciones existentes.

## Operación y recuperación

- Precio y periodicidad se validan en servidor contra catálogo y plan verificado del proveedor; el navegador no fija importes.
- El intento y consentimiento se guardan antes de contactar a Culqi. No se almacenan PAN/CVV ni tokens completos.
- Ante un POST ambiguo no se repite la compra. La conciliación busca la referencia exacta del intento y consulta el cargo antes de activar permisos.
- Una autenticación 3DS incompleta puede descartarse únicamente antes de crear una suscripción. No se permite abandonar un cargo incierto para volver a cobrar.
- La función Netlify revisa cuentas pendientes cada cinco minutos. El navegador también consulta durante un periodo acotado; el administrador dispone de conciliación manual.
- La fecha pagada se verifica en permisos de módulos y cuotas, sin depender solamente del scheduler. Los contratos anteriores concedidos manualmente se preservan.
- La cancelación detiene renovación; el periodo pagado no se elimina. Las devoluciones verificadas del proveedor se reflejan en el ledger. La tramitación de devoluciones sigue el canal de soporte; no se promete devolución automática.

## Antes de cobrar dinero real

1. Cuenta comercial Culqi habilitada y llaves **live** configuradas de forma segura; las actuales son **test**.
2. Identidad fiscal del operador, emisión del comprobante tributario y condiciones comerciales aprobadas. La constancia de operación del portal no es factura tributaria.
3. Cambiar `CULQI_MODE=live`, configurar llaves live y habilitación explícita. Sincronizar el catálogo desde el administrador de Terraqo.
4. Verificar el primer cobro live autorizado, liquidación, cancelación y atención de devoluciones; no usar tarjetas reales durante QA sandbox.

No se afirma certificación ISO ni que una auditoría de código sustituya una auditoría formal de seguridad o cumplimiento. Los formatos de moneda y fecha están internacionalizados; el cobro inicial se limita a PEN/Perú.

Contrato del proveedor consultado: https://apidocs.culqi.com/apiculqi.yaml . Checkout: https://docs.culqi.com/es/documentacion/checkout/checkout-custom/ . Autenticación: https://docs.culqi.com/es/documentacion/culqi-3ds/v1/configuracion/ . Costos y supuestos: `billing-pricing-model.md`.
