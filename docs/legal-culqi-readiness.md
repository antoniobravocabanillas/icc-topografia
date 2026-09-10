# Terraqo / VRILLA: revisión legal y Culqi

Operador confirmado por el usuario: VRILLA S.A.C., RUC 20616279841. Terraqo es un producto, no otra sociedad. Domicilio comercial autorizado: Calle Los Cipreses Mz. U Lote 2, San Miguel, Lima, Perú. Contacto público: hola@vrilla.solutions / +51 925912607. admin@vrilla.solutions identifica la cuenta Culqi, no atención al consumidor.

Documentos revisados: asiento de constitución y testimonio digital suministrados por el usuario. Identifican VRILLA S.A.C. y San Miguel, Lima. No se publicaron documentos, firmas ni datos personales de los fundadores. No se afirma verificación de firma digital, vigencia de poder ni consulta tributaria SUNAT.

## Cobertura técnica

- /legal: operador, centro de políticas, fuentes.
- /terminos: alcance, cuenta, contratación, periodicidad, cancelación, seguridad, atención.
- /privacidad: responsable, finalidades, destinatarios, conservación, derechos y contacto.
- /devoluciones: procedimiento separado de cancelar renovación, incidencias y reintegros.
- /libro-de-reclamaciones: sin cuenta ni compra obligatoria, datos y representante, producto/servicio, importe, detalle, pedido y confirmación electrónica. Hoja correlativa, copia de texto descargable, impresión/PDF del navegador y consulta con clave privada aleatoria.
- /admin/terraqo/reclamaciones: exclusivamente SUPER_ADMIN de plataforma; bandeja, vencimientos, respuesta inmutable, evidencia postal, trazabilidad y cola de correo.
- Envíos: transacción persistente, reintento programado cada cinco minutos, clave de idempotencia del proveedor. Aceptación de correo no equivale a lectura ni entrega final: supervisar rebotes en Resend y conservar evidencia.
- El correo de copia no contiene la clave de seguimiento; el consumidor debe conservar su constancia descargada. No se expone PII por número correlativo ni se publica la hoja en URLs/sitemap.
- Los datos originales no se alteran al responder. No hay borrado de hojas desde el panel.
- Compra: CTA Comprar, resumen y botón Pagar; aceptación con versión 2026-09-09, acceso a políticas y libro. Culqi continúa en test, sin activar cobros reales.

## Fuentes verificadas el 9/9/2026

- Código Ley 29571: https://www.gob.pe/institucion/indecopi/normas-legales/1244218-29571
- Reglamento D.S. 011-2011-PCM y modificación 006-2014-PCM: https://www.gob.pe/institucion/presidencia/normas-legales/541080-011-2011-pcm
- Plazo 15 días hábiles, D.S. 101-2022-PCM / Ley 31435: https://busquedas.elperuano.pe/dispositivo/NL/2095978-1
- Guía actual libro y Ley 32495: https://consumidor.gob.pe/libro-de-reclamaciones/
- Datos personales Ley 29733 / D.S. 016-2024-JUS: https://www.gob.pe/institucion/anpd/campa%C3%B1as/128319-nuevo-reglamento-de-proteccion-de-datos-personales
- Feriados nacionales: https://www.gob.pe/feriados

El proyecto de modificación publicado en 2026 no se trata como norma ya aprobada. No se aplica el régimen del libro de entidades públicas (D.S. 007-2020-PCM) a esta empresa privada.

## Obligaciones operativas que no resuelve el despliegue

1. VRILLA debe designar responsable, atender hojas, conservar constancias, controlar rebotes y disponer del respaldo físico exigible si falla el virtual. El software no crea un libro físico ni demuestra atención efectiva.
2. Mantener hojas al menos dos años y preservar procedimientos pendientes; revisar plazos de retención, respaldos y requerimientos legales antes de eliminar información. Los casos técnicos de QA no son reclamos reales y se eliminan de manera dirigida; pueden dejar saltos en secuencia previos al lanzamiento.
3. Revisar con asesor peruano el texto y operación real, registro de bancos de datos y transferencias internacionales. No se declara inscripción ANPD, certificación ISO ni conformidad total por publicar una política.
4. Configurar emisión tributaria, llaves live y habilitación comercial antes de cobrar. Continúa el bloqueo live existente.
5. Culqi debe recibir el enlace de membresías y credenciales de una cuenta de revisión ordinaria por canal seguro si exige autenticación. No enviar credenciales administrativas ni publicar tarjetas/secretos en el código.
6. La aprobación corresponde a Culqi. Solicitar nueva revisión; no afirmar que ya fue otorgada.

## Pruebas

scripts/test-complaints.ts: validación, menor/representante, canal postal, plazo en Perú, idempotencia concurrente, consulta privada y reintento de copia con proveedor simulado (sin correos reales de consumidores).

scripts/audit-legal-browser.ts: responsive, Axe, registro y descarga, seguimiento, respuesta administrativa, revocación del rol y rechazo de origen externo. En producción omite crear hojas y respuestas ficticias.

scripts/check-legal-mail.ts --send: una prueba identificada a hola@vrilla.solutions; no crea reclamo. La aceptación por API se distingue de entrega al buzón.
