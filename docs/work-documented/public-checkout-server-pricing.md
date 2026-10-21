# Checkout público ICC — precio canónico del servidor

Fecha: 20 de octubre de 2026.

## Hallazgo

La ruta pública construía precios unitarios desde el catálogo, pero permitía que `totals.total` enviado por el navegador sustituyera la suma final. Un cliente manipulado podía registrar una orden con un total distinto de sus líneas.

## Corrección

- El contrato de entrada ya no declara ni consume totales calculados por el cliente.
- `calculatePublicCheckoutPrice` usa `Prisma.Decimal` y deriva subtotales y total exclusivamente desde precios persistidos.
- Se rechazan productos que requieren cotización, precios nulos/no positivos, cantidades superiores a 10 000 y pedidos con monedas mixtas.
- La orden conserva el precio unitario y la moneda canónicos usados en el cálculo.
- El flujo continúa creando una orden pendiente e instrucciones; no procesa pagos ni confirma stock automáticamente.

## Validación

`npm run test:public-checkout-pricing` cubre precisión decimal, artículo solo cotización, precio cero, límite de cantidad, monedas mixtas y la integración de la ruta sin `payload.totals`. El contrato forma parte de `npm run test:terraqo-local-contracts`.

No se ejecutaron órdenes, cobros, migraciones ni conexiones a bases de datos durante esta corrección.
