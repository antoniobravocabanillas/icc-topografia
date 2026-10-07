import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { reservePrivateUploadFiles, compensatePrivateUploadFiles } from "../lib/server/native-professional-upload-compensation";
async function main(){
  const original=prisma.activityLog.create;const events:string[]=[];let failMarker=false;
  const files=[{type:"DNI_FRONT",file:new File(["front"],"front.png"),storageKey:"professional-documents/profile/front/a"},{type:"DNI_BACK",file:new File(["back"],"back.png"),storageKey:"professional-documents/profile/back/b"}];
  const reserved:typeof files=[];let units=0;
  const reserve=async(_user:string,bytes:number)=>{units+=Math.ceil(bytes/1_000_000);return{release:async()=>{throw new Error("Unfenced release must not run.");}};};
  prisma.activityLog.create=(async(args:{data:{entityId:string;metadata:Record<string,unknown>}})=>{events.push(`marker:${args.data.entityId}`);assert.equal(args.data.metadata.storageCleanupState,"PENDING");assert.equal(args.data.metadata.source,"native-portal");if(failMarker&&args.data.entityId===files[0].storageKey)throw new Error("Database unavailable.");return{id:args.data.entityId};}) as unknown as typeof original;
  const store={delete:async()=>{throw new Error("Direct deletion must not run.");}};
  const recover=async(id:string)=>{assert.ok(events.includes(`marker:${id}`));events.push(`recover:${id}`);return "completed" as const;};
  try{
    await reservePrivateUploadFiles("owner",files,reserve,file=>reserved.push(file));assert.equal(units,2);assert.deepEqual(reserved,files);
    await compensatePrivateUploadFiles("owner","workspace",reserved,store,recover);assert.deepEqual(events,[`marker:${files[0].storageKey}`,`recover:${files[0].storageKey}`,`marker:${files[1].storageKey}`,`recover:${files[1].storageKey}`]);
    events.length=0;failMarker=true;await assert.rejects(compensatePrivateUploadFiles("owner","workspace",reserved,store,recover),/investigation/);assert.ok(!events.includes(`recover:${files[0].storageKey}`));assert.ok(events.includes(`recover:${files[1].storageKey}`));
    const partial:typeof files=[];let calls=0;await assert.rejects(reservePrivateUploadFiles("owner",files,async(user,bytes)=>{if(++calls===2)throw new Error("Quota unavailable.");return reserve(user,bytes);},file=>partial.push(file)),/Quota/);assert.deepEqual(partial,[files[0]]);
    console.log("PASS native compensation: per-file rounded reservations, partial reserve retention, durable marker before recovery, no direct deletion and independent continuation after marker failure.");
  }finally{prisma.activityLog.create=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
