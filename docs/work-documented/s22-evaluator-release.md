# S22 · Acceso de evaluadores

La administración de invitaciones y el refuerzo de permisos están publicados en Terraqo Platform Staging en el commit `5017b71c6dd25148d1695701ea5523563e18fbd0`, despliegue `6aebfe2940b1caebbba87acb`. Pasaron el control previo, la compilación, el recorrido autenticado y la limpieza. El historial sigue en 47 migraciones aplicadas.

Una invitación autorizada de Lector se emitió desde staging. Se envió la plantilla de la aplicación a través del conector Resend, que informó entrega al servidor de destino. El emisor sintético tiene su contraseña deshabilitada. La invitación vence el 11 de noviembre a las 22:51, hora de Lima. El sitio conserva el envío transaccional desactivado y requiere credenciales y remitente para probar el despacho automático hacia un buzón. Los reintentos, errores de proveedor y aceptación del proveedor se probaron con transporte simulado. El envío se intenta después del commit y no hay cola persistente.

## Candidato Evaluador

El acceso de evaluación se guarda separado de la membresía ordinaria. El administrador selecciona la persona y los expedientes autorizados. La consulta requiere una identidad activa con permiso de lectura, una asignación vigente y un expediente del mismo workspace. Cada fuente se comprueba para la persona que lee. Título, resumen y resultado respetan los campos autorizados tanto en la selección original como en el acceso actual. Las notas internas, los documentos generales y los archivos adjuntos quedan fuera de la respuesta.

Las modificaciones concurrentes se serializan con el bloqueo del workspace y comprueban la versión que vio el administrador. Las claves foráneas compuestas impiden asignaciones entre empresas. La invitación aceptada dirige al lector a sus evaluaciones. La navegación del portal muestra ese acceso a las identidades de evaluación habilitadas.

## Validaciones

Pasaron PostgreSQL desechable, sesiones reales Auth.js y Chromium, cambios concurrentes, reintentos, archivo, retirada de fuente, rechazo entre empresas y pérdida de permisos. El navegador comprobó la aceptación por el destinatario, la asignación de uno de dos expedientes y la revocación. Las comprobaciones visuales cubrieron 320, 390 y 1440 píxeles. También pasaron las pruebas de atención comercial y la compilación de Next.js con datos sintéticos. Persiste una advertencia previa por una variable sin usar en admin-actions.

## Migración preparada

El proyecto objetivo es exclusivamente `mghdpciewbsowjrjwmwk`, con 47 entradas verificadas antes del cambio. La migración `20261104000300_workspace_evaluators` conserva los valores históricos del rol de invitación y añade las identidades y asignaciones de evaluación. Su SHA-256 es `350d4fe98d49ef406b6b218e6e5a5607c6676c43da8802e3f18c1a47a48ff668`.

Se restauró la copia `s24-backup-1793851559216/icc.dump`, SHA-256 `237ca86d30ccce6a4dfbef2314707045f387e4f9d36baa8d2aad36ca260fde98`. La copia proviene de PostgreSQL 17 y se restauró en PostgreSQL 18 local. En la restauración, el artefacto avanzó el historial de 47 a 48 en una transacción, comprobó las invitaciones existentes, verificó los privilegios, preservó los recuentos y rechazó la repetición. El checksum de la migración y el historial se vuelven a comprobar al aplicar.

Para reproducir el artefacto local se usa `node --import tsx scripts/prepare-s22-staging-migration.ts docs/work-documented/s22-evaluator-staging-ledger-2026-11-04.json --evaluators`. Produce `output/s22/evaluator-migration.sql`. El siguiente paso externo requiere aprobar esta nueva migración en staging y desplegar la rama del Evaluador con su indicador habilitado. Tras la aplicación debe verificarse el historial de 48 entradas, la conservación de la invitación de prueba, el recorrido alojado y la eliminación de sus usuarios sintéticos.
