# Jornada — recuperación ante fallos transitorios de arranque

Fecha: 19 de octubre de 2026.

## Problema cubierto

Al abrir el portal al inicio del día, una respuesta temporal de red o servidor podía dejar el control de jornada en error hasta que la persona recargara la página. Esa recuperación manual hacía que un estado ya configurado pareciera perdido.

## Comportamiento implementado

- La consulta inicial conserva dos intentos inmediatos para absorber fallos breves.
- Los fallos transitorios continúan con backoff acotado de 2, 5, 15 y 30 segundos.
- Volver a estar en línea o regresar a una pestaña visible dispara una recuperación inmediata.
- El último estado válido no se elimina durante una actualización fallida.
- El control global conserva la jornada activa y no desmonta el seguimiento de ubicación por una consulta transitoria fallida.
- Errores de autenticación, autorización o validación no se repiten automáticamente.
- Si todavía no existe un estado válido, la interfaz anuncia el problema mediante `role="alert"`, explica que reintentará y conserva el botón manual.

## Validación local

- `npm run test:field-verification-recovery`
- `npm run typecheck`
- ESLint focalizado del componente, política y contrato
- `git diff --check`
- build Next.js de producción

La fase no aplica migraciones, no activa flags y no despliega cambios.
