import {calculateQuoteAmounts} from "./quote-amounts";
import {createHash, randomBytes} from "node:crypto";
import {Prisma, QuoteStatus} from "@prisma/client";
import {prisma} from "@/lib/prisma";

export class QuoteStateError extends Error {
  constructor(message: string, readonly status: number) {super(message);}
}
export async function lockQuoteMutation(tx: Prisma.TransactionClient, workspaceId: string, quoteId: string) {
  const lock = JSON.stringify(["commercial-quote", workspaceId, quoteId]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`;
}
export const quoteTransitions: Record<QuoteStatus, readonly QuoteStatus[]> = {
  DRAFT: ["SENT"], SENT: ["VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"],
  VIEWED: ["ACCEPTED", "REJECTED", "EXPIRED"], ACCEPTED: ["CONVERTED"],
  REJECTED: ["DRAFT"], EXPIRED: ["DRAFT"], CONVERTED: [],
};
type Command = {workspaceId: string; quoteId?: string; publicToken?: string;
  status: QuoteStatus; clientUserId?:string; actorId?: string; version?: string; source: "admin" | "portal" | "public"};
export function commercialDay(now: Date, country: string, settings: Prisma.JsonValue | null) {
  const configured = settings && typeof settings === "object" && !Array.isArray(settings) ? settings.commercialTimezone : null;
  const timezone = typeof configured === "string" ? configured : country === "PE" ? "America/Lima" : "UTC";
  try {return new Intl.DateTimeFormat("en-CA", {timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"}).format(now);}
  catch {throw new QuoteStateError("La zona horaria comercial requiere revisión.",422);}
}
export async function transitionQuote(command: Command) {
  const {workspaceId, source, status} = command;
  if (!Object.values(QuoteStatus).includes(status) || source !== "public" && !command.actorId)
    throw new QuoteStateError("Operación no válida.",422);
  if (source === "public" && (!command.publicToken || !/^[a-zA-Z0-9_-]{16,128}$/.test(command.publicToken) || !["VIEWED", "ACCEPTED", "REJECTED"].includes(status)))
    throw new QuoteStateError("Respuesta no válida.",422);
  if (source !== "public" && !command.quoteId) throw new QuoteStateError("Selecciona una cotización.",422);
  return prisma.$transaction(async tx => {
    const workspaces = await tx.$queryRaw<{id: string}[]>`SELECT id FROM "icc"."TerraqoWorkspace" WHERE id=${workspaceId} AND active=true AND "deletedAt" IS NULL FOR SHARE`;
    if (workspaces.length !== 1) throw new QuoteStateError("Empresa no disponible.",403);
    const where = {terraqoWorkspaceId: workspaceId, deletedAt: null,
      ...(source === "public" ? {publicToken: command.publicToken!} : {id: command.quoteId!})};
    const target = await tx.quote.findFirst({where,select:{id:true}});
    if (!target) throw new QuoteStateError("Cotización no disponible.",404);
    await lockQuoteMutation(tx,workspaceId,target.id);
    await tx.$queryRaw`SELECT id FROM "icc"."Quote" WHERE id=${target.id} AND "terraqoWorkspaceId"=${workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
    const quote = await tx.quote.findFirst({where,include:{companyRef:true,contact:true,client:true,sellerProfile:true,sale:true,commissions:true,items:true}});
    if (!quote) throw new QuoteStateError("Cotización no disponible.",404);
    if(command.clientUserId) {
      if(source!=="portal" || command.actorId!==command.clientUserId || !quote.clientId || quote.status==="DRAFT" || !["ACCEPTED","REJECTED"].includes(status) ||
        !await tx.clientAccount.findFirst({where:{userId:command.clientUserId,clientId:quote.clientId,terraqoWorkspaceId:workspaceId,deletedAt:null,status:{in:["active","approved"]},client:{terraqoWorkspaceId:workspaceId,deletedAt:null}},select:{id:true}}))
        throw new QuoteStateError("Propuesta no disponible para responder.",403);
    }
    // A repeated state returns the committed outcome without duplicating sales,
    // commissions, notifications, audit rows, or acceptance timestamps.
    if (quote.status === status) return quote;
    // Opening a previously issued page cannot revert a terminal decision.
    if (source === "public" && status === "VIEWED" && quote.status !== "SENT") return quote;
    if (command.version && quote.updatedAt.toISOString() !== command.version)
      throw new QuoteStateError("La cotización cambió. Recarga antes de confirmar.",409);
    if (!quoteTransitions[quote.status].includes(status)) throw new QuoteStateError("Esta transición comercial no está permitida.",409);
    const now = new Date();
    const workspace = await tx.terraqoWorkspace.findUniqueOrThrow({where:{id:workspaceId},select:{country:true,settings:true}});
    if (["SENT", "ACCEPTED", "REJECTED", "VIEWED"].includes(status) && quote.validUntil &&
        quote.validUntil.toISOString().slice(0,10) < commercialDay(now,workspace.country,workspace.settings))
      throw new QuoteStateError("La cotización ha vencido. Solicita una propuesta vigente.",409);
    for (const relation of [quote.companyRef,quote.contact,quote.client,quote.sellerProfile]) {
      if (relation && (relation.terraqoWorkspaceId !== workspaceId || "deletedAt" in relation && relation.deletedAt))
        throw new QuoteStateError("Una relación comercial requiere revisión.",409);
    }
    if (quote.contact && quote.companyId && quote.contact.companyId !== quote.companyId)
      throw new QuoteStateError("El contacto no corresponde a la empresa.",409);
    if (quote.sale && quote.sale.terraqoWorkspaceId !== workspaceId || quote.commissions.some(row => row.terraqoWorkspaceId !== workspaceId))
      throw new QuoteStateError("La trazabilidad financiera requiere revisión.",409);
    if (quote.client?.companyId && quote.companyId && quote.client.companyId !== quote.companyId)
      throw new QuoteStateError("El cliente no corresponde a la empresa.",409);
    if (quote.opportunityId) {
      await tx.$queryRaw`SELECT id FROM "icc"."Opportunity" WHERE id=${quote.opportunityId} AND "terraqoWorkspaceId"=${workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
      const opportunity = await tx.opportunity.findFirst({where:{id:quote.opportunityId,terraqoWorkspaceId:workspaceId,deletedAt:null},select:{companyId:true}});
      if (!opportunity || quote.companyId && opportunity.companyId !== quote.companyId) throw new QuoteStateError("La oportunidad requiere revisión.",409);
    }
    if (quote.leadId && !await tx.lead.findFirst({where:{id:quote.leadId,terraqoWorkspaceId:workspaceId,deletedAt:null},select:{id:true}}))
      throw new QuoteStateError("El lead requiere revisión.",409);
    if (status === "DRAFT" && (quote.sale || quote.commissions.length))
      throw new QuoteStateError("La cotización tiene movimientos financieros y no puede volver a borrador.",409);
    let commissionAmount = new Prisma.Decimal(0);
    if (status === "ACCEPTED") {
      if (quote.commissions.length && !quote.sellerProfileId) throw new QuoteStateError("La comisión no tiene un responsable comercial válido.",409);
      if (!["PEN", "USD"].includes(quote.currency) || !quote.total.isFinite() || quote.total.isNegative() || quote.total.decimalPlaces() > 2 || quote.total.gt("99999999999.99"))
        throw new QuoteStateError("La moneda o el importe requieren revisión antes de aceptar.",422);
      try {
        const calculated = calculateQuoteAmounts({currency:quote.currency as "PEN" | "USD",tax:quote.tax.toString(),
          items:quote.items.map(item=>({description:item.description,quantity:item.quantity,unitPrice:item.unitPrice.toString(),discount:item.discount.toString()}))});
        if (quote.items.some((item,index)=>!item.subtotal.eq(calculated.items[index].subtotal)) || !calculated.total.eq(quote.total) || !calculated.discount.eq(quote.discount) ||
            ![calculated.subtotal,calculated.subtotal.sub(calculated.discount)].some(value=>value.eq(quote.subtotal)))
          throw new QuoteStateError("Los totales de la propuesta requieren revisión.",422);
      } catch (error) {
        if (error instanceof QuoteStateError) throw error;
        throw new QuoteStateError("Las líneas o los importes requieren revisión.",422);
      }
      if (quote.sellerProfileId) {
        await tx.$queryRaw`SELECT id FROM "icc"."StaffProfile" WHERE id=${quote.sellerProfileId} AND "terraqoWorkspaceId"=${workspaceId} FOR SHARE`;
        const seller = await tx.staffProfile.findFirst({where:{id:quote.sellerProfileId,terraqoWorkspaceId:workspaceId,active:true}});
        if (!seller) throw new QuoteStateError("El responsable comercial no está disponible.",409);
        if (seller.commissionType === "SALE_PERCENTAGE") {
          if (!seller.commissionRate.isFinite() || seller.commissionRate.isNegative() || seller.commissionRate.gt(100)) throw new QuoteStateError("La tasa de comisión requiere revisión.",422);
          commissionAmount = quote.total.mul(seller.commissionRate).div(100).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
        } else if (seller.commissionType === "FIXED_AMOUNT") {
          commissionAmount = seller.fixedCommission;
          if (!commissionAmount.isFinite() || commissionAmount.isNegative() || commissionAmount.decimalPlaces() > 2 || commissionAmount.gt(quote.total))
            throw new QuoteStateError("La comisión fija requiere revisión.",422);
        } else throw new QuoteStateError("Esta comisión requiere un cálculo de margen o categoría antes de confirmar.",422);
        if (quote.commissions.length > 1) throw new QuoteStateError("Existen comisiones duplicadas que requieren revisión.",409);
        if (!quote.commissions.length) await tx.commission.create({data:{quoteId:quote.id,sellerProfileId:seller.id,
          terraqoWorkspaceId:workspaceId,type:seller.commissionType,baseAmount:quote.total,rate:seller.commissionType==="SALE_PERCENTAGE"?seller.commissionRate:new Prisma.Decimal(0),amount:commissionAmount}});
        else if (quote.commissions[0].type!==seller.commissionType || !quote.commissions[0].rate.eq(seller.commissionType==="SALE_PERCENTAGE"?seller.commissionRate:0) || quote.commissions[0].sellerProfileId !== seller.id || !quote.commissions[0].baseAmount.eq(quote.total) || !quote.commissions[0].amount.eq(commissionAmount)) throw new QuoteStateError("La comisión existente requiere revisión.",409);
      }
      if (!quote.sale) {
        const saleId = createHash("sha256").update(JSON.stringify([workspaceId,quote.id,"accepted-sale"])).digest("hex").slice(0,32);
        await tx.sale.create({data:{id:saleId,number:`VEN-${saleId.toUpperCase()}`,quoteId:quote.id,terraqoWorkspaceId:workspaceId,
          opportunityId:quote.opportunityId,clientId:quote.clientId,companyId:quote.companyId,contactId:quote.contactId,sellerProfileId:quote.sellerProfileId,
          status:"CONFIRMED",currency:quote.currency,amount:quote.total,commissionAmount}});
        await tx.activityLog.create({data:{actorId:command.actorId,terraqoWorkspaceId:workspaceId,action:"CONVERTED",entityType:"Sale",entityId:saleId,
          title:"Venta confirmada desde cotización",quoteId:quote.id,saleId,companyId:quote.companyId,metadata:{source}}});
      } else if (quote.sale.currency !== quote.currency || !quote.sale.amount.eq(quote.total) || !quote.sale.commissionAmount.eq(commissionAmount))
        throw new QuoteStateError("La venta existente requiere revisión.",409);
    }
    if(status === "ACCEPTED" && quote.opportunityId) await tx.opportunity.update({where:{id:quote.opportunityId},data:{status:"WON"}});
    if (status === "CONVERTED" && !quote.sale) throw new QuoteStateError("La cotización no tiene una venta confirmada.",409);
    const saved = await tx.quote.update({where:{id:quote.id},data:{status,updatedAt:new Date(Math.max(Date.now(),quote.updatedAt.getTime()+1)),
      ...(status === "SENT" ? {publicToken:randomBytes(32).toString("hex")} : {}),
      ...(status === "DRAFT" ? {publicToken:null,viewedAt:null,acceptedAt:null,rejectedAt:null} : {}),
      ...(status === "VIEWED" ? {viewedAt:now} : {}), ...(status === "ACCEPTED" ? {acceptedAt:now} : {}), ...(status === "REJECTED" ? {rejectedAt:now} : {})}});
    await tx.activityLog.create({data:{actorId:command.actorId,terraqoWorkspaceId:workspaceId,action:"STATUS_CHANGED",entityType:"Quote",entityId:quote.id,
      quoteId:quote.id,title:"Estado de cotización actualizado",metadata:{source,from:quote.status,to:status}}});
    if ((source === "public" || command.clientUserId) && status !== "VIEWED") await tx.notification.create({data:{id:createHash("sha256").update(JSON.stringify([workspaceId,quote.id,quote.publicToken,status,"quote-response-notice"])).digest("hex").slice(0,32),terraqoWorkspaceId:workspaceId,type:"QUOTE",
      title:status === "ACCEPTED" ? "Cotización aceptada" : "Cotización rechazada",body:"Una propuesta comercial recibió una respuesta.",href:`/admin/cotizaciones?quote=${quote.id}`}});
    return saved;
  },{maxWait:5000,timeout:15000});
}
