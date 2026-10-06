import {readFile} from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {PDFDocument, rgb} from "pdf-lib";

type Money = {toFixed: (places: number) => string};
export type QuotePdfInput = {
  number: string; customerName: string; customerEmail?: string | null;
  company?: string | null; currency: string; status: string;
  subtotal: Money; discount: Money; tax: Money; total: Money;
  terms?: string | null; deliveryTime?: string | null; observations?: string | null;
  validUntil?: Date | null;
  items: {description: string; quantity: number; unitPrice: Money; discount: Money; subtotal: Money}[];
  terraqoWorkspace: {name: string; brandName: string | null};
};

const labels: Record<string,string> = {DRAFT:"Borrador",SENT:"Enviada",VIEWED:"Vista",ACCEPTED:"Aceptada",REJECTED:"Rechazada",EXPIRED:"Vencida",CONVERTED:"Convertida"};
let fontBytes: Promise<Buffer> | undefined;

/** Uses the bundled brand font; no remote assets or customer-supplied URLs are fetched. */
export async function renderQuotePdf(quote: QuotePdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  fontBytes ??= readFile(path.join(process.cwd(),"public/fonts/noto-sans/noto-sans.ttf"));
  const bytes = await fontBytes;
  const font = await document.embedFont(bytes,{subset:false});
  const glyphs = new Set(font.getCharacterSet());
  // Unsupported symbols remain explicitly represented instead of silently disappearing.
  const text = (value: string) => Array.from(value.normalize("NFC").replace(/\r\n?/g,"\n"))
    .map(char => char === "\n" || glyphs.has(char.codePointAt(0)!) ? char : `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
  const navy = rgb(.055,.11,.20), muted = rgb(.35,.40,.47), teal = rgb(.02,.43,.45);
  const width=595.28, height=841.89, left=44, right=width-44, bottom=66;
  let page=document.addPage([width,height]), y=height-122;
  const wrap = (value: string, available: number, size: number) => {
    const result: string[]=[];
    for (const paragraph of text(value).split("\n")) {
      let line="";
      // Character-aware wrapping also bounds long unbroken references and URLs.
      for (const char of Array.from(paragraph)) {
        if (line && font.widthOfTextAtSize(line+char,size)>available) {
          const split=line.lastIndexOf(" ");
          if (split>line.length/2) {result.push(line.slice(0,split));line=line.slice(split+1)+char;}
          else {result.push(line);line=char;}
        } else line+=char;
      }
      result.push(line.trimEnd());
    }
    return result;
  };
  const draw = (value: string,x: number,baseline: number,size=10,color=navy) => page.drawText(text(value),{x,y:baseline,size,font,color});
  const header = () => {
    page.drawRectangle({x:0,y:height-92,width,height:92,color:navy});
    const issuer=wrap(quote.terraqoWorkspace.brandName || quote.terraqoWorkspace.name,right-left,15).slice(0,2);
    issuer.forEach((line,index)=>draw(line,left,height-34-index*18,15,rgb(1,1,1)));
    draw("PROPUESTA COMERCIAL",left,height-79,9,rgb(.6,.85,.85));
  };
  header();
  const ensure = (space: number) => {if(y-space<bottom){page=document.addPage([width,height]);header();y=height-122;}};
  const paragraph = (value: string,size=10,color=navy,indent=0) => {
    for(const line of wrap(value,right-left-indent,size)){ensure(size+6);draw(line,left+indent,y,size,color);y-=size+6;}
  };
  const section = (label: string) => {ensure(48);y-=12;draw(label,left,y,12,teal);y-=23;};
  paragraph(`Cotización ${quote.number}`,17);
  paragraph(`Estado: ${labels[quote.status] || quote.status}`,10,muted);
  y-=12;
  paragraph(`Cliente: ${quote.customerName}`);
  if(quote.company) paragraph(`Empresa: ${quote.company}`);
  if(quote.customerEmail) paragraph(`Correo: ${quote.customerEmail}`);
  if(quote.validUntil) paragraph(`Válida hasta: ${quote.validUntil.toISOString().slice(0,10)}`);
  section("Alcance de la propuesta");
  quote.items.forEach((item,index)=>{
    const lines=wrap(`${String(index+1).padStart(2,"0")}  ${item.description}`,right-left,10);
    ensure(Math.min(lines.length*16+54,height-122-bottom));
    for(const line of lines){ensure(16);draw(line,left,y);y-=16;}
    paragraph(`Cantidad: ${item.quantity}   ·   Unitario: ${quote.currency} ${item.unitPrice.toFixed(2)}`,9,muted,20);
    paragraph(`Descuento: ${quote.currency} ${item.discount.toFixed(2)}   ·   Importe: ${quote.currency} ${item.subtotal.toFixed(2)}`,9,muted,20);
    ensure(12);page.drawLine({start:{x:left,y:y+2},end:{x:right,y:y+2},thickness:.5,color:rgb(.86,.89,.91)});y-=12;
  });
  ensure(166);section("Resumen económico");
  for(const [label,amount] of [["Subtotal",quote.subtotal],["Descuento",quote.discount],["Impuesto",quote.tax]] as const){
    draw(label,left,y);const value=`${quote.currency} ${amount.toFixed(2)}`;draw(value,right-font.widthOfTextAtSize(value,10),y);y-=20;
  }
  y-=12;
  const total=`${quote.currency} ${quote.total.toFixed(2)}`;
  page.drawRectangle({x:left-8,y:y-12,width:right-left+16,height:35,color:rgb(.91,.96,.96)});
  draw("Total",left,y,13,teal);draw(total,right-font.widthOfTextAtSize(total,13),y,13,teal);y-=32;
  for(const [label,value] of [["Condiciones comerciales",quote.terms],["Tiempo de entrega",quote.deliveryTime],["Observaciones",quote.observations]]) {
    if(value){section(label!);paragraph(value,10);}
  }
  const pages=document.getPages();
  pages.forEach((current,index)=>{
    current.drawLine({start:{x:left,y:48},end:{x:right,y:48},thickness:.5,color:rgb(.86,.89,.91)});
    current.drawText("Terraqo · Propuesta comercial",{x:left,y:31,size:8,font,color:muted});
    const counter=`${index+1} / ${pages.length}`;
    current.drawText(counter,{x:right-font.widthOfTextAtSize(counter,8),y:31,size:8,font,color:muted});
  });
  document.setTitle(`Cotización ${quote.number}`);
  return document.save();
}
