import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {calculateQuoteAmounts,quoteLineSchema,quoteMoneySchema} from "./quote-amounts";
import {lockQuoteMutation,QuoteStateError} from "./quote-state";
const identifier=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const optionalId=identifier.or(z.literal("")).default("");
const date=z.string().default("").refine(value=>!value || /^\d{4}-\d{2}-\d{2}$/.test(value) && value>="1900-01-01" && value<="2100-12-31" && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value);
const line=quoteLineSchema.extend({productId:optionalId,type:z.enum(["product","service"]).default("service")});
const fields=z.object({customerName:z.string().trim().min(2).max(160),customerEmail:z.string().trim().email().max(254).or(z.literal("")).default(""),
  company:z.string().trim().max(160).default(""),currency:z.enum(["PEN","USD"]),tax:quoteMoneySchema.default("0"),
  items:z.array(line).min(1).max(50),validUntil:date,terms:z.string().trim().max(8000).default(""),
  deliveryTime:z.string().trim().max(1000).default(""),observations:z.string().trim().max(8000).default("")}).strict();
const creation=fields.extend({companyId:optionalId,clientId:optionalId,contactId:optionalId,opportunityId:optionalId,leadId:optionalId,sellerProfileId:optionalId});
const include={items:{orderBy:{id:"asc" as const}},sale:true,commissions:true,client:{select:{name:true}},companyRef:{select:{legalName:true,tradeName:true}}} as const;
export type QuoteDraft=Prisma.QuoteGetPayload<{include:typeof include}>;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Command={workspaceId:string;actorId:string;input:unknown;key:string|null;id?:string;version?:string;source:"admin"|"portal";convertOpportunity?:boolean};
/** Server-calculated drafts only. Issued proposals are immutable until their
 * public link is revoked by the commercial state command. The same advisory
 * lock is used by acceptance so item replacement cannot race a financial close. */
export async function saveQuoteDraft(command:Command):Promise<QuoteDraft> {
  const {workspaceId,actorId,id,key,version}=command;
  if (!key || !/^[a-f0-9]{32}$/.test(key) || !actorId || id && !identifier.safeParse(id).success)
    throw new QuoteStateError("Identificador de operación no válido.",422);
  if(id && (!version || !Number.isFinite(Date.parse(version)))) throw new QuoteStateError("Recarga la propuesta antes de editar.",422);
  const validation=(id?fields:creation).safeParse(command.input);
  if(!validation.success)throw new QuoteStateError("Revisa el alcance, la moneda, las fechas y los importes de la propuesta.",422);
  const creationInput=id?null:creation.parse(command.input);
  const parsed=id?fields.parse(command.input):creationInput!;
  if(command.convertOpportunity && (id || !creationInput?.opportunityId)) throw new QuoteStateError("Conversión no válida.",422);
  let amounts:ReturnType<typeof calculateQuoteAmounts>;
  try {amounts=calculateQuoteAmounts({currency:parsed.currency,tax:parsed.tax,items:parsed.items.map(item=>({description:item.description,quantity:item.quantity,unitPrice:item.unitPrice,discount:item.discount}))});}
  catch {throw new QuoteStateError("Revisa los importes y descuentos de la propuesta.",422);}
  const quoteId=id??digest([workspaceId,actorId,"quote-draft",key]).slice(0,32);
  const fingerprint=digest([quoteId,version??null,command.convertOpportunity??false,parsed]);
  const auditId=digest([workspaceId,actorId,quoteId,"quote-draft-command",key]).slice(0,32);
  return prisma.$transaction(async tx=>{
    // Creation quota is serialized per tenant; edits and decisions can proceed
    // on independent proposals. Locks live only for the transaction.
    const workspace=id ? await tx.$queryRaw<{id:string}[]>`SELECT id FROM "icc"."TerraqoWorkspace" WHERE id=${workspaceId} AND active=true AND "deletedAt" IS NULL FOR SHARE`
      :await tx.$queryRaw<{id:string}[]>`SELECT id FROM "icc"."TerraqoWorkspace" WHERE id=${workspaceId} AND active=true AND "deletedAt" IS NULL FOR UPDATE`;
    if(workspace.length!==1)throw new QuoteStateError("Empresa no disponible.",403);
    await lockQuoteMutation(tx,workspaceId,quoteId);
    await tx.$queryRaw`SELECT id FROM "icc"."Quote" WHERE id=${quoteId} AND "terraqoWorkspaceId"=${workspaceId} FOR UPDATE`;
    const existing=await tx.quote.findFirst({where:{id:quoteId,terraqoWorkspaceId:workspaceId},include});
    const receipt=await tx.activityLog.findFirst({where:{id:auditId,actorId,terraqoWorkspaceId:workspaceId,quoteId},select:{metadata:true}});
    if(receipt) {
      const metadata=receipt.metadata as {fingerprint?:string}|null;
      if(metadata?.fingerprint!==fingerprint || !existing || existing.deletedAt) throw new QuoteStateError("La operación ya se utilizó con otros datos.",409);
      return existing;
    }
    if(id && (!existing || existing.deletedAt)) throw new QuoteStateError("Cotización no disponible.",404);
    if(existing && (existing.deletedAt || existing.status!=="DRAFT" || existing.sale || existing.commissions.length)) throw new QuoteStateError("La propuesta tiene un envío o movimiento comercial. Su alcance no se puede editar.",409);
    if(id && existing?.updatedAt.toISOString()!==version) throw new QuoteStateError("La propuesta cambió. Recarga antes de editar.",409);
    if(!id && existing) throw new QuoteStateError("La operación ya existe y requiere revisión.",409);
    const links={companyId:existing?.companyId??(creationInput?.companyId??null),clientId:existing?.clientId??(creationInput?.clientId??null),
      contactId:existing?.contactId??(creationInput?.contactId??null),opportunityId:existing?.opportunityId??(creationInput?.opportunityId??null),
      leadId:existing?.leadId??(creationInput?.leadId??null),sellerProfileId:existing?.sellerProfileId??(creationInput?.sellerProfileId??null)};
    const tenant={terraqoWorkspaceId:workspaceId,deletedAt:null};
    if(links.companyId) {
      const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "icc"."Company" WHERE id=${links.companyId} AND "terraqoWorkspaceId"=${workspaceId} AND "deletedAt" IS NULL FOR SHARE`;
      if(rows.length!==1)throw new QuoteStateError("Selecciona una empresa disponible.",422);
    }
    if(links.clientId) {
      const client=await tx.client.findFirst({where:{id:links.clientId,...tenant},select:{companyId:true}});
      if(!client || links.companyId && client.companyId!==links.companyId)throw new QuoteStateError("El cliente no corresponde a la empresa.",422);
    }
    if(links.contactId) {
      const contact=await tx.contact.findFirst({where:{id:links.contactId,...tenant},select:{companyId:true}});
      if(!contact || links.companyId && contact.companyId!==links.companyId)throw new QuoteStateError("El contacto no corresponde a la empresa.",422);
    }
    if(links.opportunityId) {
      await tx.$queryRaw`SELECT id FROM "icc"."Opportunity" WHERE id=${links.opportunityId} AND "terraqoWorkspaceId"=${workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
      const opportunity=await tx.opportunity.findFirst({where:{id:links.opportunityId,...tenant},select:{companyId:true,status:true}});
      if(!opportunity || links.companyId && opportunity.companyId!==links.companyId || ["WON","LOST","ARCHIVED"].includes(opportunity?.status??""))throw new QuoteStateError("La oportunidad no está disponible para una nueva propuesta.",422);
    }
    if(links.leadId && !await tx.lead.findFirst({where:{id:links.leadId,...tenant},select:{id:true}}))throw new QuoteStateError("El lead no está disponible.",422);
    if(links.sellerProfileId && !await tx.staffProfile.findFirst({where:{id:links.sellerProfileId,terraqoWorkspaceId:workspaceId,active:true},select:{id:true}}))throw new QuoteStateError("El responsable comercial no está disponible.",422);
    const productIds=[...new Set(parsed.items.map(item=>item.productId).filter(Boolean))];
    if(productIds.length!==await tx.product.count({where:{id:{in:productIds},terraqoWorkspaceId:workspaceId,isActive:true}}))throw new QuoteStateError("Un producto no está disponible.",422);
    const data={customerName:parsed.customerName,customerEmail:parsed.customerEmail||null,company:parsed.company||null,
      currency:amounts.currency,subtotal:amounts.subtotal,discount:amounts.discount,tax:amounts.tax,total:amounts.total,
      validUntil:parsed.validUntil?new Date(`${parsed.validUntil}T00:00:00Z`):null,terms:parsed.terms||null,
      deliveryTime:parsed.deliveryTime||null,observations:parsed.observations||null};
    const items=amounts.items.map((item,index)=>({id:String(index).padStart(3,"0")+digest([quoteId,auditId,"line",index]).slice(0,29),
      ...item,productId:parsed.items[index].productId||null,type:parsed.items[index].type}));
    let saved:QuoteDraft;
    if(id) {
      await tx.quoteItem.deleteMany({where:{quoteId}});
      saved=await tx.quote.update({where:{id},data:{...data,publicToken:null,updatedAt:new Date(Math.max(Date.now(),existing!.updatedAt.getTime()+1)),items:{create:items}},include});
    } else {
      if(await tx.quote.count({where:{...tenant}})>=5000)throw new QuoteStateError("Se alcanzó el límite de propuestas activas de la empresa.",422);
      saved=await tx.quote.create({data:{id:quoteId,number:`COT-${quoteId.toUpperCase()}`,terraqoWorkspaceId:workspaceId,
        ...Object.fromEntries(Object.entries(links).map(([name,value])=>[name,value||null])),...data,status:"DRAFT",publicToken:null,items:{create:items}},include});
    }
    if(command.convertOpportunity && links.opportunityId) await tx.opportunity.update({where:{id:links.opportunityId},data:{status:"PROPOSAL"}});
    await tx.activityLog.create({data:{id:auditId,actorId,terraqoWorkspaceId:workspaceId,quoteId:quoteId,companyId:saved.companyId,
      action:id?"UPDATED":command.convertOpportunity?"CONVERTED":"CREATED",opportunityId:saved.opportunityId,entityType:"Quote",entityId:quoteId,title:id?"Borrador de propuesta actualizado":"Borrador de propuesta creado",metadata:{source:command.source,fingerprint}}});
    return saved;
  },{maxWait:5000,timeout:15000});
}
