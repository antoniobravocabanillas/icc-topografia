import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import type {WorkspacePortalToken} from './workspace-portal-session';

export class PortalContactError extends Error { constructor(message:string,readonly status:number){super(message);} }
const fields=z.object({name:z.string().trim().min(2).max(160),roleTitle:z.string().trim().max(160).default(''),
  email:z.union([z.literal(''),z.string().trim().email().max(254)]).default('').transform(value=>value.toLowerCase()),
  phone:z.string().trim().max(40).default(''),whatsapp:z.string().trim().max(40).default('')}).strict();
const creation=fields.extend({companyId:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)});
const select={id:true,name:true,roleTitle:true,email:true,phone:true,whatsapp:true,isPrimary:true,companyId:true,updatedAt:true,
  company:{select:{legalName:true,tradeName:true}}} as const;
type Contact=Prisma.ContactGetPayload<{select:typeof select}>;
function record(row:Contact):{id:string;title:string;subtitle:string;status:string;updatedAt:string;editable:boolean;canDelete:boolean;fields:Record<string,string>}{
  return {id:row.id,title:row.name,subtitle:row.company.tradeName||row.company.legalName,status:row.isPrimary?'PRIMARY':'',
    updatedAt:row.updatedAt.toISOString(),editable:true,canDelete:false,
    fields:{name:row.name,roleTitle:row.roleTitle||'',email:row.email||'',phone:row.phone||'',whatsapp:row.whatsapp||'',
      companyId:row.companyId,companyName:row.company.tradeName||row.company.legalName}};
}
const scope=(workspaceId:string)=>({terraqoWorkspaceId:workspaceId,deletedAt:null,company:{terraqoWorkspaceId:workspaceId,deletedAt:null}});
export async function listPortalContacts(token:WorkspacePortalToken,cursor?:string){
  const rows=await prisma.contact.findMany({where:{...scope(token.workspaceId),...(cursor?{id:{gt:cursor}}:{})},
    orderBy:{id:'asc'},take:31,select});
  return {schemaVersion:1,workspaceSlug:token.workspaceSlug,resource:'contacts',records:rows.slice(0,30).map(record),
    nextCursor:rows.length>30?rows[29].id:null,canCreate:true};
}
export async function savePortalContact(token:WorkspacePortalToken,input:unknown,key:string|null,id?:string,version?:string){
  if(!key||!/^[a-f0-9]{32}$/.test(key)) throw new PortalContactError('Identificador de operación no válido.',422);
  const parsed=id?fields.parse(input):creation.parse(input);
  if(id&&(!version||!Number.isFinite(Date.parse(version)))) throw new PortalContactError('Recarga antes de editar.',422);
  const entityId=id??createHash('sha256').update(JSON.stringify([token.workspaceId,token.sub,'contacts',key])).digest('hex').slice(0,32);
  const data={name:parsed.name,roleTitle:parsed.roleTitle||null,email:parsed.email||null,phone:parsed.phone||null,whatsapp:parsed.whatsapp||null};
  try { return await prisma.$transaction(async tx=>{
    const workspace=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "icc"."TerraqoWorkspace" WHERE id=${token.workspaceId} AND active=true AND "deletedAt" IS NULL FOR SHARE`;
    if(workspace.length!==1) throw new PortalContactError('Empresa no disponible.',403);
    const before=id?await tx.contact.findFirst({where:{id,...scope(token.workspaceId)},select:{companyId:true}}):null;
    if(id&&!before) throw new PortalContactError('Contacto no disponible.',404);
    const companyId=before?.companyId??('companyId' in parsed?String(parsed.companyId):'');
    // Serialize only this company's contacts. Parent scope is checked under the
    // lock so deletion/reassignment cannot race the creation or its quota.
    const company=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "icc"."Company" WHERE id=${companyId} AND "terraqoWorkspaceId"=${token.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
    if(company.length!==1) throw new PortalContactError('Selecciona una empresa disponible.',422);
    const existing=await tx.contact.findFirst({where:{id:entityId,...scope(token.workspaceId)},select});
    if(!id&&existing){
      if(existing.companyId===companyId&&Object.entries(data).every(([name,value])=>existing[name as keyof Contact]===value)) return record(existing);
      throw new PortalContactError('La operación ya se utilizó con otros datos.',409);
    }
    let saved:Contact;
    if(id){
      if(!existing) throw new PortalContactError('Contacto no disponible.',404);
      if(existing.updatedAt.toISOString()!==version) throw new PortalContactError('El contacto cambió. Recarga antes de editar.',409);
      const changed=await tx.contact.updateMany({where:{id,...scope(token.workspaceId),updatedAt:existing.updatedAt},
        data:{...data,updatedAt:new Date(Math.max(Date.now(),existing.updatedAt.getTime()+1))}});
      if(changed.count!==1) throw new PortalContactError('El contacto cambió. Recarga antes de editar.',409);
      saved=await tx.contact.findFirstOrThrow({where:{id,...scope(token.workspaceId)},select});
    }else{
      if(await tx.contact.count({where:{companyId,terraqoWorkspaceId:token.workspaceId,deletedAt:null}})>=500)
        throw new PortalContactError('Se alcanzó el límite de contactos de esta empresa.',422);
      saved=await tx.contact.create({data:{id:entityId,companyId,terraqoWorkspaceId:token.workspaceId,...data},select});
    }
    await tx.activityLog.create({data:{actorId:token.sub,terraqoWorkspaceId:token.workspaceId,companyId,contactId:saved.id,
      action:id?'UPDATED':'CREATED',entityType:'contacts',entityId:saved.id,title:id?'Contacto actualizado':'Contacto creado',metadata:{source:'portal-mobile'}}});
    return record(saved);
  }); }catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002') throw new PortalContactError('Este correo ya está registrado para esa empresa.',409);
    throw error;
  }
}
