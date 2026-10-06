import {QuoteStatus} from "@prisma/client";
import {z} from "zod";
import {terraqoDomains} from "@/lib/terraqo-domains";
import {prisma} from "@/lib/prisma";
import {saveQuoteDraft,type QuoteDraft} from "./quote-drafts";
import {transitionQuote,quoteTransitions,QuoteStateError} from "./quote-state";
import type {WorkspacePortalToken} from "./workspace-portal-session";
const include={items:{orderBy:{id:"asc" as const}},sale:true,commissions:true,client:{select:{name:true}},companyRef:{select:{legalName:true,tradeName:true}}} as const;
function record(row:QuoteDraft,role:WorkspacePortalToken["role"]):{id:string;title:string;subtitle:string;status:string;updatedAt:string;editable:boolean;canDelete:boolean;fields:Record<string,string>} {
  const publicLink=role==="ADMIN" && row.status!=="DRAFT" && row.publicToken && /^[a-zA-Z0-9_-]{16,128}$/.test(row.publicToken)
    ? new URL(`/cotizaciones/${encodeURIComponent(row.publicToken)}`,terraqoDomains.public).toString() : "";
  const editable=role==="ADMIN" && row.status==="DRAFT" && !row.sale && !row.commissions.length;
  return {id:row.id,title:row.number,subtitle:row.customerName,status:row.status,updatedAt:row.updatedAt.toISOString(),editable,canDelete:false,
    fields:{customerName:row.customerName,customerEmail:row.customerEmail||"",company:row.company||row.companyRef?.tradeName||row.companyRef?.legalName||"",clientName:row.client?.name||"",companyId:row.companyId||"",
      currency:row.currency,tax:row.tax.toFixed(2),subtotal:row.subtotal.toFixed(2),discount:row.discount.toFixed(2),total:row.total.toFixed(2),
      validUntil:row.validUntil?.toISOString().slice(0,10)||"",terms:row.terms||"",deliveryTime:row.deliveryTime||"",observations:row.observations||"",
      items:JSON.stringify(row.items.map(item=>({description:item.description,quantity:item.quantity,unitPrice:item.unitPrice.toString(),discount:item.discount.toString(),type:item.type,productId:item.productId||""}))),
      allowedStates:JSON.stringify(quoteTransitions[row.status].filter(status=>role==="ADMIN" || status==="ACCEPTED" || status==="REJECTED")),
      publicLink,kind:"quote",clientId:row.clientId||"",contactId:row.contactId||"",opportunityId:row.opportunityId||"",leadId:row.leadId||"",sellerProfileId:row.sellerProfileId||""}};
}
async function clientScope(token:WorkspacePortalToken) {
  const account=await prisma.clientAccount.findFirst({where:{userId:token.sub,terraqoWorkspaceId:token.workspaceId,deletedAt:null,status:{in:["active","approved"]},
    client:{terraqoWorkspaceId:token.workspaceId,deletedAt:null}},select:{clientId:true}});
  return account?.clientId??null;
}
export async function listPortalQuotes(token:WorkspacePortalToken,cursor?:string) {
  const clientId=token.role==="CLIENT"?await clientScope(token):null;
  if(token.role==="CLIENT" && !clientId)return {schemaVersion:1,workspaceSlug:token.workspaceSlug,resource:"quotes",records:[],nextCursor:null,canCreate:false};
  const scope={terraqoWorkspaceId:token.workspaceId,deletedAt:null,...(token.role==="CLIENT"?{clientId:clientId!,status:{not:"DRAFT" as const}}:{})};
  const anchor=cursor?await prisma.quote.findFirst({where:{id:cursor,...scope},select:{id:true,createdAt:true}}):null;
  if(cursor && !anchor)throw new QuoteStateError("Recarga la lista de propuestas.",422);
  const rows=token.role==="CLIENT" && !clientId?[]:await prisma.quote.findMany({where:{...scope,
    ...(anchor?{OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],take:31,include});
  return {schemaVersion:1,workspaceSlug:token.workspaceSlug,resource:"quotes",records:rows.slice(0,30).map(row=>record(row,token.role)),nextCursor:rows.length>30?rows[29].id:null,canCreate:token.role==="ADMIN"};
}
export async function savePortalQuote(token:WorkspacePortalToken,input:unknown,key:string|null,id?:string,version?:string) {
  if(!key || !/^[a-f0-9]{32}$/.test(key))throw new QuoteStateError("Identificador de operación no válido.",422);
  if(input && typeof input==="object" && "action" in input) {
    const command=z.object({action:z.literal("STATUS"),status:z.nativeEnum(QuoteStatus)}).strict().parse(input);
    if(!id || !version || !Number.isFinite(Date.parse(version)))throw new QuoteStateError("Recarga antes de confirmar.",422);
    if(token.role==="CLIENT") {
      const clientId=await clientScope(token);
      if(!clientId || !["ACCEPTED","REJECTED"].includes(command.status) || !await prisma.quote.findFirst({where:{id,terraqoWorkspaceId:token.workspaceId,clientId,deletedAt:null,status:{not:"DRAFT"}},select:{id:true}}))
        throw new QuoteStateError("Propuesta no disponible para responder.",403);
    } else if(token.role!=="ADMIN")throw new QuoteStateError("Se requiere administración empresarial.",403);
    await transitionQuote({workspaceId:token.workspaceId,quoteId:id,actorId:token.sub,source:"portal",status:command.status,version,...(token.role==="CLIENT"?{clientUserId:token.sub}:{})});
    const saved=await prisma.quote.findFirstOrThrow({where:{id,terraqoWorkspaceId:token.workspaceId,deletedAt:null},include});return record(saved,token.role);
  }
  if(token.role!=="ADMIN")throw new QuoteStateError("Se requiere administración empresarial.",403);
  const fields=z.record(z.string(),z.string()).parse(input);
  let items:unknown;
  try {if(!fields.items || fields.items.length>50000)throw new Error();items=JSON.parse(fields.items);}
  catch {throw new QuoteStateError("Detalle de propuesta no válido.",422);}
  const saved=await saveQuoteDraft({workspaceId:token.workspaceId,actorId:token.sub,source:"portal",input:{...fields,items},key,id,version});
  return record(saved,token.role);
}
