# Terraqo: precios y economía unitaria

Decisión comercial propuesta e implementada por autorización del propietario, 2026-09-07. Moneda PEN, importes de cara al consumidor incluyen IGV cuando corresponda. No son una tarifa del proveedor ni una estimación de costos ya observados: falta una serie histórica de consumo. Revisar mensualmente con costos reales.

## Catálogo

| Plan | Mensual | Anual anticipado | Usuarios | Almacenamiento | Acciones IA/mes |
|---|---:|---:|---:|---:|---:|
| Personal Gratis | S/0 | S/0 | 1 | 250 MB | 10 |
| Profesional | S/29 | S/290 | 1 | 2 GB | 100 |
| Profesional Plus | S/59 | S/590 | 1 | 5 GB | 300 |
| Empresa Gratis | S/0 | S/0 | 1 | 250 MB | 10 |
| Lite | S/199 | S/1990 | 3 | 10 GB | 200 |
| Professional | S/399 | S/3990 | 10 | 25 GB | 800 |
| Premium | S/799 | S/7990 | 25 | 50 GB | 2000 |
| Enterprise | S/1599 | S/15990 | 50 | 100 GB | 4000 |

Anual = diez mensualidades, ahorro 16.67% frente a doce. Culqi confirmó por API un máximo de S/5000 por plan para esta cuenta: Premium y Enterprise anual son precios de catálogo no contratables; se ofrece mensual, sin fragmentar cargos para eludir el límite. Las cuotas de IA se renuevan mensualmente también en anual, sin acumulación. No hay excedentes facturados automáticamente. El simulador de automatización no es un motor productivo y no se vende como ejecuciones incluidas. Integraciones a medida, migración asistida, verificación humana y SLA contractual no se incluyen en el precio estándar.

## Proveedores y supuestos verificables

- Netlify Pro publicado: USD20/mes base; créditos adicionales USD10/1500, ancho de banda 20 créditos/GB y cómputo 10 créditos/GB-h. Fuente: https://www.netlify.com/pricing/ . El contrato efectivo de la cuenta puede ser legacy; no se asume que tenga la tarifa publicada.
- Prisma Postgres Pro publicado: USD49/mes, 10M operaciones y 50 GB; excedente USD2/M operaciones. Fuente: https://www.prisma.io/pricing . El almacenamiento de evidencias no se debe confundir con almacenamiento relacional.
- Groq GPT OSS 20B publicado: USD0.075/M tokens entrada y USD0.30/M salida. Fuente: https://console.groq.com/docs/models . Una operación de 3000 tokens de entrada y 1200 salida cuesta USD0.000585 solo en inferencia; deben añadirse solicitudes, base de datos, reintentos y soporte. Los proveedores/modelos alternativos pueden ser más caros.
- Resend Pro publicado: USD20/mes y 50000 correos; USD0.90/1000 adicionales. Fuente: https://resend.com/docs/knowledge-base/what-is-resend-pricing . Correo transaccional, no campañas ilimitadas.
- Culqi nacional publicado: 3.44% + USD0.20 por operación. Fuente: https://ayuda.culqi.com/portal/es/kb/articles/cual-es-la-comision-de-culqionline . Tarjetas internacionales y condiciones fiscales pueden cambiar; provisionar conservadoramente 4.5% + S/0.91 hasta contrastar liquidaciones.

Supuestos internos: tipo de cambio de presupuesto S/3.85/USD (no cotización actual); reserva de inferencia + plataforma S/0.06 por acción de IA para contemplar proveedores alternativos y salidas más largas, no solamente el modelo económico; tráfico incremental S/0.52/GB; soporte S/30/h. Presupuesto de infraestructura compartida mínimo USD89/mes (S/342.65), más almacenamiento Blob, monitoreo, dominios, seguridad, copias, consumo y operación. No se publican garantías de margen sin medir esos rubros.

## Márgenes objetivo y sensibilidad

Ingreso neto tributario estimado = precio/1.18. Contribución = ingreso neto - comisión - IA - nube incremental - soporte asignado. El margen de contribución no es utilidad neta: falta descontar producto, salarios, adquisición y costos fijos.

Presupuesto variable objetivo por cuenta/mes, excluyendo comisión: Profesional S/12, Plus S/25, Lite S/55, Professional S/125, Premium S/255, Enterprise S/510. Con reserva de comisión anterior, contribución mensual estimada: S/10.36, S/21.44, S/103.78, S/194.27, S/385.25, S/772.22 respectivamente. Estos presupuestos exigen medir consumo y controlar cuotas; no sostienen descargas ilimitadas. El almacenamiento se contabiliza conservadoramente en MB por carga; documentos reemplazados que permanecen retenidos siguen consumiendo capacidad.

Anual reduce ingreso mensual equivalente, pero baja fricción de renovación y comisión fija. No se incluyen ahorros por menor abandono como ingreso garantizado. Escenario ilustrativo: 100 Profesional + 20 Plus + 10 Lite + 5 Professional + 2 Premium + 1 Enterprise facturan S/11262 brutos mensuales; no es una proyección de ventas. Revisar conversión, CAC, abandono, soporte, almacenamiento acumulado y tráfico P95 antes de ampliar cuotas.

Comparación competitiva: Zoho Projects publica ofertas por usuario y opción gratis; Terraqo cobra por workspace con asientos incluidos y se diferencia por trayectoria/evidencia, no por prometer igual amplitud. Referencia: https://www.zoho.com/projects/zohoprojects-pricing.html . No se afirma ser más barato en todos los casos.

## Calidad, seguridad y globalización

Marco de requisitos alineado con ISO/IEC 25010 (calidad), 25040:2024 (evaluación), 27001:2022 (seguridad) y 27701:2025 (privacidad). No implica certificación ni cumplimiento integral auditado. Evidencias necesarias: amenazas, pruebas de autorización, idempotencia, concurrencia, trazabilidad y recuperación.

Importes enteros en céntimos; moneda ISO4217; fechas UTC y presentación localizada; país ISO3166. El lanzamiento es PEN/Perú: internacionalizar formato no equivale a resolver impuestos globales. No almacenar PAN/CVV ni activar permisos por un retorno del navegador.
