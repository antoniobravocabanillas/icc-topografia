import {loadEnvConfig} from "@next/env";
loadEnvConfig(process.cwd());
async function main(){
 if(!process.argv.includes("--send"))throw new Error("Use --send to explicitly send the operational test to VRILLA.");
 const {sendTransactionalEmail}=await import("../lib/server/transactional-email");
 const text="Prueba técnica de Terraqo, producto de VRILLA S.A.C. Se verifica el canal de atención del Libro de Reclamaciones. No corresponde a una hoja real ni solicita pago. Las hojas se gestionan en Administración de Terraqo > Reclamaciones. Responde internamente si el mensaje llega a spam o no se visualiza correctamente.";
 const result=await sendTransactionalEmail({to:"hola@vrilla.solutions",replyTo:"hola@vrilla.solutions",subject:"Terraqo · Verificación técnica del canal de reclamaciones",text,html:`<p>${text}</p>`,idempotencyKey:"terraqo-legal-mail-check-20260909"});
 console.log(JSON.stringify({accepted:result.delivered}));
 if(!result.delivered)process.exitCode=1;
}
main().catch(()=>{console.error("Mail verification failed; check configured sender and provider.");process.exitCode=1;});
