import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {Prisma} from "@prisma/client";
import {PDFDocument} from "pdf-lib";
import {renderQuotePdf} from "../lib/server/quote-pdf";

async function main(){
  const money=(value:string)=>new Prisma.Decimal(value);
  const pdf=await renderQuotePdf({number:"DEMO-2026-0050",customerName:"Cliente de demostración",company:"Empresa de prueba",customerEmail:"demostracion@example.test",currency:"PEN",status:"DRAFT",terraqoWorkspace:{name:"Empresa de prueba",brandName:"Topografía · Empresa de prueba"},subtotal:money("5000.00"),discount:money("50.00"),tax:money("891.00"),total:money("5841.00"),
    items:Array.from({length:50},(_,i)=>({description:`SERVICIO-${i+1} · Medición topográfica, revisión técnica y presentación de resultados. ${i===24?"Referencia".repeat(45):"Trabajo en campo con coordinación del cliente."}`,quantity:1,unitPrice:money("100.00"),discount:money("1.00"),subtotal:money("99.00")})),
    terms:"CONDICIONES-INICIO\n"+"La aprobación comprende el alcance descrito. Cualquier cambio requiere una nueva propuesta y aprobación. ".repeat(65)+"\nCONDICIONES-FIN",
    deliveryTime:"Entrega sujeta a la disponibilidad acordada con el cliente.",observations:"OBSERVACIONES-FINALES · Documento ficticio utilizado únicamente para verificar el formato."});
  assert.equal(Buffer.from(pdf).subarray(0,5).toString(),"%PDF-");
  const document=await PDFDocument.load(pdf);assert.ok(document.getPageCount()>=5);
  await mkdir("output/pdf",{recursive:true});await writeFile("output/pdf/cotizacion-demostracion.pdf",pdf);
  console.log(`PASS: 50 líneas y condiciones extensas; ${document.getPageCount()} páginas.`);
}
main().catch(()=>{console.error("FAIL: renderizado de propuesta");process.exitCode=1;});
