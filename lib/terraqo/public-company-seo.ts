import {cache} from "react";
import type {Prisma} from "@prisma/client";
import {prisma} from "@/lib/prisma";
import {safeDb} from "@/lib/server/safe-db";
export function companyPublication(settings:Prisma.JsonValue|null){
  if(!settings||typeof settings!=="object"||Array.isArray(settings))return false;
  const profile=settings.companyLiveProfile;
  return Boolean(profile&&typeof profile==="object"&&!Array.isArray(profile)&&profile.publicEnabled===true);
}
export const getPublicCompanySeo=cache(async(slug:string)=>{
  const company=await safeDb("public-company-seo",prisma.terraqoWorkspace.findFirst({where:{active:true,deletedAt:null,OR:[{publicSlug:slug},{slug}]},select:{name:true,brandName:true,slug:true,publicSlug:true,description:true,industry:true,locationCity:true,country:true,settings:true,updatedAt:true}}),null);
  return company&&companyPublication(company.settings)?company:null;
});
